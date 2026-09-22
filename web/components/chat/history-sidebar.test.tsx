import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConversationFolder } from '@/hooks/use-conversation-folders';
import type { ActionState } from '@/lib/actions/state';
import { publishConversation } from '@/lib/chat/history-sync';

const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const FOLDER_ID = '55555555-5555-4555-8555-555555555555';

type SidebarRow = { id: string; title: string | null; folder_id: string | null };

type QueryState = {
  data: SidebarRow[];
  isLoading: boolean;
  error: Error | null;
  hasMore: boolean;
};

const query: QueryState = { data: [], isLoading: false, error: null, hasMore: false };
const fetchNextPage = vi.fn();
const queryKeys: unknown[] = [];
const sorts: string[] = [];

const folderQuery = {
  folders: [] as ConversationFolder[],
  error: null as Error | null,
  keys: [] as number[],
};

const page = { pathname: '/chat' };

vi.mock('next/navigation', () => ({ usePathname: () => page.pathname }));

type QueryArgs = {
  trailingQueryKey: unknown;
  trailingQuery: (builder: { order: (column: string) => string }) => string;
};

vi.mock('@/hooks/use-infinite-query', () => ({
  useInfiniteQuery: ({ trailingQueryKey, trailingQuery }: QueryArgs) => {
    queryKeys.push(trailingQueryKey);
    sorts.push(trailingQuery({ order: (column) => column }));
    return { ...query, fetchNextPage };
  },
}));

vi.mock('@/hooks/use-conversation-folders', () => ({
  useConversationFolders: (reloadKey: number) => {
    folderQuery.keys.push(reloadKey);
    return { folders: folderQuery.folders, isLoading: false, error: folderQuery.error };
  },
}));

const moves: { conversationId: string; folderId: string | null }[] = [];

vi.mock('@/app/(app)/chat/actions', () => ({
  createFolderAction: async () => ({ status: 'success', data: FOLDER_ID }) as ActionState<string>,
  renameFolderAction: async () => ({ status: 'success', data: 'Pricing' }) as ActionState<string>,
  deleteFolderAction: async () => ({ status: 'success', data: FOLDER_ID }) as ActionState<string>,
  moveConversationAction: async (input: { conversationId: string; folderId: string | null }) => {
    moves.push(input);
    return { status: 'success', data: input.folderId } as ActionState<string | null>;
  },
}));

// The real menu is covered on its own. Here it is one button standing in for a saved rename.
vi.mock('./conversation-menu', () => ({
  ConversationMenu: ({ title, onChanged }: { title: string; onChanged: () => void }) => (
    <button type="button" onClick={onChanged}>{`menu for ${title}`}</button>
  ),
}));

const { HistorySidebar } = await import('./history-sidebar');

const user = userEvent.setup({ delay: null });

const conversation = (overrides: Partial<SidebarRow> = {}): SidebarRow => ({
  id: CONVERSATION_ID,
  title: 'SSO blockers',
  folder_id: null,
  ...overrides,
});

const folder = (overrides: Partial<ConversationFolder> = {}): ConversationFolder => ({
  id: FOLDER_ID,
  name: 'Pricing',
  color: 'gray',
  ...overrides,
});

beforeEach(() => {
  query.data = [conversation()];
  query.isLoading = false;
  query.error = null;
  query.hasMore = false;
  folderQuery.folders = [];
  folderQuery.error = null;
  folderQuery.keys = [];
  queryKeys.length = 0;
  sorts.length = 0;
  page.pathname = '/chat';
  fetchNextPage.mockClear();
  moves.length = 0;
});

/** jsdom has no DataTransfer, and the drag carries everything the drop needs to know. */
function dataTransfer() {
  const held = new Map<string, string>();
  return {
    effectAllowed: 'none',
    dropEffect: 'none',
    setData: (type: string, value: string) => held.set(type, value),
    getData: (type: string) => held.get(type) ?? '',
  };
}

/** Picks a conversation row up and drops it on a target, the way a mouse would. */
function drag(row: HTMLElement, onto: HTMLElement) {
  const transfer = dataTransfer();
  fireEvent.dragStart(row, { dataTransfer: transfer });
  fireEvent.dragOver(onto, { dataTransfer: transfer });
  fireEvent.drop(onto, { dataTransfer: transfer });
  return transfer;
}

describe('HistorySidebar', () => {
  it('links each conversation to itself', () => {
    render(<HistorySidebar />);

    expect(screen.getByRole('link', { name: 'SSO blockers' })).toHaveAttribute(
      'href',
      `/chat/${CONVERSATION_ID}`,
    );
  });

  it('puts the newest conversation first', () => {
    render(<HistorySidebar />);

    expect(sorts).toContain('updated_at');
  });

  it('marks the conversation that is open', () => {
    page.pathname = `/chat/${CONVERSATION_ID}`;
    render(<HistorySidebar />);

    expect(screen.getByRole('link', { name: 'SSO blockers' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('adds a conversation as it is opened, then renames it without reading the list again', () => {
    query.data = [];
    render(<HistorySidebar />);

    act(() => publishConversation({ id: CONVERSATION_ID, title: null, folderId: null }));

    expect(screen.getByRole('link', { name: 'Untitled conversation' })).toBeInTheDocument();
    expect(screen.queryByText('Nothing asked yet.')).toBeNull();

    act(() => publishConversation({ id: CONVERSATION_ID, title: 'Duo launch' }));

    expect(screen.getByRole('link', { name: 'Duo launch' })).toBeInTheDocument();
    expect(queryKeys.every((key) => key === 0)).toBe(true);
  });

  it('names a conversation that never got a title', () => {
    query.data = [conversation({ title: null })];
    render(<HistorySidebar />);

    expect(screen.getByRole('link', { name: 'Untitled conversation' })).toBeInTheDocument();
  });

  it('says the history is empty rather than showing nothing', () => {
    query.data = [];
    render(<HistorySidebar />);

    expect(screen.getByText('Nothing asked yet.')).toBeInTheDocument();
  });

  it('says it is loading before the first page lands', () => {
    query.isLoading = true;
    render(<HistorySidebar />);

    expect(screen.getByText('Loading your conversations…')).toBeInTheDocument();
  });

  it('says so when the history could not be read', () => {
    query.error = new Error('permission denied');
    render(<HistorySidebar />);

    expect(screen.getByText('Your conversations could not be loaded.')).toBeInTheDocument();
  });

  it('reaches for older conversations on request', async () => {
    query.hasMore = true;
    render(<HistorySidebar />);

    await user.click(screen.getByRole('button', { name: 'Show older' }));

    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('shows a filed conversation under its folder', () => {
    folderQuery.folders = [folder()];
    query.data = [conversation({ folder_id: FOLDER_ID })];
    render(<HistorySidebar />);

    const section = within(screen.getByRole('region', { name: 'Pricing' }));
    expect(section.getByRole('link', { name: 'SSO blockers' })).toBeInTheDocument();
  });

  it('leaves an unfiled conversation at the top level', () => {
    folderQuery.folders = [folder()];
    query.data = [conversation({ folder_id: null })];
    render(<HistorySidebar />);

    const section = within(screen.getByRole('region', { name: 'Pricing' }));
    expect(section.queryByRole('link', { name: 'SSO blockers' })).toBeNull();
    expect(screen.getByRole('link', { name: 'SSO blockers' })).toBeInTheDocument();
  });

  it('shows a conversation at the top level when its folder is not one it can see', () => {
    folderQuery.folders = [folder()];
    query.data = [conversation({ folder_id: '99999999-9999-4999-8999-999999999999' })];
    render(<HistorySidebar />);

    const section = within(screen.getByRole('region', { name: 'Pricing' }));
    expect(section.queryByRole('link', { name: 'SSO blockers' })).toBeNull();
    expect(screen.getByRole('link', { name: 'SSO blockers' })).toBeInTheDocument();
  });

  it('keeps showing a folder holding nothing, because someone made it on purpose', () => {
    folderQuery.folders = [folder({ name: 'Empty' })];
    query.data = [];
    render(<HistorySidebar />);

    const section = within(screen.getByRole('region', { name: 'Empty' }));
    expect(section.getByText('Nothing filed here yet.')).toBeInTheDocument();
    expect(screen.queryByText('Nothing asked yet.')).toBeNull();
  });

  it('says so when the folders could not be read, and shows the conversations anyway', () => {
    folderQuery.error = new Error('permission denied');
    render(<HistorySidebar />);

    expect(screen.getByText('Your folders could not be loaded.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'SSO blockers' })).toBeInTheDocument();
  });

  it('reads the conversations again after one is renamed, so the new name shows', async () => {
    render(<HistorySidebar />);

    await user.click(screen.getByRole('button', { name: 'menu for SSO blockers' }));

    expect(queryKeys.at(-1)).toBe(1);
  });

  it('reads the folders and the conversations again after a folder is made', async () => {
    render(<HistorySidebar />);

    await user.click(screen.getByRole('button', { name: 'New folder' }));
    await user.type(screen.getByLabelText('Name'), 'Pricing');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(folderQuery.keys.at(-1)).toBe(1);
    expect(queryKeys.at(-1)).toBe(1);
  });
});

describe('filing a conversation by dragging it', () => {
  it('drops a loose conversation into the folder it was dragged onto', async () => {
    folderQuery.folders = [folder()];
    query.data = [conversation()];
    render(<HistorySidebar />);

    drag(screen.getByRole('link', { name: 'SSO blockers' }), screen.getByLabelText('Pricing'));

    await vi.waitFor(() =>
      expect(moves).toEqual([{ conversationId: CONVERSATION_ID, folderId: FOLDER_ID }]),
    );
  });

  // The way back out. Without a target for it, a conversation filed once is filed forever.
  it('drops a filed conversation onto the list itself to unfile it', async () => {
    folderQuery.folders = [folder()];
    query.data = [conversation({ folder_id: FOLDER_ID })];
    render(<HistorySidebar />);

    const row = within(screen.getByLabelText('Pricing')).getByRole('link', {
      name: 'SSO blockers',
    });
    drag(row, screen.getByLabelText('Conversations'));

    await vi.waitFor(() =>
      expect(moves).toEqual([{ conversationId: CONVERSATION_ID, folderId: null }]),
    );
  });

  it('writes nothing when a conversation is dropped where it already is', async () => {
    folderQuery.folders = [folder()];
    query.data = [conversation({ folder_id: FOLDER_ID })];
    render(<HistorySidebar />);

    const section = screen.getByLabelText('Pricing');
    drag(within(section).getByRole('link', { name: 'SSO blockers' }), section);

    await Promise.resolve();
    expect(moves).toEqual([]);
  });

  it('ignores anything dragged in that is not one of our conversations', async () => {
    folderQuery.folders = [folder()];
    render(<HistorySidebar />);

    const transfer = dataTransfer();
    transfer.setData('text/uri-list', 'https://example.test/somewhere');
    fireEvent.drop(screen.getByLabelText('Pricing'), { dataTransfer: transfer });

    await Promise.resolve();
    expect(moves).toEqual([]);
  });
});

describe('where the new folder button sits', () => {
  // It stays outside the scrolling list so it remains reachable however many conversations there are.
  it('sits outside the scrolling list, not inside it', () => {
    folderQuery.folders = [folder()];
    render(<HistorySidebar />);

    const list = screen.getByLabelText('Conversations');
    const button = screen.getByRole('button', { name: 'New folder' });

    expect(list.contains(button)).toBe(false);
    expect(list.className).toContain('overflow-y-auto');
  });
});
