import { ErrorState } from '@/components/app/error-state';
import type { ChatTurn } from '@/lib/chat/turns';

import { AssistantTurn } from './assistant-turn';

export function MessageList({ turns }: { turns: readonly ChatTurn[] }) {
  return (
    <ol className="flex flex-col gap-6">
      {turns.map((turn) => (
        <li key={turn.id}>{renderTurn(turn)}</li>
      ))}
    </ol>
  );
}

function renderTurn(turn: ChatTurn) {
  switch (turn.kind) {
    case 'question':
      return (
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-[var(--radius-panel)] bg-muted px-3.5 py-2 text-sm leading-relaxed text-foreground">
            {turn.content}
          </p>
        </div>
      );
    case 'answer':
      return (
        <AssistantTurn
          content={turn.content}
          citations={turn.citations}
          streaming={turn.streaming}
        />
      );
    case 'failure':
      return <ErrorState title="That question did not get an answer" detail={turn.message} />;
    default: {
      const unhandled: never = turn;
      return unhandled;
    }
  }
}
