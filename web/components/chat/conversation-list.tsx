'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { ConversationFolder } from '@/hooks/use-conversation-folders';
import { startConversationDrag } from '@/lib/chat/drag';
import type { Tables } from '@/lib/database.types';
import { cn } from '@/lib/utils';

import { ConversationMenu } from './conversation-menu';

export type SidebarConversation = Pick<Tables<'conversations'>, 'id' | 'title' | 'folder_id'>;

type ConversationListProps = {
  readonly conversations: readonly SidebarConversation[];
  readonly folders: readonly ConversationFolder[];
  readonly onChanged: () => void;
};

/** The links themselves, shown inside a folder and at the top level alike. */
export function ConversationList({ conversations, folders, onChanged }: ConversationListProps) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col">
      {conversations.map((conversation) => {
        const href = `/chat/${conversation.id}`;
        const isOpen = pathname === href;
        const title = conversation.title ?? 'Untitled conversation';

        return (
          <li
            key={conversation.id}
            // Dragging moves a chat between folders. The menu beside it does the same by
            // keyboard, because a drag is reachable by mouse and nothing else.
            draggable
            onDragStart={(event) =>
              startConversationDrag(event.dataTransfer, {
                id: conversation.id,
                folderId: conversation.folder_id,
              })
            }
            className="group flex items-center gap-1"
          >
            <Link
              href={href}
              aria-current={isOpen ? 'page' : undefined}
              className={cn(
                'min-w-0 flex-1 truncate rounded-lg px-2.5 py-1 text-sm transition-colors motion-reduce:transition-none',
                isOpen
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {title}
            </Link>
            <ConversationMenu
              conversationId={conversation.id}
              title={title}
              folderId={conversation.folder_id}
              folders={folders}
              onChanged={onChanged}
            />
          </li>
        );
      })}
    </ul>
  );
}
