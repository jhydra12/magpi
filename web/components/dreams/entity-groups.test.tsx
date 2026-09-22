import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { EntityGroup } from '@/lib/dreams/entities';

import { EntityGroups } from './entity-groups';

const getGroup = (overrides?: Partial<EntityGroup>): EntityGroup => ({
  kind: 'project',
  label: 'Projects',
  entities: [
    {
      id: 'entity-1',
      name: 'SSO rollout',
      summary: 'The single sign-on work for enterprise customers.',
      documents: [
        { id: 'doc-a', title: 'Linear: SSO rollout', url: 'https://linear.app/issue/1' },
        { id: 'doc-b', title: 'Notion: SSO spec', url: null },
      ],
    },
  ],
  ...overrides,
});

describe('entities extracted by dreaming', () => {
  it('groups them under the kind they are', () => {
    render(<EntityGroups groups={[getGroup()]} />);

    expect(screen.getByRole('heading', { name: /Projects/ })).toBeInTheDocument();
    expect(screen.getByText('SSO rollout')).toBeInTheDocument();
  });

  it('names every document an entity was mentioned in, which is what pulls the sources together', () => {
    render(<EntityGroups groups={[getGroup()]} />);

    const entity = screen.getByRole('listitem', { name: 'SSO rollout' });
    expect(within(entity).getByRole('link', { name: 'Linear: SSO rollout' })).toHaveAttribute(
      'href',
      '/documents/doc-a',
    );
    expect(within(entity).getByRole('link', { name: 'Notion: SSO spec' })).toBeInTheDocument();
  });

  it('says when none of an entity mentions are readable, rather than showing an empty row', () => {
    render(
      <EntityGroups
        groups={[
          getGroup({
            entities: [{ id: 'entity-1', name: 'SSO rollout', summary: null, documents: [] }],
          }),
        ]}
      />,
    );

    expect(screen.getByText(/no documents you can see/i)).toBeInTheDocument();
  });
});
