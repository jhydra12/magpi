'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef } from 'react';

import { askChat } from '@/lib/chat/client';
import { chatReducer, initialChatState, type ChatTurn } from '@/lib/chat/turns';

import { Composer } from './composer';
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
          if (!controller.signal.aborted) dispatch({ type: 'event', event });
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      // The history sidebar is server rendered, so a new title reaches it here.
      router.refresh();
    },
    [conversationId, router],
  );

  useEffect(() => {
    if (started.current || pendingQuestion === null) return;

    started.current = true;
    router.replace(`/chat/${conversationId}`, { scroll: false });
    void ask(pendingQuestion);
  }, [ask, conversationId, pendingQuestion, router]);

  useEffect(() => {
    const element = transcript.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [state.turns]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <h1 className="font-heading text-xl leading-tight font-medium text-foreground">
        {state.title ?? 'New conversation'}
      </h1>

      <div ref={transcript} className="min-h-0 flex-1 overflow-y-auto pr-1">
        <MessageList turns={state.turns} />
      </div>

      <Composer
        onAsk={(question) => void ask(question)}
        busy={state.asking}
        placeholder="Ask a follow-up"
      />
    </div>
  );
}
