import { redirect } from 'next/navigation';

import { ActionButton } from '@/components/admin/action-button';
import { Panel } from '@/components/admin/panel';
import { getSessionContext } from '@/lib/supabase/context';

import { signOutEverywhere, updateDisplayName } from './actions';
import { NameForm } from './name-form';

export default async function ProfileSettingsPage() {
  const context = await getSessionContext();
  if (!context) redirect('/sign-in');

  const { data: userData } = await context.supabase.auth.getUser();

  const displayName =
    typeof userData.user?.user_metadata.display_name === 'string'
      ? userData.user.user_metadata.display_name
      : '';

  return (
    <div className="flex flex-col gap-8">
      <Panel title="Profile">
        <p className="mb-4 text-sm text-tertiary-foreground">
          Signed in as {context.email ?? 'an unknown address'}.
        </p>
        <NameForm
          action={updateDisplayName}
          fieldName="displayName"
          label="Display name"
          defaultValue={displayName}
          placeholder="Ada Lovelace"
          submitLabel="Save"
          pendingLabel="Saving…"
          savedLabel="Saved"
        />
      </Panel>

      <Panel title="Sessions">
        <ActionButton
          action={signOutEverywhere}
          label="Sign out everywhere"
          pendingLabel="Signing out…"
          variant="outline"
        />
      </Panel>
    </div>
  );
}
