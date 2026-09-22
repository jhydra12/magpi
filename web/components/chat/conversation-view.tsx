'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef } from 'react';

import { askChat } from '@/lib/chat/client';
import { publishConversation } from '@/lib/chat/history-sync';
import { chatReducer, initialChatState, type ChatTurn } from '@/lib/chat/turns';

import { Composer } from './composer';
import { LiveTitle } from './live-title';
import { MessageList } from './message-list';

type ConversationViewProps = {
  readonly conversationId: string;
  readonly initialTurns: readonly ChatTurn[];
  readonly initialTitle: string | null;
  /** Carried over from the screen where the conversation was opened. */
  readonly pendingQuestion: string | null;
};

export function ConversationView({
  conversationId,
  initialTurns,
  initialTitle,
  pendingQuestion,
}: ConversationViewProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(chatReducer, initialChatState(initialTurns, initialTitle));
  const transcript = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  const ask = useCallback(
    async (question: string) => {
      request.current?.abort();
      const controller = new AbortController();
      request.current = controller;
      dispatch({ type: 'ask', question, turnId: crypto.randomUUID() });
      await askChat(
        { conversationId, message: question },
        (event) => {
          if (controller.signal.aborted) return;
          dispatch({ type: 'event', event });
          if (event.type === 'title') {
            publishConversation({ id: conversationId, title: event.title });
          }
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      // replaceState dropped ?ask= without a navigation. Tell the router, or the
      // next refresh puts the question back on the URL and asks it again.
      router.replace(`/chat/${conversationId}`, { scroll: false });
    },
    [conversationId, router],
  );

  useEffect(() => {
    if (started.current || pendingQuestion === null) return;

    // Strict mode runs this effect and its cleanup before the real run. Starting
    // the request in that pass aborts it, and a flag set up front refuses to
    // start another, so the screen stays on "Reading your documents…".
    const timer = window.setTimeout(() => {
      started.current = true;
      window.history.replaceState(window.history.state, '', `/chat/${conversationId}`);
      void ask(pendingQuestion);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [ask, conversationId, pendingQuestion]);

  useEffect(() => {
    const element = transcript.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [state.turns]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center">
        <h1 className="min-w-0 text-sm font-medium text-foreground">
          <LiveTitle text={state.title ?? 'New conversation'} />
        </h1>
      </header>

      <div ref={transcript} className="min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto">
        <div className="mx-auto w-full max-w-[var(--measure-prose)] py-8">
          <MessageList turns={state.turns} />
        </div>
      </div>

      <div className="shrink-0 pb-5">
        <div className="mx-auto w-full max-w-[var(--measure-prose)]">
          <Composer
            onAsk={(question) => void ask(question)}
            busy={state.asking}
            placeholder="Ask a follow-up"
            rows={1}
          />
        </div>
      </div>
    </div>
  );
}
