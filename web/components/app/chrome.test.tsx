import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { NavItem } from './nav';

const route = { pathname: '/chat' };

vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }));

const { Nav, SideNav } = await import('./nav');
const { ErrorState } = await import('./error-state');
const { PageHeader } = await import('./page-header');

const SECTIONS: readonly NavItem[] = [
  { href: '/chat', label: 'Chat' },
  { href: '/documents', label: 'Documents' },
  { href: '/dreams', label: 'Dreams' },
];

describe('the section tabs', () => {
  it('offers every section as a link', () => {
    route.pathname = '/chat';
    render(<Nav items={SECTIONS} />);

    expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute('href', '/documents');
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('tells a screen reader which section the reader is in', () => {
    route.pathname = '/documents';
    render(<Nav items={SECTIONS} />);

    expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Chat' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the section marked while the reader is deeper inside it', () => {
    route.pathname = '/dreams/entities';
    render(<Nav items={SECTIONS} />);

    expect(screen.getByRole('link', { name: 'Dreams' })).toHaveAttribute('aria-current', 'page');
  });

  it('does not mark a section whose name another route merely starts with', () => {
    route.pathname = '/documents-archive';
    render(<Nav items={SECTIONS} />);

    expect(screen.queryByRole('link', { current: 'page' })).not.toBeInTheDocument();
  });
});

describe('the admin side nav', () => {
  const ADMIN: readonly NavItem[] = [
    { href: '/admin', label: 'Overview' },
    { href: '/admin/searches', label: 'Searches' },
    { href: '/admin/members', label: 'Members' },
    { href: '/admin/consumption', label: 'Consumption' },
  ];

  it('marks the deepest section the reader is in, not its parent as well', () => {
    route.pathname = '/admin/members';
    render(<SideNav items={ADMIN} label="Admin sections" />);

    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveAttribute('aria-current');
  });

  it('marks the parent when the reader is on it', () => {
    route.pathname = '/admin';
    render(<SideNav items={ADMIN} label="Admin sections" />);

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('a failure on a page', () => {
  it('says what went wrong, and what a reader can do about it', () => {
    render(<ErrorState title="Documents could not be loaded" detail="Reload to try again." />);

    expect(screen.getByRole('alert')).toHaveTextContent('Documents could not be loaded');
    expect(screen.getByText('Reload to try again.')).toBeInTheDocument();
  });

  it('says only what went wrong when there is nothing to add', () => {
    render(<ErrorState title="Documents could not be loaded" />);

    expect(screen.getByRole('alert')).toHaveTextContent('Documents could not be loaded');
    expect(screen.getByRole('alert').querySelector('p')).toBeNull();
  });
});

describe('a page heading', () => {
  it('names the page, explains it, and carries the actions it was given', () => {
    render(
      <PageHeader
        title="Documents"
        description="Everything Digital Brain has read."
        actions={<button type="button">Upload</button>}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.getByText('Everything Digital Brain has read.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeInTheDocument();
  });

  it('names the page and nothing else when there is nothing else to say', () => {
    render(<PageHeader title="Documents" />);

    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
