export type ConversationListPatch = {
  readonly id: string;
  readonly title?: string | null;
  readonly folderId?: string | null;
};

export type ListedConversation = {
  readonly id: string;
  readonly title: string | null;
  readonly folder_id: string | null;
};

type Listener = (patch: ConversationListPatch) => void;

const listeners = new Set<Listener>();

/** The sidebar is a one-shot client query, so a new chat or its title has to be handed over. */
export function subscribeConversationList(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishConversation(patch: ConversationListPatch): void {
  for (const listener of listeners) listener(patch);
}

export function mergeConversationPatch(
  current: ReadonlyMap<string, ConversationListPatch>,
  patch: ConversationListPatch,
): ReadonlyMap<string, ConversationListPatch> {
  const previous = current.get(patch.id);
  const next = new Map(current);
  next.set(patch.id, {
    id: patch.id,
    title: patch.title !== undefined ? patch.title : previous?.title,
    folderId: patch.folderId !== undefined ? patch.folderId : previous?.folderId,
  });
  return next;
}

/** Rows already loaded keep their place. A chat that is not loaded yet is added at the top. */
export function applyConversationPatches(
  rows: readonly ListedConversation[],
  patches: ReadonlyMap<string, ConversationListPatch>,
): ListedConversation[] {
  const seen = new Set<string>();
  const merged = rows.map((row) => {
    seen.add(row.id);
    const patch = patches.get(row.id);
    if (!patch) return { id: row.id, title: row.title, folder_id: row.folder_id };
    return {
      id: row.id,
      title: patch.title !== undefined ? patch.title : row.title,
      folder_id: patch.folderId !== undefined ? patch.folderId : row.folder_id,
    };
  });

  const added: ListedConversation[] = [];
  for (const patch of patches.values()) {
    if (seen.has(patch.id)) continue;
    added.push({
      id: patch.id,
      title: patch.title ?? null,
      folder_id: patch.folderId ?? null,
    });
  }

  // Patches arrive oldest first. A chat opened a moment ago belongs at the top.
  return [...added.reverse(), ...merged];
}
