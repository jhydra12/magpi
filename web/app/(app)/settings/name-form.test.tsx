import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { ActionState } from '@/lib/actions/state';

import { NameForm } from './name-form';

type FormProps = Parameters<typeof NameForm>[0];

function formProps(overrides: Partial<FormProps> = {}): FormProps {
  return {
    action: async () => ({ status: 'success', data: undefined }),
    fieldName: 'displayName',
    label: 'Display name',
    defaultValue: 'Ada Lovelace',
    placeholder: 'Your name',
    submitLabel: 'Save',
    pendingLabel: 'Saving…',
    savedLabel: 'Saved',
    ...overrides,
  };
}

/** Typing key by key at the default delay times the suite out under load. */
const user = userEvent.setup({ delay: null });

describe('a settings name field', () => {
  it('shows the name the account already has', () => {
    render(<NameForm {...formProps()} />);

    expect(screen.getByLabelText('Display name')).toHaveValue('Ada Lovelace');
  });

  it('sends what the person typed', async () => {
    const submitted: string[] = [];
    render(
      <NameForm
        {...formProps({
          action: async (_previous: ActionState, formData: FormData) => {
            submitted.push(String(formData.get('displayName')));
            return { status: 'success', data: undefined };
          },
        })}
      />,
    );

    const field = screen.getByLabelText('Display name');
    await user.clear(field);
    await user.type(field, 'Grace Hopper');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(submitted).toEqual(['Grace Hopper']);
  });

  it('confirms the save once it lands', async () => {
    render(<NameForm {...formProps()} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('says why the save was refused', async () => {
    render(
      <NameForm
        {...formProps({
          action: async () => ({
            status: 'error',
            message: 'A display name is between 1 and 80 characters.',
          }),
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A display name is between 1 and 80 characters.',
    );
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('cannot be submitted twice while the first save is in flight', async () => {
    let finish = (state: ActionState) => {
      void state;
    };
    render(
      <NameForm
        {...formProps({
          action: () =>
            new Promise<ActionState>((resolve) => {
              finish = resolve;
            }),
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();

    finish({ status: 'success', data: undefined });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });
});
