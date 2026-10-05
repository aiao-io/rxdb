import { useCountDescendants, useFindDescendants } from '@aiao/rxdb-plugin-tree-angular';
import { NumericTree } from './consumer-valid.mjs';

export function rejectStringId(): void {
  useFindDescendants(NumericTree, { entityId: 'numeric-id-must-not-be-a-string' });
}

export function rejectStringCount(): string {
  return useCountDescendants(NumericTree, { entityId: 1 }).value();
}
