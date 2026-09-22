import { describe, expect, it } from 'vitest';

import { describeConnectionStatus, formatLastSynced, type ConnectionStatusInput } from './status';

const getConnectionStatus = (
  overrides?: Partial<ConnectionStatusInput>,
): ConnectionStatusInput => ({
  status: 'active',
  statusDetail: null,
  lastSyncedAt: '2026-09-09T09:00:00.000Z',
  ...overrides,
});

const NOW = new Date('2026-09-09T12:00:00.000Z');

describe('connection status', () => {
  it('reads an active connection as connected and offers a re-sync', () => {
    const view = describeConnectionStatus(getConnectionStatus());

    expect(view.label).toBe('Connected');
    expect(view.tone).toBe('positive');
    expect(view.recovery.kind).toBe('resync');
  });

  it('shows a syncing connection as in progress', () => {
    const view = describeConnectionStatus(getConnectionStatus({ status: 'syncing' }));

    expect(view.tone).toBe('progress');
    expect(view.recovery.kind).toBe('none');
  });

  it('gives a revoked connection a real reason and a reconnect action', () => {
    const view = describeConnectionStatus(
      getConnectionStatus({
        status: 'revoked',
        statusDetail: 'The workspace owner removed Digital Brain.',
      }),
    );

    expect(view.reason).toBe('The workspace owner removed Digital Brain.');
    expect(view.recovery).toEqual({ kind: 'reconnect', label: 'Reconnect' });
    expect(view.tone).not.toBe('progress');
  });

  it('gives an expired connection a reason even when the provider recorded none', () => {
    const view = describeConnectionStatus(
      getConnectionStatus({ status: 'expired', statusDetail: null }),
    );

    expect(view.reason.length).toBeGreaterThan(0);
    expect(view.reason).not.toMatch(/null|undefined/);
    expect(view.recovery.kind).toBe('reconnect');
    expect(view.tone).not.toBe('progress');
  });

  it('offers a re-sync rather than a reconnect on a failed sync', () => {
    const view = describeConnectionStatus(
      getConnectionStatus({ status: 'error', statusDetail: 'Notion returned 502 on page 4.' }),
    );

    expect(view.tone).toBe('destructive');
    expect(view.reason).toBe('Notion returned 502 on page 4.');
    expect(view.recovery.kind).toBe('resync');
  });

  it('never leaves a status without a reason a person can read', () => {
    const statuses = ['active', 'syncing', 'error', 'revoked', 'expired'] as const;

    for (const status of statuses) {
      const view = describeConnectionStatus(getConnectionStatus({ status, statusDetail: null }));
      expect(view.reason.trim(), `${status} needs a reason`).not.toBe('');
    }
  });
});

describe('last sync time', () => {
  it('says so plainly when a connection has never synced', () => {
    expect(formatLastSynced(null, NOW)).toBe('Never synced');
  });

  it('reads a sync from minutes ago in minutes', () => {
    expect(formatLastSynced('2026-09-09T11:48:00.000Z', NOW)).toBe('Synced 12 minutes ago');
  });

  it('reads a sync from hours ago in hours', () => {
    expect(formatLastSynced('2026-09-09T09:00:00.000Z', NOW)).toBe('Synced 3 hours ago');
  });

  it('reads a sync from days ago in days', () => {
    expect(formatLastSynced('2026-09-05T12:00:00.000Z', NOW)).toBe('Synced 4 days ago');
  });

  it('reads a sync inside the last minute as just now', () => {
    expect(formatLastSynced('2026-09-09T11:59:30.000Z', NOW)).toBe('Synced just now');
  });

  it('uses the singular for one unit', () => {
    expect(formatLastSynced('2026-09-09T11:00:00.000Z', NOW)).toBe('Synced 1 hour ago');
  });
});
