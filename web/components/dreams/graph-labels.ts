import type { GraphLink } from './graph-data';

export function endpoint(end: GraphLink['source']): string {
  return typeof end === 'string' ? end : ((end as { id?: string }).id ?? '');
}

export function countLabel(total: number, noun: string): string {
  if (total === 1) return `1 ${noun}`;
  if (noun === 'entity') return `${total} entities`;
  return `${total} ${noun}s`;
}
