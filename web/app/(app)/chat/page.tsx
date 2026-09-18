import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/app/page-header';
import { NewConversation } from '@/components/chat/new-conversation';
import { getSessionContext } from '@/lib/supabase/context';

export default async function ChatPage() {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const spaces = await context.supabase.from('spaces').select('id, name').order('name');

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Ask your knowledge base" />

      <NewConversation spaces={spaces.data ?? []} />
    </div>
  );
}
