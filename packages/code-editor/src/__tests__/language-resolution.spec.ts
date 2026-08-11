import { describe, expect, it } from 'vitest';

import { isSameResolvedLanguage, resolveCodeEditorLanguage } from '../language-resolution.js';
import type { CodeEditorLanguageDescription } from '../languages.js';

const createDescription = (name: string, alias: readonly string[] = []): CodeEditorLanguageDescription => ({
  alias,
  extensions: [],
  filename: undefined,
  load: () => Promise.resolve({ extension: [] }),
  name,
  support: undefined
});

const typeScript = createDescription('TypeScript', ['ts']);
const sql = createDescription('SQL');
const languages = [typeScript, sql];

describe('resolveCodeEditorLanguage', () => {
  it.each(['', 'plaintext'])('把 %j 解析为不高亮', name => {
    expect(resolveCodeEditorLanguage(name, languages)).toEqual({ kind: 'none' });
  });

  it('候选列表为空时解析为不高亮，而不是 not-found', () => {
    // 空列表是宿主明确表达的「先别高亮」，不是把语言名写错了 —— 不能报配置错误。
    expect(resolveCodeEditorLanguage('sql', [])).toEqual({ kind: 'none' });
  });

  it('按名称与别名解析到同一个描述', () => {
    expect(resolveCodeEditorLanguage('TypeScript', languages)).toEqual({ kind: 'found', description: typeScript });
    expect(resolveCodeEditorLanguage('ts', languages)).toEqual({ kind: 'found', description: typeScript });
    expect(resolveCodeEditorLanguage('TS', languages)).toEqual({ kind: 'found', description: typeScript });
  });

  it('找不到时返回 not-found 并原样保留语言名', () => {
    // 保留大小写：这个名字要出现在给宿主的错误载荷里。
    expect(resolveCodeEditorLanguage('NoSuchLang', languages)).toEqual({ kind: 'not-found', name: 'NoSuchLang' });
  });
});

describe('isSameResolvedLanguage', () => {
  it('没有上一次结果时一律判为不同', () => {
    expect(isSameResolvedLanguage(undefined, { kind: 'none' })).toBe(false);
  });

  it('两次都不高亮时判为相同', () => {
    // 从 '' 换到 'plaintext'、或候选列表清空，都是同一个处置，不该重新 dispatch。
    expect(
      isSameResolvedLanguage(
        resolveCodeEditorLanguage('', languages),
        resolveCodeEditorLanguage('plaintext', languages)
      )
    ).toBe(true);
  });

  it('解析到同一个描述时判为相同 —— 即使语言名换成了别名', () => {
    expect(
      isSameResolvedLanguage(
        resolveCodeEditorLanguage('TypeScript', languages),
        resolveCodeEditorLanguage('ts', [typeScript, createDescription('SQL')])
      )
    ).toBe(true);
  });

  it('描述换成同名的另一个实例时判为不同', () => {
    // 名字一样但 loader 换了实现，必须重新加载，否则宿主换 loader 无效。
    expect(
      isSameResolvedLanguage(
        resolveCodeEditorLanguage('TypeScript', languages),
        resolveCodeEditorLanguage('TypeScript', [createDescription('TypeScript', ['ts'])])
      )
    ).toBe(false);
  });

  it('kind 不同时判为不同', () => {
    expect(isSameResolvedLanguage({ kind: 'none' }, { kind: 'not-found', name: 'x' })).toBe(false);
    expect(isSameResolvedLanguage({ kind: 'not-found', name: 'x' }, { kind: 'found', description: sql })).toBe(false);
  });

  it('两次 not-found 的语言名不同时判为不同', () => {
    // 否则宿主只会收到第一次的配置错误，第二个错名被静默吞掉。
    expect(isSameResolvedLanguage({ kind: 'not-found', name: 'a' }, { kind: 'not-found', name: 'b' })).toBe(false);
    expect(isSameResolvedLanguage({ kind: 'not-found', name: 'a' }, { kind: 'not-found', name: 'a' })).toBe(true);
  });
});
