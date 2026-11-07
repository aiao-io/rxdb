import type { ResolvedControl } from '@aiao/rxdb-admin';

/** 需要独占一行（控件在标题下方）的控件种类。 */
export const STACKED_KINDS: ReadonlySet<ResolvedControl['kind']> = new Set([
  'cards',
  'themes',
  'widgets',
  'shortcuts',
  'color'
]);
