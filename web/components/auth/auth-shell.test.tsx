import { render, screen } from '@testing-library/react';
import Link from 'next/link';
import { describe, expect, it } from 'vitest';

import { AuthShell } from './auth-shell';

describe('the frame every auth screen sits in', () => {
  it('gives the screen one first-level heading and says underneath what it is for', () => {
    render(
      <AuthShell title="Welcome back" description="Sign in to your Digital Brain account.">
        <form />
      </AuthShell>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByText('Sign in to your Digital Brain account.')).toBeInTheDocument();
  });

  it('offers a way back to the marketing page from a signed-out screen', () => {
    render(
      <AuthShell title="Welcome back" description="Sign in to your Digital Brain account.">
        <form />
      </AuthShell>,
    );

    expect(screen.getByRole('link', { name: 'Digital Brain' })).toHaveAttribute('href', '/');
  });

  it('shows the way on to the other auth screen when one is offered', () => {
    render(
      <AuthShell
        title="Welcome back"
        description="Sign in to your Digital Brain account."
        footer={<Link href="/sign-up">Create an account</Link>}
      >
        <form />
      </AuthShell>,
    );

    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/sign-up',
    );
  });

  it('leaves nothing below the panel on a screen with nowhere else to go', () => {
    render(
      <AuthShell title="Check your email" description="We sent you a confirmation link.">
        <p>Confirm from the link before signing in.</p>
      </AuthShell>,
    );

    expect(screen.getAllByRole('link')).toHaveLength(1);
  });
});
