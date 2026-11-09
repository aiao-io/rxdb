import { RxDBClientGenerator } from '@aiao/rxdb-client-generator';
import { describe, expect, it, vi } from 'vitest';
import { GENERATOR_DEMOS, generateSourceState } from './generator-state';

const sourceText = (json: string): string =>
  generateSourceState(json)
    .sources.map(source => source.getText())
    .join('\n');

describe('generateSourceState', () => {
  it.each(GENERATOR_DEMOS.map(demo => [demo.name, demo] as const))(
    '内置示例 %s 能直接生成代码',
    (_name, demo) => {
      const state = generateSourceState(JSON.stringify(demo, null, 2));

      expect(state.error).toBeNull();
      expect(state.sources.length).toBeGreaterThan(0);
    }
  );

  it('Menu 示例走树生成器，产物带树查询方法', () => {
    const menu = GENERATOR_DEMOS.find(demo => demo.repository === 'TreeRepository');
    if (menu === undefined) throw new Error('内置示例缺少 TreeRepository 实体');

    expect(sourceText(JSON.stringify(menu))).toContain('findDescendants');
  });

  it('空输入既没有产物也没有错误', () => {
    expect(generateSourceState('')).toEqual({ sources: [], error: null });
  });

  it('exposes invalid JSON instead of presenting an empty result', () => {
    const state = generateSourceState('{ invalid json');

    expect(state.sources).toEqual([]);
    expect(state.error).toBeInstanceOf(Error);
  });

  it('exposes generator failures', () => {
    vi.spyOn(RxDBClientGenerator.prototype, 'exec').mockImplementationOnce(() => {
      throw new Error('generation failed');
    });

    const state = generateSourceState(JSON.stringify({ name: 'Todo', properties: [] }));

    expect(state.sources).toEqual([]);
    expect(state.error).toEqual(new Error('generation failed'));
  });
});
