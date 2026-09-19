import { decodeEvents, type ChatEvent, type ChatRequest } from './protocol';

export const CHAT_ENDPOINT = '/api/chat';

const UNEXPLAINED_FAILURE = 'The answer could not be reached. Ask again.';

export type AskDeps = {
  readonly fetch?: typeof fetch;
  readonly signal?: AbortSignal;
};

/** Reads the newline delimited answer stream, handing a JSON refusal on as an error event. */
export async function askChat(
  request: ChatRequest,
  onEvent: (event: ChatEvent) => void,
  deps: AskDeps = {},
): Promise<void> {
  const send = deps.fetch ?? fetch;

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let terminal = false;
  const emit = (event: ChatEvent) => {
    if (event.type === 'done' || event.type === 'error') terminal = true;
    onEvent(event);
  };

  try {
    const response = await send(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: deps.signal,
    });
    if (!response.ok || !response.body) {
      emit({ type: 'error', message: await refusalMessage(response) });
      return;
    }
    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let rest = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const decoded = decodeEvents(rest + decoder.decode(value, { stream: true }));
      rest = decoded.rest;
      for (const event of decoded.events) emit(event);
    }
    if (!terminal) emit({ type: 'error', message: UNEXPLAINED_FAILURE });
  } catch {
    if (!terminal) emit({ type: 'error', message: UNEXPLAINED_FAILURE });
  } finally {
    reader?.releaseLock();
  }
}

async function refusalMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const { message } = body as { message: unknown };
      if (typeof message === 'string') return message;
    }
  } catch {
    return UNEXPLAINED_FAILURE;
  }

  return UNEXPLAINED_FAILURE;
}
