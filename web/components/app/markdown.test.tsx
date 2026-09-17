import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Markdown } from './markdown';

describe('markdown rendering', () => {
  it('turns headings, paragraphs, lists and emphasis into their elements', () => {
    render(
      <Markdown
        source={'## What changed\n\nBilling **slipped** a week.\n\n- One\n- Two\n\n1. First'}
      />,
    );

    expect(screen.getByRole('heading', { name: 'What changed' })).toBeInTheDocument();
    expect(screen.queryByText(/##/)).not.toBeInTheDocument();
    expect(screen.getByText('slipped').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'One',
      'Two',
      'First',
    ]);
  });

  it('keeps headings below the page heading that introduces the text', () => {
    render(<Markdown source={'# Top\n\n## Second\n\n### Third'} />);

    const levels = screen.getAllByRole('heading').map((heading) => heading.tagName);
    expect(levels).toEqual(['H3', 'H3', 'H4']);
  });

  it('never renders HTML that arrives inside the text', () => {
    render(<Markdown source={'Hello <button>click</button> <img src=x onerror=alert(1)>'} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
