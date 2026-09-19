import { Panel } from '@/components/admin/panel';
import { SectionHeader } from '@/components/admin/section-header';
import { DemoReset } from '@/components/admin/demo-reset';
import { resolveAdminAccess } from '@/lib/analytics/access';

export default async function DemoPage() {
  const access = await resolveAdminAccess();
  if (access.kind !== 'granted') return null;

  return (
    <div className="flex flex-col gap-10">
      <SectionHeader title="Demo" />
      <Panel title="Reset demo">
        <div className="flex flex-col gap-4">
          <p className="max-w-xl text-sm text-muted-foreground">
            This button resets the demo to the starting state.
          </p>
          <DemoReset />
        </div>
      </Panel>
    </div>
  );
}
