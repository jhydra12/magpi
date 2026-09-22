'use client';

import { ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type SpaceOption = {
  readonly id: string;
  readonly name: string;
};

type SpaceFilterProps = {
  readonly spaces: readonly SpaceOption[];
  readonly selected: readonly string[];
  readonly onChange: (selected: readonly string[]) => void;
  readonly variant?: 'outline' | 'ghost';
};

/** Narrows which spaces a conversation searches. An empty selection means all of them. */
export function SpaceFilter({ spaces, selected, onChange, variant = 'outline' }: SpaceFilterProps) {
  const label =
    selected.length === 0
      ? 'All spaces'
      : selected.length === 1
        ? (spaces.find((space) => space.id === selected[0])?.name ?? '1 space')
        : `${selected.length} spaces`;

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((it) => it !== id) : [...selected, id]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size="sm" aria-label={`Search scope: ${label}`}>
          {label}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Search in</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {spaces.map((space) => (
          <DropdownMenuCheckboxItem
            key={space.id}
            checked={selected.includes(space.id)}
            onCheckedChange={() => toggle(space.id)}
          >
            {space.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
