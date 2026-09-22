import { describe, expect, it } from 'vitest';

import {
  describeEmptySelection,
  describeScopeSelection,
  parseScopeSelection,
  type ScopeSelection,
} from './scope-selection';

const ENGINEERING = '33333333-3333-4333-8333-333333333333';
const FINANCE = '44444444-4444-4444-8444-444444444444';

const getPopulatedSelection = (overrides?: Partial<Record<string, unknown>>) => ({
  kind: 'channel',
  available: [
    { id: 'C1', name: 'general' },
    { id: 'C2', name: 'engineering' },
    { id: 'C3', name: 'design' },
  ],
  routes: { C1: ENGINEERING },
  ...overrides,
});

const parsed = (value: unknown): ScopeSelection => {
  const result = parseScopeSelection(value);
  if (!result.ok) throw new Error(result.error);
  return result.data;
};

describe('scope selection parsing', () => {
  it('reads the column default as a selection the provider has not populated yet', () => {
    expect(parsed({})).toEqual({ kind: 'unset' });
  });

  it('reads a populated selection', () => {
    const selection = parsed(getPopulatedSelection());

    expect(selection).toEqual({
      kind: 'set',
      selectionKind: 'channel',
      available: [
        { id: 'C1', name: 'general' },
        { id: 'C2', name: 'engineering' },
        { id: 'C3', name: 'design' },
      ],
      routes: { C1: ENGINEERING },
    });
  });

  it('reads two units of one account routed to two different spaces', () => {
    const selection = parsed(getPopulatedSelection({ routes: { C1: ENGINEERING, C2: FINANCE } }));

    expect(selection).toEqual(
      expect.objectContaining({ routes: { C1: ENGINEERING, C2: FINANCE } }),
    );
  });

  it('refuses a selection kind the schema does not define', () => {
    const result = parseScopeSelection(getPopulatedSelection({ kind: 'mailbox' }));

    expect(result.ok).toBe(false);
  });

  it('refuses a route that points at something other than a space id', () => {
    const result = parseScopeSelection(getPopulatedSelection({ routes: { C1: 'engineering' } }));

    expect(result.ok).toBe(false);
  });

  it('refuses a stored scope that is not an object at all', () => {
    expect(parseScopeSelection(null).ok).toBe(false);
    expect(parseScopeSelection(['general']).ok).toBe(false);
    expect(parseScopeSelection('general').ok).toBe(false);
  });

  it('refuses an available list that is not a list of items', () => {
    const result = parseScopeSelection(getPopulatedSelection({ available: ['general'] }));

    expect(result.ok).toBe(false);
  });
});

describe('describing a selection', () => {
  it('counts what is routed against what is available, and names one destination', () => {
    expect(describeScopeSelection(parsed(getPopulatedSelection()))).toBe(
      '1 of 3 channels into 1 space',
    );
  });

  it('counts the spaces, not the routes, when one account feeds two spaces', () => {
    const selection = parsed(
      getPopulatedSelection({ routes: { C1: ENGINEERING, C2: FINANCE, C3: FINANCE } }),
    );

    expect(describeScopeSelection(selection)).toBe('3 of 3 channels into 2 spaces');
  });

  it('says nothing is routed rather than showing a zero', () => {
    const selection = parsed(getPopulatedSelection({ routes: {} }));

    expect(describeScopeSelection(selection)).toBe('No channels routed');
  });

  it('names the unit a workspace source offers, rather than calling it a channel', () => {
    const selection = parsed(
      getPopulatedSelection({
        kind: 'workspace',
        available: [{ id: 'W1', name: 'Acme' }],
        routes: { W1: ENGINEERING },
      }),
    );

    expect(describeScopeSelection(selection)).toBe('1 of 1 workspaces into 1 space');
  });

  it('says the provider has not answered yet when the selection is unset', () => {
    expect(describeScopeSelection({ kind: 'unset' })).toBe('Nothing chosen yet');
  });
});

describe('what an empty selection means', () => {
  it('tells a channel source what routing one channel would do', () => {
    expect(describeEmptySelection('channel')).toBe(
      'Send a channel to a space and Digital Brain starts reading it.',
    );
  });

  it('tells a folder source what routing one folder would do', () => {
    expect(describeEmptySelection('folder')).toBe(
      'Send a folder to a space and Digital Brain starts reading it.',
    );
  });

  it('tells a workspace source what routing the workspace would do', () => {
    expect(describeEmptySelection('workspace')).toBe(
      'Send this workspace to a space and Digital Brain starts reading it.',
    );
  });
});
