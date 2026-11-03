import { describe, expect, it } from 'vitest';
import { declaredDependencies } from './compiler-dependencies.js';

describe('固定依赖清单', () => {
  it('没有清单的受控代码 fixture 可直接编译，二进制 JSON 也能读取', () => {
    expect(declaredDependencies({ template: 'react', entry: 'main.ts', files: {} })).toBeUndefined();
    expect(
      declaredDependencies({
        template: 'react',
        entry: 'main.ts',
        files: { 'package.json': new TextEncoder().encode('{"dependencies":{"react":"19.3.1"}}') }
      })
    ).toEqual(new Set(['react']));
  });

  it.each(['{', 'null', '[]', '{"dependencies":null}', '{"dependencies":[]}'])('拒绝无效的运行依赖清单：%s', source => {
    expect(() =>
      declaredDependencies({ template: 'react', entry: 'main.ts', files: { 'package.json': source } })
    ).toThrow('package.json');
  });
});
