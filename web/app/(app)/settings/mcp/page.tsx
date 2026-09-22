import { Panel } from '@/components/admin/panel';
import { CopyButton } from '@/components/app/copy-button';
import { publicEnv } from '@/lib/env';

export const metadata = { title: 'MCP and API' };

/** Where an agent connects. The function is served from the project's own functions host. */
function serverUrl(): string {
  return `${publicEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/mcp-server`;
}

export default function McpSettingsPage() {
  const url = serverUrl();

  return (
    <div className="flex flex-col gap-8">
      <Panel title="Connect an agent">
        <div className="flex max-w-[var(--measure-prose)] flex-col gap-4 text-sm">
          <p className="text-foreground">
            Magpi speaks MCP, so an agent can search everything you have connected instead of
            reading each source itself. Give it this address.
          </p>

          <div className="flex items-center gap-2 rounded-[var(--radius-panel)] border border-border bg-background py-2 pr-2 pl-4">
            <code className="min-w-0 flex-1 truncate font-mono text-[15px] text-foreground">
              {url}
            </code>
            <CopyButton value={url} />
          </div>

          <p className="text-tertiary-foreground">
            The first time an agent connects, it will send you back here to approve it. It then acts
            as you: it sees the spaces you are in and nothing else, and you can take the permission
            back at any time.
          </p>
        </div>
      </Panel>

      <Panel title="What an agent can do">
        <dl className="flex max-w-[var(--measure-prose)] flex-col gap-3 text-sm">
          {[
            ['search', 'Ask a question across every space you can see.'],
            ['get_document', 'Read one document in full when a passage is not enough.'],
            ['list_spaces', 'See which spaces exist, to narrow a search.'],
            ['add_note', 'Write a note into a space you are a member of.'],
            ['whoami', 'Check which account it is acting as.'],
          ].map(([name, what]) => (
            <div key={name} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
              <dt className="sm:w-32 sm:shrink-0">
                <code className="text-xs text-brand">{name}</code>
              </dt>
              <dd className="text-tertiary-foreground">{what}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
