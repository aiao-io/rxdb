import { describe, expect, it } from 'vitest';
import { computeMinimalDocumentChange } from '../document-sync.js';

const alphabet = ['a', 'b', '\n', '\r', '\0', '\ud83d', '\ude00', '中', '\u0301'];
let seed = 20261004;
const nextRandom = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
};
const makeText = () =>
  Array.from({ length: nextRandom() % 24 }, () => alphabet[nextRandom() % alphabet.length]).join('');

const assertTransformation = (current: string, next: string) => {
  const change = computeMinimalDocumentChange(current, next);
  if (current === next) {
    if (change !== null) throw new Error('相同文档不应产生事务');
    return;
  }
  if (!change) throw new Error('不同文档必须有变更');
  const { from, to, insert } = change;
  const actual = current.slice(0, from) + insert + current.slice(to);
  if (from < 0 || from > to || to > current.length || actual !== next)
    throw new Error(JSON.stringify({ current, next, change }));
  if (current.slice(0, from) !== next.slice(0, from)) throw new Error('未改变前缀被覆盖');
  const suffix = current.slice(to);
  if (!next.endsWith(suffix)) throw new Error('未改变后缀被覆盖');
  if (from < current.length && from < next.length && current[from] === next[from])
    throw new Error('替换区间没有跳过完整公共前缀');
};

describe('评审核销：共享字符串文档同步的坐标和回放不变量', () => {
  it('固定种子的 4096 对 UTF-16/换行/空字符文本都能精确回放', () => {
    for (let index = 0; index < 4096; index++) assertTransformation(makeText(), makeText());
    expect(seed).toBeTypeOf('number');
  });
  it.each(['', '😀', '\ud83d', '\ude00', '中\r\n文', 'e\u0301', '\0\0'])(
    '相同文档 %j 不创建变更，追加/删除同样可回放',
    text => {
      assertTransformation(text, text);
      assertTransformation(text, `${text}!`);
      assertTransformation(`${text}!`, text);
    }
  );
});
