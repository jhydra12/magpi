import { Panel } from '@/components/admin/panel';
import { MODELS } from '@/lib/models';

export const metadata = { title: 'Embeddings' };

export default function EmbeddingsSettingsPage() {
  return (
    <Panel title="Embeddings">
      <div className="flex max-w-[var(--measure-prose)] flex-col gap-3 text-sm">
        <p className="text-foreground">
          Every document you connect is turned into numbers so it can be searched by meaning rather
          than by keyword. Digital Brain uses <code className="text-brand">{MODELS.embedding}</code>
          , and the account it bills is ours.
        </p>
        <p className="text-tertiary-foreground">
          Bringing your own key is not built yet. When it is, it will live here, and the model your
          documents were read with will be recorded against them, because changing it means reading
          everything again.
        </p>
      </div>
    </Panel>
  );
}
