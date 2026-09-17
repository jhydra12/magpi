import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { successState } from '@/lib/actions/state';
import type { DreamRunOutcome } from '@/lib/dreams/edge';

import { SpaceDreaming, type DreamingSpace } from './space-dreaming';

const getSpace = (overrides?: Partial<DreamingSpace>): DreamingSpace => ({
  id: 'space-1',
  name: 'Engineering',
  dreaming_enabled: true,
  ...overrides,
});

const getOutcome = (overrides?: Partial<DreamRunOutcome>): DreamRunOutcome => ({
  dreamRunId: '11111111-2222-4333-8444-555555555555',
  status: 'succeeded',
  outputDocumentId: '22222222-3333-4444-8555-666666666666',
  ...overrides,
});

const getActions = () => ({
  onToggle: vi.fn().mockResolvedValue(successState(undefined)),
  onRun: vi.fn().mockResolvedValue(successState(getOutcome())),
});

describe('dreaming, per space', () => {
  it('says what the switch controls before asking anyone to use it', () => {
    render(<SpaceDreaming spaces={[getSpace()]} {...getActions()} />);

    expect(screen.getByText(/suspend dreaming for a space/i)).toBeInTheDocument();
  });

  it('turns dreaming off for one space', async () => {
    const actions = getActions();
    render(<SpaceDreaming spaces={[getSpace()]} {...actions} />);

    await userEvent.click(screen.getByRole('switch', { name: /dreaming in engineering/i }));

    expect(actions.onToggle).toHaveBeenCalledWith('space-1', false);
  });

  it('turns dreaming back on', async () => {
    const actions = getActions();
    render(<SpaceDreaming spaces={[getSpace({ dreaming_enabled: false })]} {...actions} />);

    await userEvent.click(screen.getByRole('switch', { name: /dreaming in engineering/i }));

    expect(actions.onToggle).toHaveBeenCalledWith('space-1', true);
  });

  it('runs one kind of dream over one space, on demand', async () => {
    const actions = getActions();
    render(<SpaceDreaming spaces={[getSpace()]} {...actions} />);

    const row = screen.getByRole('group', { name: 'Engineering' });
    await userEvent.selectOptions(within(row).getByLabelText(/kind/i), 'entities');
    await userEvent.click(within(row).getByRole('button', { name: /run now/i }));

    expect(actions.onRun).toHaveBeenCalledWith('space-1', 'entities');
  });

  it('shows a creeping bar while the run is in flight, and drops it when the run comes back', async () => {
    const actions = getActions();
    let finish!: (value: ReturnType<typeof successState<DreamRunOutcome>>) => void;
    actions.onRun.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<SpaceDreaming spaces={[getSpace()]} {...actions} />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /run now/i }));

    expect(
      await screen.findByRole('progressbar', { name: 'Digest over Engineering' }),
    ).toBeInTheDocument();

    finish(successState(getOutcome()));
    await waitFor(() => expect(screen.queryByRole('progressbar')).not.toBeInTheDocument());
    expect(screen.getByText(/finished and wrote a document/i)).toBeInTheDocument();
  });

  it('will not run a dream in a space where dreaming is switched off', () => {
    render(<SpaceDreaming spaces={[getSpace({ dreaming_enabled: false })]} {...getActions()} />);

    expect(screen.getByRole('button', { name: /run now/i })).toBeDisabled();
    expect(screen.getByText(/dreaming is off in this space/i)).toBeInTheDocument();
  });

  it('keeps the switch where the save left it', async () => {
    const actions = getActions();
    render(<SpaceDreaming spaces={[getSpace()]} {...actions} />);

    await userEvent.click(screen.getByRole('switch', { name: /dreaming in engineering/i }));

    expect(await screen.findByText(/dreaming is off in this space/i)).toBeInTheDocument();
  });

  it('leaves the switch alone when the save was refused', async () => {
    const actions = getActions();
    actions.onToggle.mockResolvedValue({ status: 'error', message: 'Not allowed.' });
    render(<SpaceDreaming spaces={[getSpace()]} {...actions} />);

    await userEvent.click(screen.getByRole('switch', { name: /dreaming in engineering/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /dreaming in engineering/i })).toBeChecked();
  });

  it('says how a run it started actually ended, since the run is done when the call returns', async () => {
    const actions = getActions();
    render(<SpaceDreaming spaces={[getSpace()]} {...actions} />);

    await userEvent.click(screen.getByRole('button', { name: /run now/i }));

    expect(await screen.findByText(/wrote a document/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open the run/i })).toHaveAttribute(
      'href',
      '/dreams/11111111-2222-4333-8444-555555555555',
    );
  });

  it('says a run timed out rather than calling it a success', async () => {
    const actions = getActions();
    actions.onRun.mockResolvedValue(
      successState(getOutcome({ status: 'timeout', outputDocumentId: null })),
    );
    render(<SpaceDreaming spaces={[getSpace()]} {...actions} />);

    await userEvent.click(screen.getByRole('button', { name: /run now/i }));

    expect(await screen.findByText(/timed out/i)).toBeInTheDocument();
  });

  it('says a run that wrote nothing produced nothing, rather than implying a document', async () => {
    const actions = getActions();
    actions.onRun.mockResolvedValue(successState(getOutcome({ outputDocumentId: null })));
    render(<SpaceDreaming spaces={[getSpace()]} {...actions} />);

    await userEvent.click(screen.getByRole('button', { name: /run now/i }));

    expect(await screen.findByText(/produced nothing/i)).toBeInTheDocument();
  });

  it('offers each kind by name and keeps the one the reader picks', async () => {
    render(<SpaceDreaming spaces={[getSpace()]} {...getActions()} />);
    const kind = screen.getByLabelText(/kind/i);

    expect(screen.getByRole('option', { name: 'Document links' })).toBeInTheDocument();

    await userEvent.selectOptions(kind, 'connections');

    expect(kind).toHaveValue('connections');
  });

  it('reports a refused run', async () => {
    const actions = getActions();
    actions.onRun.mockResolvedValue({ status: 'error', message: 'A run is already going.' });
    render(<SpaceDreaming spaces={[getSpace()]} {...actions} />);

    await userEvent.click(screen.getByRole('button', { name: /run now/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A run is already going.');
  });
});
