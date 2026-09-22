import { redirect } from 'next/navigation';

import { MagpieMark } from '@/components/brand/magpie-mark';
import { NewConversation } from '@/components/chat/new-conversation';
import { getSessionContext } from '@/lib/supabase/context';

export default async function ChatPage() {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const spaces = await context.supabase.from('spaces').select('id, name').order('name');

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
      <div className="flex w-full max-w-[var(--measure-prose)] flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <MagpieMark size={36} />
          <h1 className="font-heading text-2xl font-medium tracking-tight text-balance text-foreground">
            Ask your knowledge base
          </h1>
        </div>

        <div className="w-full">
          <NewConversation spaces={spaces.data ?? []} />
        </div>
      </div>
    </div>
  );
}
