import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSnapshot, RUN_ID } from '@/components/dreams/activity-test-fixtures';
import { recordingContext } from '@/lib/supabase/test-support';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: vi.fn(), useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/supabase/context', () => ({ getSessionContext: vi.fn() }));
vi.mock('@/lib/dreams/activity-queries', () => ({
  loadDreamActivity: vi.fn(),
  loadLastDreamTimes: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/lib/dreams/queries', () => ({ loadDreamsPage: vi.fn(), loadDreamSpaces: vi.fn() }));

const { getSessionContext } = await import('@/lib/supabase/context');
const { loadDreamActivity } = await import('@/lib/dreams/activity-queries');
const { loadDreamsPage, loadDreamSpaces } = await import('@/lib/dreams/queries');
const { default: DreamsPage } = await import('./page');
const { default: DreamLogPage } = await import('./log/page');

afterEach(() => vi.clearAllMocks());

describe('Dream batch recording view', () => {
  it('loads and displays only the selected batch, with a return link', async () => {
    const { context } = recordingContext({ responses: {} });
    vi.mocked(getSessionContext).mockResolvedValue(context);
    vi.mocked(loadDreamActivity).mockResolvedValue(getSnapshot({ status: 'succeeded' }));
    render(await DreamsPage({ searchParams: Promise.resolve({ runs: RUN_ID }) }));
    expect(loadDreamActivity).toHaveBeenCalledWith(context, [RUN_ID]);
    expect(loadDreamsPage).not.toHaveBeenCalled();
    expect(screen.getByText('Dream batch')).toBeInTheDocument();
    expect(screen.queryByText('Spaces in your organization')).not.toBeInTheDocument();
    expect(screen.queryByText('No dreams yet')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'All Dream activity' })).toHaveAttribute(
      'href',
      '/dreams',
    );
  });

  it('keeps controls on Runs and shows history on the Log page', async () => {
    const { context } = recordingContext({ responses: {} });
    vi.mocked(getSessionContext).mockResolvedValue(context);
    vi.mocked(loadDreamActivity).mockResolvedValue({ ...getSnapshot(), runs: [] });
    vi.mocked(loadDreamSpaces).mockResolvedValue([]);
    vi.mocked(loadDreamsPage).mockResolvedValue({ nights: [], spaces: [] });
    render(await DreamsPage({ searchParams: Promise.resolve({}) }));
    expect(loadDreamSpaces).toHaveBeenCalledWith(context);
    expect(loadDreamsPage).not.toHaveBeenCalled();
    expect(screen.getByText('Spaces in your organization')).toBeInTheDocument();
    expect(screen.queryByText('No dreams yet')).not.toBeInTheDocument();
    render(await DreamLogPage());
    expect(loadDreamsPage).toHaveBeenCalledWith(context);
    expect(screen.getByText('No dreams yet')).toBeInTheDocument();
  });
});
