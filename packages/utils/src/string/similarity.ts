import { distance } from 'fastest-levenshtein';

export function similarity(a: string, b: string) {
  const left = a || '';
  const right = b || '';
  const longest = Math.max(left.length, right.length);
  return longest === 0 ? 1 : (longest - distance(left, right)) / longest;
}
