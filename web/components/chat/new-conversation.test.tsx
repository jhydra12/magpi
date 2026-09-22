import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '@/lib/actions/state';
import { subscribeConversationList } from '@/lib/chat/history-sync';

const CONVERSATION_ID = '44444444-4444-4444-8444-444444444444';
const SPACE_ID = '33333333-3333-4333-8333-333333333333';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
const created = {
  state: { status: 'success', data: CONVERSATION_ID } as ActionState<string>,
  input: null as unknown,
};

vi.mock('next/navigation', () => ({ useRouter: () => router }));

vi.mock('@/app/(app)/chat/actions', () => ({
  createConversationAction: async (input: unknown) => {
    created.input = input;
    return created.state;
  },
}));

const { NewConversation } = await import('./new-conversation');

/** Typing key by key at the default delay times the suite out under load. */
const user = userEvent.setup({ delay: null });

const spaces = [{ id: SPACE_ID, name: 'Personal' }];

beforeEach(() => {
  router.push.mockClear();
  created.state = { status: 'success', data: CONVERSATION_ID };
  created.input = null;
});

describe('NewConversation', () => {
  it('opens a conversation and carries the question to it', async () => {
    const opened: string[] = [];
    const unsubscribe = subscribeConversationList((patch) => opened.push(patch.id));
    render(<NewConversation spaces={spaces} />);

    await user.type(screen.getByLabelText('Ask a question'), 'What is blocking SSO?{Enter}');

    expect(created.input).toEqual({ spaceFilter: null });
    expect(opened).toEqual([CONVERSATION_ID]);
    expect(router.push).toHaveBeenCalledWith(
      `/chat/${CONVERSATION_ID}?ask=What%20is%20blocking%20SSO%3F`,
    );
    unsubscribe();
  });

  it('opens the conversation against the spaces that were picked', async () => {
    render(<NewConversation spaces={spaces} />);

    await user.click(screen.getByRole('button', { name: 'Search scope: All spaces' }));
    await user.click(await screen.findByRole('menuitemcheckbox', { name: 'Personal' }));
    await user.type(screen.getByLabelText('Ask a question'), 'What is blocking SSO?{Enter}');

    expect(created.input).toEqual({ spaceFilter: [SPACE_ID] });
  });

  it('says why the conversation could not be opened, and stays put', async () => {
    created.state = { status: 'error', message: 'You need to sign in to do that.' };
    render(<NewConversation spaces={spaces} />);

    await user.type(screen.getByLabelText('Ask a question'), 'What is blocking SSO?{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('You need to sign in to do that.');
    expect(router.push).not.toHaveBeenCalled();
  });
});
