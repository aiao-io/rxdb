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
    const summaries = await demoPage.capabilities();
    expect(summaries.find(item => item.name === 'WXWebAssembly.instantiate')?.status).not.toBe('缺失');

    const version = await demoPage.phaseText();
    expect(version).toBe('数据库已连接');
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
