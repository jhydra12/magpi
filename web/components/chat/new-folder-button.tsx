'use client';

import { FolderPlus } from 'lucide-react';
import { useState, useTransition } from 'react';

import { createFolderAction } from '@/app/(app)/chat/actions';
import { Button } from '@/components/ui/button';

import { FolderFormDialog, type FolderDraft } from './folder-form-dialog';

type NewFolderButtonProps = {
  readonly onCreated: () => void;
};

/** Makes a folder from a name and a colour, starting on gray. */
export function NewFolderButton({ onCreated }: NewFolderButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create(draft: FolderDraft) {
    startTransition(async () => {
      const state = await createFolderAction({ name: draft.name, color: draft.color });
      if (state.status === 'error') return setFailure(state.message);

      setIsOpen(false);
      onCreated();
    });
  }

  function open() {
    setFailure(null);
    setIsOpen(true);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="New folder"
        className="size-7 text-tertiary-foreground hover:text-foreground"
        onClick={open}
      >
        <FolderPlus />
      </Button>

      <FolderFormDialog
        open={isOpen}
        heading="New folder"
        submitLabel="Create"
        initial={{ name: '', color: 'gray' }}
        failure={failure}
        pending={pending}
        onOpenChange={setIsOpen}
        onSubmit={create}
      />
    </>
  );
}
