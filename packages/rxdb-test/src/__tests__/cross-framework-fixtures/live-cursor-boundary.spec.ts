import { describe, expect, it } from 'vitest';

import { mergeCreatedIntoCursorPage } from '../../cross-framework-fixtures/live-cursor-boundary.js';

describe('live cursor boundary fixture', () => {
  it('头插让页涨过 limit，页尾原地不动', () => {
    const a = { id: 'a', sort: 1 };
    const b = { id: 'b', sort: 2 };
    const x = { id: 'x', sort: 0 };

    expect(mergeCreatedIntoCursorPage([a, b], [x], undefined, 2)).toEqual([x, a, b]);
  });

  // 核心 `compareOrderValues` 与 SQLite 的 TEXT ORDER BY 都按二进制比较，`isAfterCursor` 也是。
  // 夹具排序若按 locale 比较，大小写混排的 id 会被排成另一种次序，三端对着它断言就会假红。
  it('同 sort 时按 id 的二进制序排，与游标判定口径一致', () => {
    const cursor = { id: 'A', sort: 1 };
    const tail = { id: 'Z', sort: 1 };
    const created = { id: 'b', sort: 1 };

    // 二进制序 'Z'(0x5A) < 'b'(0x62)：新行排在页尾之后，limit 2 装得下时并在尾部
    expect(mergeCreatedIntoCursorPage([tail], [created], cursor, 2)).toEqual([tail, created]);
    // limit 1 时新行落在窗口外，归下一页；页不该涨
    expect(mergeCreatedIntoCursorPage([tail], [created], cursor, 1)).toEqual([tail]);
  });
});
