import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { CodeEditorProps, CodeEditorSetup, CodeEditorTheme } from '../index';
import { CodeEditor } from '../index';

it('exports the component and stable public option types', () => {
  expect(CodeEditor).toBeDefined();
  expectTypeOf<CodeEditorSetup>().toEqualTypeOf<'basic' | 'minimal' | null>();
  expectTypeOf<CodeEditorTheme>().toEqualTypeOf<'light' | 'dark'>();
  expectTypeOf<CodeEditorProps['setup']>().toEqualTypeOf<CodeEditorSetup | undefined>();
  expectTypeOf<CodeEditorProps['theme']>().toEqualTypeOf<CodeEditorTheme | undefined>();
});

/**
 * CEV-006：props / emits / expose 此前只有接口级标题，成员没有契约说明 ——
 * `root`/`autoFocus` 仅初始化读取、`value` 的外部同步语义、`languages` 的 identity 成本、
 * 错误 fallback 都没有进入生成声明，消费者在 IDE 里看到的只是类型。
 *
 * 静态门禁而非类型断言：TSDoc 不进类型系统，只能从源码判。与 React 侧
 * `CodeEditor.spec.tsx` 的同名门禁同构。
 */
describe('公开接口的 TSDoc 门禁（CEV-006）', () => {
  const source = readFileSync(join(import.meta.dirname, '..', 'code-editor.types.ts'), 'utf8');

  const membersOf = (interfaceName: string): { all: string[]; undocumented: string[] } => {
    const block = new RegExp(String.raw`export interface ${interfaceName} \{\n([\s\S]*?)\n\}\n`).exec(source);
    if (!block) throw new Error(`interface ${interfaceName} not found`);

    const lines = block[1].split('\n');
    const members = lines
      .map((line, index) => ({ index, name: /^ {2}(?:readonly )?('[^']+'|\w+)\??\s*[:(]/.exec(line)?.[1] }))
      .filter((entry): entry is { index: number; name: string } => entry.name !== undefined);

    return {
      all: members.map(entry => entry.name),
      undocumented: members.filter(entry => !lines[entry.index - 1]?.trimEnd().endsWith('*/')).map(entry => entry.name)
    };
  };

  // 成员条数先钉死：正则漏匹配时「没有未文档化成员」会假绿，
  // 顺带把公开面锁住 —— 新增 prop / 事件必须同时更新这里和 TSDoc。
  it.each([
    ['CodeEditorProps', 17],
    ['CodeEditorEmits', 5],
    ['CodeEditorExpose', 4]
  ])('%s 恰好有 %i 个成员，且每个都有 TSDoc', (interfaceName, count) => {
    const { all, undocumented } = membersOf(interfaceName);

    expect(all).toHaveLength(count);
    expect(undocumented).toEqual([]);
  });
});
