import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { subscribeConversationList } from '@/lib/chat/history-sync';
import { encodeEvent, type ChatEvent } from '@/lib/chat/protocol';
import type { ChatTurn } from '@/lib/chat/turns';

const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const MESSAGE_ID = '66666666-6666-4666-8666-666666666666';

const router = { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() };

vi.mock('next/navigation', () => ({ useRouter: () => router }));

const { ConversationView } = await import('./conversation-view');

/** Typing key by key at the default delay times the suite out under load. */
const user = userEvent.setup({ delay: null });

function answerWith(events: readonly ChatEvent[]): typeof fetch {
  const encoder = new TextEncoder();

  return (async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const event of events) controller.enqueue(encoder.encode(encodeEvent(event)));
          controller.close();
        },
      }),
      { status: 200 },
    )) as unknown as typeof fetch;
}

const answered: ChatEvent[] = [
  { type: 'citations', citations: [] },
  { type: 'delta', text: 'Blocked on ENG-4417.' },
  { type: 'done', messageId: MESSAGE_ID },
  { type: 'title', title: 'SSO blockers' },
];

function renderView(
  overrides: { initialTurns?: readonly ChatTurn[]; pendingQuestion?: string } = {},
) {
  render(
    <ConversationView
      conversationId={CONVERSATION_ID}
      initialTurns={overrides.initialTurns ?? []}
      initialTitle={null}
      pendingQuestion={overrides.pendingQuestion ?? null}
    />,
  );
}

beforeEach(() => {
  router.replace.mockClear();
  router.refresh.mockClear();
  vi.stubGlobal('fetch', answerWith(answered));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ConversationView', () => {
  it('shows the stored turns of an existing conversation', () => {
    renderView({
      initialTurns: [
        { kind: 'question', id: 'q1', content: 'What is blocking SSO?' },
        {
          kind: 'answer',
          id: 'a1',
          content: 'Blocked on ENG-4417.',
          citations: [],
          streaming: false,
        },
      ],
    });

    expect(screen.getByText('What is blocking SSO?')).toBeInTheDocument();
    expect(screen.getByText('Blocked on ENG-4417.')).toBeInTheDocument();
  });

  it('asks the question it was handed and streams the answer back', async () => {
    renderView({ pendingQuestion: 'What is blocking SSO?' });

    expect(await screen.findByText('What is blocking SSO?')).toBeInTheDocument();
    expect(await screen.findByText('Blocked on ENG-4417.')).toBeInTheDocument();
    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(`/chat/${CONVERSATION_ID}`, { scroll: false }),
    );
  });

  it('takes the question out of the address bar once it has been asked', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState');
    renderView({ pendingQuestion: 'What is blocking SSO?' });

    await waitFor(() =>
      expect(replaceState).toHaveBeenCalledWith(
        window.history.state,
        '',
        `/chat/${CONVERSATION_ID}`,
      ),
    );
    replaceState.mockRestore();
  });

  it('still streams the answer when the effect is replayed', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', async () => {
      calls += 1;
      return answerWith(answered)('/api/chat');
    });

    render(
      <StrictMode>
        <ConversationView
          conversationId={CONVERSATION_ID}
          initialTurns={[]}
          initialTitle={null}
          pendingQuestion="What is blocking SSO?"
        />
      </StrictMode>,
    );

    expect(await screen.findByText('Blocked on ENG-4417.')).toBeInTheDocument();
    expect(calls).toBe(1);
  });

  it('hands the new title to the sidebar while the answer is still on screen', async () => {
    const titles: Array<string | null | undefined> = [];
    const unsubscribe = subscribeConversationList((patch) => titles.push(patch.title));
    renderView({ pendingQuestion: 'What is blocking SSO?' });

    expect(
      await screen.findByRole('heading', { name: 'SSO blockers' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(titles).toEqual(['SSO blockers']);
    unsubscribe();
  });

  it('shows the name the conversation was given', async () => {
    renderView({ pendingQuestion: 'What is blocking SSO?' });

    expect(
      await screen.findByRole('heading', { name: 'SSO blockers' }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('asks a follow-up from the composer', async () => {
    renderView();

    await user.type(screen.getByLabelText('Ask a question'), 'And Q1?{Enter}');

    expect(await screen.findByText('And Q1?')).toBeInTheDocument();
    expect(await screen.findByText('Blocked on ENG-4417.')).toBeInTheDocument();
  });

  it('says so when the answer fails, without losing the question', async () => {
    vi.stubGlobal(
      'fetch',
      answerWith([{ type: 'error', message: 'Something went wrong answering that.' }]),
    );
    renderView();

    await user.type(screen.getByLabelText('Ask a question'), 'And Q1?{Enter}');

    expect(await screen.findByText('And Q1?')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Something went wrong answering that.',
    );
  });
});

it('allows another question after a network failure', async () => {
  vi.stubGlobal('fetch', async () => {
    throw new Error('offline');
  });
  renderView();
  await user.type(screen.getByLabelText('Ask a question'), 'First?{Enter}');
  expect(await screen.findByRole('alert')).toHaveTextContent('The answer could not be reached');
  expect(screen.getByLabelText('Ask a question')).toBeEnabled();
  vi.stubGlobal('fetch', answerWith(answered));
  await user.type(screen.getByLabelText('Ask a question'), 'Retry?{Enter}');
  expect(await screen.findByText('Blocked on ENG-4417.')).toBeInTheDocument();
});

it('aborts the transport when the conversation unmounts', async () => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal(
    'fetch',
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init.signal;
        if (signal) {
          signals.push(signal);
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }
      }),
  );
  const view = render(
    <ConversationView
      conversationId={CONVERSATION_ID}
      initialTurns={[]}
      initialTitle={null}
      pendingQuestion="Question"
    />,
  );
  await waitFor(() => expect(signals).toHaveLength(1));
  view.unmount();
  expect(signals[0].aborted).toBe(true);
  expect(router.refresh).not.toHaveBeenCalled();
});
