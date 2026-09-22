'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { createConversationAction } from '@/app/(app)/chat/actions';
import { publishConversation } from '@/lib/chat/history-sync';

import { Composer } from './composer';
import { SpaceFilter, type SpaceOption } from './space-filter';

type NewConversationProps = {
  readonly spaces: readonly SpaceOption[];
};

/** The first question opens the conversation and travels to it in the query string. */
export function NewConversation({ spaces }: NewConversationProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function open(question: string) {
    setOpening(true);
    setFailure(null);

    const state = await createConversationAction({
      spaceFilter: selected.length === 0 ? null : [...selected],
    });

    if (state.status !== 'success') {
      setOpening(false);
      setFailure(state.status === 'error' ? state.message : null);
      return;
    }

    publishConversation({ id: state.data, title: null, folderId: null });
    router.push(`/chat/${state.data}?ask=${encodeURIComponent(question)}`);
  }

  return (
    <div className="flex flex-col gap-2">
      <Composer
        onAsk={(question) => void open(question)}
        busy={opening}
        placeholder="What do you want to know?"
        toolbar={
          <SpaceFilter spaces={spaces} selected={selected} onChange={setSelected} variant="ghost" />
        }
      />

      <p className="px-1 text-xs text-tertiary-foreground">
        {selected.length === 0
          ? 'Searching every space you can see.'
          : 'Searching the spaces you picked.'}
      </p>

      {failure ? (
        <p role="alert" className="px-1 text-sm text-destructive-600">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
