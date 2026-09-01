import { describe, expect, it } from 'vitest';

import {
  isValidPathSegment,
  joinLogicalPath,
  parseLogicalPath,
  splitLogicalPath
} from '../../provider/logical-path.js';

/**
 * 逃逸样本。
 *
 * @remarks
 * 逐条列出来而不是只测一个 `..`：这是安全边界，两种斜杠、编码变体与「段里藏分隔符」
 * 三类写法在不同 host 上的解析结果并不相同，只测一条等于只挡住最天真的那一条。
 */
const ESCAPES = [
  '..',
  '../etc/passwd',
  'a/../../b',
  'a/./b',
  'a\\..\\b',
  '\\',
  'C:\\Windows',
  '\\\\server\\share',
  'a/b\\..\\c'
] as const;

describe('devtools logical path', () => {
  it('MUST reject every escape form instead of resolving it', () => {
    // 就地解析等于允许对端用 `a/../../b` 描述根外的位置，而解析后的结果看上去完全正常。
    for (const path of ESCAPES) {
      expect(parseLogicalPath(path), path).toBeUndefined();
      expect(splitLogicalPath(path), path).toBeUndefined();
    }
  });

  it('MUST treat the empty path as the root rather than as an invalid path', () => {
    expect(parseLogicalPath('')).toEqual([]);
    expect(joinLogicalPath([])).toBe('');
  });

  it('MUST collapse repeated separators into the same location', () => {
    // `a//b` 描述的是同一个位置，不是多出来一个匿名层级。
    expect(parseLogicalPath('a//b')).toEqual(['a', 'b']);
    expect(parseLogicalPath('/a/b/')).toEqual(['a', 'b']);
  });

  it('MUST round-trip a valid path through parse and join', () => {
    const segments = parseLogicalPath('db/backups/2026-08.sqlite');
    expect(segments).toEqual(['db', 'backups', '2026-08.sqlite']);
    expect(joinLogicalPath(segments ?? [])).toBe('db/backups/2026-08.sqlite');
  });

  it('MUST reject non-string paths', () => {
    // wire 上的值是 `unknown`：把 `undefined` 当成根就等于把「漏传字段」当成一次合法的根操作。
    for (const value of [undefined, null, 42, ['a'], { path: 'a' }]) {
      expect(parseLogicalPath(value)).toBeUndefined();
    }
  });

  it('MUST accept dot-prefixed and unicode names that are not relative markers', () => {
    expect(parseLogicalPath('.config/数据库.sqlite')).toEqual(['.config', '数据库.sqlite']);
    expect(parseLogicalPath('...')).toEqual(['...']);
  });

  it('MUST split a path into its parent segments and its last name', () => {
    expect(splitLogicalPath('db/backups/x.sqlite')).toEqual({ parent: ['db', 'backups'], name: 'x.sqlite' });
    expect(splitLogicalPath('x.sqlite')).toEqual({ parent: [], name: 'x.sqlite' });
  });

  it('MUST refuse to split the root, which has no last name', () => {
    // `create-directory` / `delete` / `download` 都需要一个具体目标，把根当目标是它们的非法输入。
    expect(splitLogicalPath('')).toBeUndefined();
    expect(splitLogicalPath('/')).toBeUndefined();
  });

  it('MUST judge a single segment on its own, without splitting it', () => {
    expect(isValidPathSegment('backup.sqlite')).toBe(true);
    // 段是**不可再分**的：一个带分隔符的「名字」必须整条拒绝，而不是被切成两段。
    expect(isValidPathSegment('a/b')).toBe(false);
    expect(isValidPathSegment('a\\b')).toBe(false);
    for (const value of ['', '.', '..', undefined, null, 7]) {
      expect(isValidPathSegment(value)).toBe(false);
    }
  });
});
