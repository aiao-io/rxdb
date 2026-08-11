import type { VirtualItem } from '@tanstack/vue-virtual';
import { describe, expect, it } from 'vitest';
import { pairVirtualRows } from './virtual-rows';

const createVirtualItem = (index: number): VirtualItem => ({
  key: index,
  index,
  start: index * 32,
  end: (index + 1) * 32,
  size: 32,
  lane: 0
});

describe('pairVirtualRows', () => {
  it('drops stale virtual indexes after the data shrinks', () => {
    const rows = pairVirtualRows(['first'], [createVirtualItem(0), createVirtualItem(1)]);

    expect(rows).toEqual([{ item: 'first', virtualItem: createVirtualItem(0) }]);
  });
});
