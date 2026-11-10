/**
 * `useEntityChange` 文档示例的真实编译与渲染（RV-01a1bb334bed）。
 *
 * @remarks
 * README 与 TSDoc 的推荐用法是一段 `<script setup>` 单文件组件。返回值是普通对象、`value` 才是
 * `Ref`，模板只自动解包顶层 `Ref`：照抄示例时读错一层，标题就一直是空的。这里把两处示例原文交给
 * `vue/compiler-sfc` 按生产模式（`inlineTemplate`）编译、挂载，验证初值与 patch 之后的标题都看得见。
 */
import { mount } from '@vue/test-utils';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Subject } from 'rxjs';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vue from 'vue';
import { compileScript, parse } from 'vue/compiler-sfc';
import { useEntityChange } from '../use-entity-change';

const rxdbMocks = vi.hoisted(() => ({ getEntityStatus: vi.fn() }));

vi.mock('@aiao/rxdb', () => ({ getEntityStatus: rxdbMocks.getEntityStatus }));

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path: string): string => readFileSync(resolve(PACKAGE_ROOT, path), 'utf8');

/** README 里调用 `useEntityChange` 的那段 `vue` 代码块。 */
const readmeExample = (): string => {
  const blocks = [...read('README.md').matchAll(/```vue\n([\s\S]*?)```/g)].map(match => match[1]);
  const example = blocks.find(block => block.includes('useEntityChange('));
  if (!example) throw new Error('README 里没有 useEntityChange 的 vue 示例');
  return example;
};

/** `useEntityChange` TSDoc `@example` 里的 `vue` 代码块（去掉注释前缀）。 */
const tsdocExample = (): string => {
  const source = read('src/use-entity-change.ts');
  const example = /\* ```vue\n([\s\S]*?)\n \* ```/.exec(source.slice(source.indexOf('@example')));
  if (!example) throw new Error('TSDoc 里没有 useEntityChange 的 vue 示例');
  return example[1].replace(/^ \*( |$)/gm, '');
};

/** 按生产模式编译单文件组件，模块依赖只给 `vue` 与本包的 `useEntityChange`。 */
const compileExample = (sfc: string): vue.Component => {
  const { descriptor } = parse(sfc, { filename: 'Example.vue' });
  const script = compileScript(descriptor, { id: 'example', inlineTemplate: true });
  const { outputText } = ts.transpileModule(script.content, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const modules: Record<string, unknown> = { vue, '@aiao/rxdb-vue': { useEntityChange } };
  const exported: { default?: vue.Component } = {};
  new Function('require', 'exports', outputText)((id: string) => modules[id], exported);
  if (!exported.default) throw new Error('示例没有导出组件');
  return exported.default;
};

describe('useEntityChange 文档示例（RV-01a1bb334bed）', () => {
  let patches: Subject<void>;

  beforeEach(() => {
    vi.useFakeTimers();
    patches = new Subject<void>();
    rxdbMocks.getEntityStatus.mockReset();
    rxdbMocks.getEntityStatus.mockReturnValue({ patches$: patches.asObservable() });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['README', readmeExample],
    ['TSDoc', tsdocExample]
  ])('%s 示例照抄即可显示初值与 patch 之后的标题', async (_source, example) => {
    const todo = { id: 'todo-1', title: 'first' };
    const wrapper = mount(compileExample(example()), { props: { todo } });
    expect(wrapper.text()).toBe('first');

    todo.title = 'updated';
    patches.next();
    await vi.advanceTimersByTimeAsync(200);
    await vue.nextTick();

    expect(wrapper.text()).toBe('updated');
    wrapper.unmount();
  });
});
