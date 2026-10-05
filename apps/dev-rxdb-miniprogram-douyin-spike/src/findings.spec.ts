import { chunkGaps } from './findings.js';

describe('chunkGaps', () => {
  it('模拟器 v9 的关闭后文件：.155 是写撞配额留下的空块，.153 / .154 缺失', () => {
    const files = [
      { path: '/rxdb-quota.sqlite.151', size: 65536 },
      { path: '/rxdb-quota.sqlite.152', size: 20480 },
      { path: '/rxdb-quota.sqlite.155', size: 0 },
      { path: '/rxdb-quota.sqlite.rxdb-reserve', size: 131072 },
      ...Array.from({ length: 151 }, (_, index) => ({ path: `/rxdb-quota.sqlite.${index}`, size: 65536 }))
    ];
    expect(chunkGaps(files)).toEqual(['/rxdb-quota.sqlite.153', '/rxdb-quota.sqlite.154']);
  });

  it('块号连续、只有余量文件时没有空洞', () => {
    const files = [
      { path: '/a.sqlite.0', size: 4 },
      { path: '/a.sqlite.1', size: 2 },
      { path: '/a.sqlite-journal.0', size: 0 },
      { path: '/a.sqlite.rxdb-reserve', size: 8 }
    ];
    expect(chunkGaps(files)).toEqual([]);
  });
});
