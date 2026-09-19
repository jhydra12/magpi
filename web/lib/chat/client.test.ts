import { describe, expect, it } from 'vitest';

import { askChat, CHAT_ENDPOINT } from './client';
import { encodeEvent, type ChatEvent } from './protocol';

const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const MESSAGE_ID = '66666666-6666-4666-8666-666666666666';

function streamingResponse(frames: readonly string[]): Response {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const frame of frames) controller.enqueue(encoder.encode(frame));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
  );
}

const request = { conversationId: CONVERSATION_ID, message: 'What is blocking SSO?' };

describe('askChat', () => {
  it('posts the question to the streaming route', async () => {
    const seen: { url: string; body: unknown }[] = [];

    await askChat(request, () => {}, {
      fetch: async (url, init) => {
        seen.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return streamingResponse([]);
      },
    });

    expect(seen[0]).toEqual({ url: CHAT_ENDPOINT, body: request });
  });

  it('reports every event in the order it arrived', async () => {
    const events: ChatEvent[] = [
      { type: 'citations', citations: [] },
      { type: 'delta', text: 'Blocked on ' },
      { type: 'delta', text: 'ENG-4417.' },
      { type: 'done', messageId: MESSAGE_ID },
    ];
    const seen: ChatEvent[] = [];

    await askChat(request, (event) => seen.push(event), {
      fetch: async () => streamingResponse(events.map(encodeEvent)),
    });

    expect(seen).toEqual(events);
  });

  it('reassembles an event split across two reads', async () => {
    const whole = encodeEvent({ type: 'delta', text: 'streamed' });
    const seen: ChatEvent[] = [];

    await askChat(request, (event) => seen.push(event), {
      fetch: async () => streamingResponse([whole.slice(0, 6), whole.slice(6)]),
    });

    expect(seen).toEqual([
      { type: 'delta', text: 'streamed' },
      { type: 'error', message: 'The answer could not be reached. Ask again.' },
    ]);
  });

  it('turns a refusal into an error event carrying the reason', async () => {
    const seen: ChatEvent[] = [];

    await askChat(request, (event) => seen.push(event), {
      fetch: async () =>
        Response.json(
          { code: 'rate_limited', message: 'You are asking faster than we can answer.' },
          { status: 429 },
        ),
    });

    expect(seen).toEqual([{ type: 'error', message: 'You are asking faster than we can answer.' }]);
  });

  it('still says something when a refusal carries no reason', async () => {
    const seen: ChatEvent[] = [];

    await askChat(request, (event) => seen.push(event), {
      fetch: async () => new Response('gateway timeout', { status: 504 }),
    });

    expect(seen).toEqual([
      { type: 'error', message: 'The answer could not be reached. Ask again.' },
    ]);
  });
});

describe('chat transport recovery', () => {
  it('reports a rejected fetch as a terminal error', async () => {
    const seen: ChatEvent[] = [];
    await askChat(request, (event) => seen.push(event), {
      fetch: async () => {
        throw new Error('offline');
      },
    });
    expect(seen).toEqual([
      { type: 'error', message: 'The answer could not be reached. Ask again.' },
    ]);
  });
  it('reports a failed stream and releases its reader', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('offline'));
      },
    });
    const seen: ChatEvent[] = [];
    await askChat(request, (event) => seen.push(event), { fetch: async () => new Response(body) });
    expect(seen.at(-1)?.type).toBe('error');
    expect(body.locked).toBe(false);
  });
  it('reports EOF without a terminal event', async () => {
    const seen: ChatEvent[] = [];
    await askChat(request, (event) => seen.push(event), {
      fetch: async () => streamingResponse([]),
    });
    expect(seen.at(-1)?.type).toBe('error');
  });
});
