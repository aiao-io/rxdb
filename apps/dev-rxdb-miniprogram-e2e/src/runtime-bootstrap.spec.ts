import { expect, test } from './fixtures';
import { readRandomSource, RUNTIME_SOURCE_MARKER } from './runtime-probes';

/**
 * US-209 的核心验收：适配器能在**真实微信运行时**上把 RxDB 需要的同步能力补齐。
 *
 * 这几条是单元测试原理上做不到的——Vitest 里的 `wx` 是我们自己写的桩，
 * 它当然满足我们自己的期望。只有开发者工具里的真 `wx` 能证明桥接确实成立。
 */
test.describe('运行时引导', () => {
  test('所有运行时能力都可用，没有一项缺失', async ({ demoPage }) => {
    const capabilities = await demoPage.capabilities();

    expect(capabilities.length).toBeGreaterThan(0);
    expect(capabilities.filter(item => item.status === '缺失')).toEqual([]);
  });

  test('安全随机源走微信桥接，而不是缺失或降级实现', async ({ demoPage }) => {
    // UI 上的读数：`capabilityStatus()` 把 source 翻成中文
    const capability = await demoPage.capability('crypto.getRandomValues');
    expect(capability.status).toBe('微信桥接');

    // 运行时里的读数：直接读实现上的来源标记，绕开 UI 可能的翻译错误
    const source = await demoPage.evaluate(readRandomSource, RUNTIME_SOURCE_MARKER);
    expect(source).toBe('wechat');
  });

  test('TextEncoder / TextDecoder / performance.now 由 polyfill 补齐', async ({ demoPage }) => {
    const polyfilled = ['TextEncoder', 'TextDecoder', 'performance.now'];
    const readings = await Promise.all(polyfilled.map(name => demoPage.capability(name)));

    // 微信基础库若哪天原生提供了它们，这里会变成「原生」——那也是可用状态，不该红。
    expect(readings.map(item => item.status).every(status => status === 'Polyfill' || status === '原生')).toBe(true);
  });

  test('SQLite 版本号能读出来，证明 wa-sqlite WASM 真的实例化了', async ({ demoPage }) => {
    // 只断言版本号，别的都是恒真：能力表只能证明 `WXWebAssembly.instantiate` 这个函数存在，
    // 证明不了它被调通；phase 徽标由 fixture 的 `waitUntilReady()` 保证，断言它就是断言恒真；
    // 「没有能力缺失」上面第一条用例已经用更强的形式覆盖了。
    //
    // 这个值来自 `adapter.version()` 的 `SELECT sqlite_version()`，是整条链路
    // （WASM 实例化 → VFS 挂载 → SQL 真的执行）唯一的可观测证据。页面初值是「等待连接」，
    // 所以形状断言同时也挡住了「没连上但页面没红」这种半死状态。
    expect(await demoPage.sqliteVersion()).toMatch(/^3\.\d+\.\d+$/);
  });

  test('Todo CRUD 自检与断开重连验证都通过', async ({ demoPage }) => {
    expect(await demoPage.check('Todo CRUD 自检')).toMatchObject({ status: '通过' });
    expect(await demoPage.check('断开重连验证')).toMatchObject({ status: '通过' });
  });

  test('重跑验证是幂等的，第二次仍然全通过', async ({ demoPage }) => {
    await demoPage.rerunVerification();

    expect(await demoPage.check('Todo CRUD 自检')).toMatchObject({ status: '通过' });
    expect(await demoPage.check('断开重连验证')).toMatchObject({ status: '通过' });
  });
});
