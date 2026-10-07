import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import ts from 'typescript';

function createPageHarness() {
  const sourceFile = resolve(process.cwd(), '../dev-rxdb-miniprogram/src/pages/index/index.tsx');
  const source = readFileSync(sourceFile, 'utf8');
  const compiled = ts.transpileModule(source, {
    fileName: sourceFile,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  let load!: () => void;
  let unload!: () => void;
  let release!: (value: unknown) => void;
  const opening = new Promise<unknown>(accept => {
    release = accept;
  });
  const calls = { open: 0, list: 0, dispose: 0, reconnect: 0 };
  const passed = { status: 'passed', detail: 'review fixture' };
  const demo = {
    listTodos: async () => {
      calls.list += 1;
      return [];
    },
    dispose: async () => {
      calls.dispose += 1;
    },
    verifyReconnect: async () => {
      calls.reconnect += 1;
      return { crud: passed, reconnect: passed };
    }
  };
  const modules: Record<string, unknown> = {
    '@tarojs/components': Object.fromEntries(
      ['Button', 'Checkbox', 'CheckboxGroup', 'Input', 'Label', 'Text', 'View'].map(name => [name, () => null])
    ),
    '@tarojs/taro': {
      useLoad: (callback: () => void) => {
        load = callback;
      },
      useUnload: (callback: () => void) => {
        unload = callback;
      }
    },
    react: {
      useRef: () => ({ current: undefined }),
      useState: (initial: unknown) => [initial, () => undefined],
      useCallback: (callback: unknown) => callback
    },
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null },
    '../../benchmark/stats': { formatBenchmarkValue: () => '' },
    '../../debug-log': { logFailure: () => undefined },
    '../../runtime-preflight': {
      currentDemoRuntime: () => ({}),
      inspectMiniProgramRuntime: () => [],
      getMiniProgramRuntimeReferences: () => ({})
    },
    '../../rxdb-demo': {
      openMiniProgramRxdbDemo: () => {
        calls.open += 1;
        return opening;
      }
    },
    './index.scss': {}
  };
  const exports: Record<string, unknown> = {};
  const execute = new Script(`(function(require, module, exports) { ${compiled}\n })`, {
    filename: sourceFile
  }).runInThisContext() as (
    require: (name: string) => unknown,
    module: { exports: Record<string, unknown> },
    exports: Record<string, unknown>
  ) => void;
  execute(
    name => {
      if (!Object.hasOwn(modules, name)) throw new Error(`unhandled review module: ${name}`);
      return modules[name];
    },
    { exports },
    exports
  );
  (exports['default'] as () => unknown)();
  return {
    load: () => load(),
    unload: () => unload(),
    completeOpen: () => release({ demo, capabilities: [], sqliteVersion: 'review', launchPersistence: passed }),
    calls
  };
}

test('评审：页面先 unload、引导后完成时，迟到的 demo 必须立即释放', async () => {
  const page = createPageHarness();
  page.load();
  expect(page.calls.open).toBe(1);
  page.unload();
  page.completeOpen();
  await expect.poll(() => page.calls.list).toBeGreaterThan(0);
  expect(page.calls.dispose).toBe(1);
  expect(page.calls.reconnect).toBe(0);
});

test('评审对照：已就绪页面 unload 会释放现有 demo', async () => {
  const page = createPageHarness();
  page.load();
  page.completeOpen();
  await expect.poll(() => page.calls.reconnect).toBe(1);
  page.unload();
  expect(page.calls.dispose).toBe(1);
});
