import { describe, it } from 'vitest';
import type { BomLineOccurrence } from '../src/entities.js';
import { expectReachMatches, ITEM_KEYS, type ItemKey, withReachFixture } from './reach-test-utils.js';

const shapes: { name: string; edges: [ItemKey, ItemKey][] }[] = [
  {
    name: '树',
    edges: [
      ['A', 'B'],
      ['A', 'C'],
      ['B', 'D'],
      ['C', 'E']
    ]
  },
  {
    name: '共享装配',
    edges: [
      ['A', 'B'],
      ['A', 'C'],
      ['B', 'D'],
      ['C', 'D'],
      ['D', 'E']
    ]
  },
  {
    name: '多重边',
    edges: [
      ['A', 'B'],
      ['A', 'B'],
      ['A', 'B'],
      ['B', 'C']
    ]
  },
  {
    name: '菱形',
    edges: [
      ['A', 'B'],
      ['A', 'C'],
      ['B', 'D'],
      ['C', 'D']
    ]
  }
];

for (const backend of ['wa-sqlite', 'pglite'] as const) {
  describe(`BOM确定性变更oracle [${backend}]`, () => {
    for (const shape of shapes) {
      it(`${shape.name}在40次增删改后每次与独立递归逐对相同`, async () => {
        await withReachFixture(backend, async fixture => {
          const records: { parent: number; occurrence: BomLineOccurrence }[] = [];
          for (const [parent, child] of shape.edges) {
            records.push({ parent: ITEM_KEYS.indexOf(parent), occurrence: await fixture.add(parent, child) });
          }
          let random = 0x1234abcd;
          const pick = (length: number): number => {
            random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
            return random % length;
          };
          for (let index = 0; index < 40; index += 1) {
            const operation = records.length === 0 ? 0 : pick(3);
            if (operation === 0) {
              const parent = pick(ITEM_KEYS.length - 1);
              const child = parent + 1 + pick(ITEM_KEYS.length - parent - 1);
              records.push({ parent, occurrence: await fixture.add(ITEM_KEYS[parent], ITEM_KEYS[child]) });
            } else if (operation === 1) {
              const removed = records.splice(pick(records.length), 1)[0];
              await removed.occurrence.remove();
            } else {
              const updated = records[pick(records.length)];
              const child = updated.parent + 1 + pick(ITEM_KEYS.length - updated.parent - 1);
              updated.occurrence.childItemId = fixture.ids[ITEM_KEYS[child]];
              await updated.occurrence.save();
            }
            await expectReachMatches(fixture.adapter);
          }
        });
      }, 60_000);
    }
  });
}
