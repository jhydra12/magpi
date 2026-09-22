'use client';

import { ArrowUp } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

type ComposerProps = {
  readonly onAsk: (question: string) => void;
  readonly busy: boolean;
  readonly placeholder: string;
  readonly rows?: number;
  readonly toolbar?: ReactNode;
};

export function Composer({ onAsk, busy, placeholder, rows = 2, toolbar }: ComposerProps) {
  const [question, setQuestion] = useState('');
  const canAsk = question.trim() !== '' && !busy;

  function ask(event?: FormEvent) {
    event?.preventDefault();
    if (!canAsk) return;

    onAsk(question.trim());
    setQuestion('');
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    ask();
  }

  return (
    <form
      onSubmit={ask}
      className={cn(
        'magpi-composer rounded-[var(--radius-panel)] border border-border bg-background p-2',
        toolbar ? 'flex flex-col' : 'flex items-end gap-1',
      )}
    >
      <Textarea
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={onKeyDown}
        aria-label="Ask a question"
        placeholder={placeholder}
        rows={rows}
        className={cn(
          'resize-none border-0 bg-transparent px-2 py-1.5 text-sm shadow-none ring-0 outline-none placeholder:text-muted-foreground focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none',
          rows === 1 ? 'min-h-10' : 'min-h-16',
        )}
      />
      <div className={cn('flex items-center gap-2 px-1', toolbar && 'justify-between')}>
        {toolbar ? <div className="min-w-0">{toolbar}</div> : null}
        <Button
          type="submit"
          size="icon"
          disabled={!canAsk}
          aria-label="Ask"
          className={cn(
            'size-8 shrink-0 rounded-full',
            !canAsk && 'bg-muted text-tertiary-foreground',
          )}
        >
          <ArrowUp />
        </Button>
      </div>
    </form>
  );
}
