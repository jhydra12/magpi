import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Citation } from '@/lib/chat/protocol';

import { AssistantTurn } from './assistant-turn';

const citation = (overrides: Partial<Citation> = {}): Citation => ({
  chunkId: '11111111-1111-4111-8111-111111111111',
  documentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  documentTitle: 'Q3 platform notes',
  documentSource: null,
  excerpt: 'The SSO rollout is blocked on ENG-4417.',
  label: 1,
  ...overrides,
});

describe('AssistantTurn', () => {
  it('opens the source document from the inline reference', () => {
    render(
      <AssistantTurn
        content="SSO is blocked on ENG-4417 [1]."
        citations={[citation()]}
        streaming={false}
      />,
    );

    const reference = screen.getByRole('link', { name: '1' });
    expect(reference).toHaveAttribute('href', '/documents/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  });

  it('lists the sources the answer actually used', () => {
    render(
      <AssistantTurn
        content="SSO is blocked on ENG-4417 [1]."
        citations={[
          citation(),
          citation({
            chunkId: '22222222-2222-4222-8222-222222222222',
            documentTitle: 'Never cited',
            documentSource: null,
            label: 2,
          }),
        ]}
        streaming={false}
      />,
    );

    expect(screen.getByRole('link', { name: /Q3 platform notes/ })).toBeInTheDocument();
    expect(screen.queryByText('Never cited')).not.toBeInTheDocument();
  });

  it('keeps the answer readable when its source is out of reach', () => {
    render(
      <AssistantTurn content="SSO is blocked on ENG-4417 [1]." citations={[]} streaming={false} />,
    );

    expect(screen.getByText(/SSO is blocked on ENG-4417 \[1\]\./)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sources' })).not.toBeInTheDocument();
  });

  it('says what it is doing before the first token arrives', () => {
    render(<AssistantTurn content="" citations={[]} streaming />);

    expect(screen.getByText('Reading your documents…')).toBeInTheDocument();
  });
});
