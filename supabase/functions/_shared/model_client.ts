// The one place a model is called. Every call writes a model_calls row.

import type { SupabaseClient } from '@supabase/supabase-js';

import { ApiError } from './errors.ts';
import type { ClockDeps, HttpDeps } from './deps.ts';
import { type CompletionPurpose, EMBEDDING_DIMENSIONS, MODELS } from './models.ts';

const API_BASE = 'https://api.openai.com/v1';

export interface EmbedInput {
  orgId: string;
  texts: string[];
}

export interface CompleteInput {
  orgId: string;
  purpose: CompletionPurpose;
  system: string;
  user: string;
  maxOutputTokens?: number;
  /** Ask the provider to guarantee a JSON object back. The prompt has to name JSON as well. */
  json?: boolean;
}

export interface ModelRunner {
  embed(input: EmbedInput): Promise<number[][]>;
  complete(input: CompleteInput): Promise<string>;
}

export interface ModelRunnerDeps extends HttpDeps, ClockDeps {
  db: SupabaseClient;
  apiKey: string;
}

interface Usage {
  inputTokens: number;
  outputTokens: number;
}

function readUsage(payload: Record<string, unknown>): Usage {
  const usage = payload.usage;
  if (typeof usage !== 'object' || usage === null) return { inputTokens: 0, outputTokens: 0 };
  const record = usage as Record<string, unknown>;
  const read = (key: string): number => {
    const value = record[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };
  return {
    inputTokens: read('prompt_tokens') + read('input_tokens'),
    outputTokens: read('completion_tokens') + read('output_tokens'),
  };
}

/** Logs the call, failures included. Awaited so the isolate cannot end before the insert. */
async function record(
  deps: ModelRunnerDeps,
  row: {
    orgId: string;
    purpose: string;
    model: string;
    usage: Usage;
    startedAt: number;
    succeeded: boolean;
  },
): Promise<void> {
  const { error } = await deps.db.from('model_calls').insert({
    org_id: row.orgId,
    purpose: row.purpose,
    model: row.model,
    input_tokens: row.usage.inputTokens,
    output_tokens: row.usage.outputTokens,
    latency_ms: Math.max(0, Math.round(deps.now().getTime() - row.startedAt)),
    succeeded: row.succeeded,
  });
  if (error) console.error('model call could not be logged', row.purpose, error.message);
}

async function callOpenAi(
  deps: ModelRunnerDeps,
  path: string,
  body: unknown,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await deps.fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${deps.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(502, 'model_unreachable', 'the model provider could not be reached');
  }

  if (!response.ok) {
    // Status only, because an error body can quote the prompt back.
    console.error('model call refused', { path, status: response.status });
    throw new ApiError(502, 'model_error', 'the model provider refused the request');
  }

  const payload: unknown = await response.json().catch(() => null);
  if (typeof payload !== 'object' || payload === null) {
    throw new ApiError(502, 'model_error', 'the model provider returned an unreadable response');
  }
  return payload as Record<string, unknown>;
}

function readEmbeddings(payload: Record<string, unknown>, expected: number): number[][] {
  const data = payload.data;
  if (!Array.isArray(data) || data.length !== expected) {
    throw new ApiError(502, 'model_error', 'the embedding response did not match the request');
  }

  return data.map((entry) => {
    const vector = typeof entry === 'object' && entry !== null
      ? (entry as Record<string, unknown>).embedding
      : null;
    if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
      // Failing here says which call produced the wrong width.
      throw new ApiError(502, 'model_error', 'the embedding response had the wrong dimension');
    }
    return vector.map((value) => (typeof value === 'number' ? value : 0));
  });
}

function readCompletion(payload: Record<string, unknown>): string {
  const choices = payload.choices;
  const first = Array.isArray(choices) && choices.length > 0 ? choices[0] : null;
  const message = typeof first === 'object' && first !== null
    ? (first as Record<string, unknown>).message
    : null;
  const content = typeof message === 'object' && message !== null
    ? (message as Record<string, unknown>).content
    : null;
  if (typeof content !== 'string') {
    throw new ApiError(502, 'model_error', 'the model returned no content');
  }

  // A truncated answer is still well-formed text and never well-formed JSON, so without this the
  // caller reports an unreadable model rather than an output cap that is too low.
  const reason = typeof first === 'object' && first !== null
    ? (first as Record<string, unknown>).finish_reason
    : null;
  if (reason === 'length') {
    throw new ApiError(502, 'model_answer_truncated', 'the model ran out of room mid-answer');
  }

  return content;
}

export function createModelRunner(deps: ModelRunnerDeps): ModelRunner {
  async function run<T>(
    orgId: string,
    purpose: string,
    model: string,
    call: () => Promise<Record<string, unknown>>,
    read: (payload: Record<string, unknown>) => T,
  ): Promise<T> {
    const startedAt = deps.now().getTime();
    let usage: Usage = { inputTokens: 0, outputTokens: 0 };
    try {
      const payload = await call();
      usage = readUsage(payload);
      const result = read(payload);
      await record(deps, {
        orgId,
        purpose,
        model,
        usage,
        startedAt,
        succeeded: true,
      });
      return result;
    } catch (err) {
      await record(deps, {
        orgId,
        purpose,
        model,
        usage,
        startedAt,
        succeeded: false,
      });
      throw err;
    }
  }

  return {
    embed({ orgId, texts }) {
      if (texts.length === 0) return Promise.resolve([]);
      return run(
        orgId,
        'embedding',
        MODELS.embedding,
        () =>
          callOpenAi(deps, '/embeddings', {
            model: MODELS.embedding,
            input: texts,
            dimensions: EMBEDDING_DIMENSIONS,
          }),
        (payload) => readEmbeddings(payload, texts.length),
      );
    },

    complete({ orgId, purpose, system, user, maxOutputTokens, json }) {
      const model = MODELS[purpose];
      return run(
        orgId,
        purpose,
        model,
        () =>
          callOpenAi(deps, '/chat/completions', {
            model,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
            ...(maxOutputTokens ? { max_completion_tokens: maxOutputTokens } : {}),
            ...(json ? { response_format: { type: 'json_object' } } : {}),
          }),
        readCompletion,
      );
    },
  };
}
