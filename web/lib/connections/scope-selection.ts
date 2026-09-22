import { z } from 'zod';

import { err, ok, type Result } from '@/lib/result';

/** Where each channel, folder or workspace lands. connections-scopes and connections-claim write it. */
const scopeItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
});

const populatedSchema = z.object({
  kind: z.enum(['channel', 'folder', 'workspace', 'repository']),
  available: z.array(scopeItemSchema),
  /** Unit id to space id. A unit that is absent is read by nobody. */
  routes: z.record(z.string(), z.string().uuid()),
});

export type ScopeSelectionKind = z.infer<typeof populatedSchema>['kind'];
export type ScopeItem = z.infer<typeof scopeItemSchema>;

export type ScopeRoutes = Readonly<Record<string, string>>;

export type ScopeSelection =
  | { readonly kind: 'unset' }
  | {
      readonly kind: 'set';
      readonly selectionKind: ScopeSelectionKind;
      readonly available: readonly ScopeItem[];
      readonly routes: ScopeRoutes;
    };

const UNSET: ScopeSelection = { kind: 'unset' };

export function parseScopeSelection(value: unknown): Result<ScopeSelection, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return err('The stored scope selection is not an object.');
  }
  if (Object.keys(value).length === 0) return ok(UNSET);

  const parsed = populatedSchema.safeParse(value);
  if (!parsed.success) return err('The stored scope selection does not match the schema.');

  return ok({
    kind: 'set',
    selectionKind: parsed.data.kind,
    available: parsed.data.available,
    routes: parsed.data.routes,
  });
}

const NOUNS: Record<ScopeSelectionKind, string> = {
  channel: 'channels',
  folder: 'folders',
  workspace: 'workspaces',
  repository: 'repositories',
};

export function describeScopeSelection(selection: ScopeSelection): string {
  if (selection.kind === 'unset') return 'Nothing chosen yet';

  const noun = NOUNS[selection.selectionKind];
  const routed = Object.keys(selection.routes).length;
  if (routed === 0) return `No ${noun} routed`;

  const spaces = new Set(Object.values(selection.routes)).size;
  const place = spaces === 1 ? '1 space' : `${spaces} spaces`;
  return `${routed} of ${selection.available.length} ${noun} into ${place}`;
}

/** What an empty selection means for this kind of source, keyed on the kind, not the provider. */
export function describeEmptySelection(kind: ScopeSelectionKind): string | null {
  switch (kind) {
    case 'channel':
      return 'Send a channel to a space and Digital Brain starts reading it.';
    case 'folder':
      return 'Send a folder to a space and Digital Brain starts reading it.';
    case 'workspace':
      return 'Send this workspace to a space and Digital Brain starts reading it.';
    case 'repository':
      return 'Send a repository to a space and Digital Brain starts reading its markdown.';
    default: {
      const unhandled: never = kind;
      throw new Error(`Unhandled scope selection kind: ${String(unhandled)}`);
    }
  }
}
