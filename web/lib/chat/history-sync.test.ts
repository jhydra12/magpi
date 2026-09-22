import { describe, expect, it } from 'vitest';

import {
  applyConversationPatches,
  mergeConversationPatch,
  type ConversationListPatch,
} from './history-sync';

const FIRST = '44444444-4444-4444-8444-444444444444';
const SECOND = '55555555-5555-4555-8555-555555555555';

describe('applyConversationPatches', () => {
  it('puts a chat that has not been loaded at the top, newest first', () => {
    const patches = new Map<string, ConversationListPatch>();
    mergeInto(patches, { id: FIRST, title: null, folderId: null });
    mergeInto(patches, { id: SECOND, title: 'Duo launch', folderId: null });

    expect(
      applyConversationPatches([{ id: 'existing', title: 'Older', folder_id: null }], patches),
    ).toEqual([
      { id: SECOND, title: 'Duo launch', folder_id: null },
      { id: FIRST, title: null, folder_id: null },
      { id: 'existing', title: 'Older', folder_id: null },
    ]);
  });

  it('renames a loaded chat without taking it out of its folder', () => {
    const patches = new Map<string, ConversationListPatch>();
    mergeInto(patches, { id: FIRST, title: 'Duo launch' });

    expect(
      applyConversationPatches([{ id: FIRST, title: null, folder_id: 'folder' }], patches),
    ).toEqual([{ id: FIRST, title: 'Duo launch', folder_id: 'folder' }]);
  });
});

function mergeInto(
  patches: Map<string, ConversationListPatch>,
  patch: ConversationListPatch,
): void {
  const next = mergeConversationPatch(patches, patch);
  patches.clear();
  for (const [id, value] of next) patches.set(id, value);
}
