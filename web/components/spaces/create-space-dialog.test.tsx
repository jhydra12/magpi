import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActionState } from '@/lib/actions/state';

const SPACE_ID = '33333333-3333-4333-8333-333333333333';

type Created = ActionState<{ id: string }>;

const action = {
  answer: { status: 'success', data: { id: SPACE_ID } } as Created,
  submitted: [] as FormData[],
  /** Set to hold the action open, so the in-flight state can be read. */
  gate: null as Promise<void> | null,
};

vi.mock('@/app/(app)/spaces/actions', () => ({
  createTeamSpace: async (formData: FormData) => {
    action.submitted.push(formData);
    if (action.gate) await action.gate;
    return action.answer;
  },
}));

const { CreateSpaceDialog } = await import('./create-space-dialog');

/** Typing key by key at the default delay times the suite out under load. */
const user = userEvent.setup({ delay: null });

async function openDialog() {
  render(<CreateSpaceDialog />);
  await user.click(screen.getByRole('button', { name: 'Create' }));
}

/** While the dialog is open the trigger is hidden from the tree, so this is the form's button. */
const submitButton = () => screen.getByRole('button', { name: 'Create' });

/** The action answers a turn after the click, so its result lands after this. */
async function create() {
  await user.click(submitButton());
  await act(async () => {});
}

beforeEach(() => {
  action.answer = { status: 'success', data: { id: SPACE_ID } };
  action.submitted = [];
  action.gate = null;
});

describe('creating a team space', () => {
  it('sends the name and the description the person wrote', async () => {
    await openDialog();

    await user.type(screen.getByLabelText('Name your space'), 'Growth');
    await user.type(screen.getByLabelText('Give it a description'), 'Pricing and funnels.');
    await create();

    expect(action.submitted).toHaveLength(1);
    expect(action.submitted[0].get('name')).toBe('Growth');
    expect(action.submitted[0].get('description')).toBe('Pricing and funnels.');
  });

  it('sends an empty description when none was written', async () => {
    await openDialog();

    await user.type(screen.getByLabelText('Name your space'), 'Growth');
    await create();

    expect(action.submitted[0].get('description')).toBe('');
  });

  it('closes once the space exists, because there is nothing left to show', async () => {
    await openDialog();

    await user.type(screen.getByLabelText('Name your space'), 'Growth');
    await create();

    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Name your space')).toBeNull();
  });

  it('says why the space was refused, and keeps the dialog open', async () => {
    action.answer = { status: 'error', message: 'That space could not be created.' };
    await openDialog();

    await user.type(screen.getByLabelText('Name your space'), 'Growth');
    await create();

    expect(screen.getByRole('alert')).toHaveTextContent('That space could not be created.');
    expect(screen.getByLabelText('Name your space')).toBeInTheDocument();
  });

  // React empties an uncontrolled form once its action settles, which would throw away what
  // somebody typed at the exact moment they need it back to fix the refusal.
  it('keeps what was typed when the space is refused', async () => {
    action.answer = { status: 'error', message: 'That name is taken.' };
    await openDialog();

    await user.type(screen.getByLabelText('Name your space'), 'Growth');
    await user.type(screen.getByLabelText('Give it a description'), 'Where growth work goes');
    await create();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByLabelText('Name your space')).toHaveValue('Growth');
    expect(screen.getByLabelText('Give it a description')).toHaveValue('Where growth work goes');
  });

  it('clears the form once a space is actually created', async () => {
    await openDialog();
    await user.type(screen.getByLabelText('Name your space'), 'Growth');
    await create();

    // The same dialog reopened, not a second one: a created space must not leave its name behind.
    await user.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByLabelText('Name your space')).toHaveValue('');
  });

  it('shows no error before anything has been asked for', async () => {
    await openDialog();

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('creates nothing when the space has no name', async () => {
    await openDialog();

    await create();

    expect(action.submitted).toEqual([]);
    expect(screen.getByLabelText('Name your space')).toBeInTheDocument();
  });

  it('closes the buttons while the space is being created, so it is not created twice', async () => {
    let release = () => {};
    action.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await openDialog();

    await user.type(screen.getByLabelText('Name your space'), 'Growth');
    await create();

    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await act(async () => {
      release();
    });
  });

  it('creates nothing when the dialog is cancelled', async () => {
    await openDialog();

    await user.type(screen.getByLabelText('Name your space'), 'Growth');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Name your space')).toBeNull();
    expect(action.submitted).toEqual([]);
  });

  it('creates nothing when the dialog is closed on Escape', async () => {
    await openDialog();

    await user.keyboard('{Escape}');

    expect(screen.queryByLabelText('Name your space')).toBeNull();
    expect(action.submitted).toEqual([]);
  });
});
