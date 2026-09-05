/**
 * DevTools 授权档的页内读取（US-905 阶段 2）。
 *
 * @remarks
 * 这一侧只有两件事可测，但两件都只会在运行时以「授权档不对」的形态暴露，编译器一句话都不说：
 *
 * 1. **挂载键两端一致**——Rust 的注入脚本与页面读的是同一个字符串。写错了页面永远读不到配置，
 *    表现为「设了 `DEV_RXDB_DEVTOOLS_MUTATION=allow` 却还是只读」，而那与「档位没生效」
 *    在现象上完全一样。
 * 2. **没有配置时返回空对象**——不是一份默认档。空对象让调用点用展开语法把「没配置」表达成
 *    完全不传那两个键，交回库自己的默认值；在这里编一个默认值就是第二个真相源。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEVTOOLS_RUNTIME_CONFIG_KEY, devToolsRuntimeConfig } from './setup_rxdb_desktop';

const RUST_SOURCE = readFileSync(
  resolve(import.meta.dirname, '../../src-tauri/src/devtools_config.rs'),
  'utf8'
);

describe('DevTools 授权档的页内读取', () => {
  it('挂载键与 Rust 注入脚本用的是同一个字符串', () => {
    // 页面与 Rust 分属两条工具链，只能各写一次字面量——所以在这里把两处钉在一起。
    expect(RUST_SOURCE).toContain(`pub const CONFIG_GLOBAL_KEY: &str = "${DEVTOOLS_RUNTIME_CONFIG_KEY}";`);
  });

  it('三个环境变量与 Electron 侧逐字同名', () => {
    // 同一件事在两个宿主上叫两个名字，是文档与肌肉记忆同时出错的来源。
    expect(RUST_SOURCE).toContain('pub const ENABLE_ENV: &str = "DEV_RXDB_DEVTOOLS";');
    expect(RUST_SOURCE).toContain('pub const CAPABILITY_ENV: &str = "DEV_RXDB_DEVTOOLS_CAPABILITY";');
    expect(RUST_SOURCE).toContain('pub const MUTATION_ENV: &str = "DEV_RXDB_DEVTOOLS_MUTATION";');
  });

  it('没有注入配置时返回空对象，而不是一份默认档', () => {
    delete (globalThis as Record<string, unknown>)[DEVTOOLS_RUNTIME_CONFIG_KEY];

    // `{}` 与 `{ capabilities: 'full' }` 的差别正是「交回库默认」与「在这里复制一份默认」。
    expect(devToolsRuntimeConfig()).toEqual({});
  });

  it('把注入的档位翻译成连接器选项的字段名', () => {
    (globalThis as Record<string, unknown>)[DEVTOOLS_RUNTIME_CONFIG_KEY] = Object.freeze({
      capability: 'readonly',
      mutationPolicy: 'allow'
    });

    // wire 上叫 `capability`，连接器选项里叫 `capabilities`；翻译只发生在这一处。
    expect(devToolsRuntimeConfig()).toEqual({ capabilities: 'readonly', mutationPolicy: 'allow' });

    delete (globalThis as Record<string, unknown>)[DEVTOOLS_RUNTIME_CONFIG_KEY];
  });
});
