import { expect, relaunchDemoPage, test } from './fixtures';

/**
 * 「跨启动持久化」的完整状态迁移。
 *
 * 这条检查在探针已存在时恒为「通过」，所以**必须先把探针清掉**，否则它是一条永远不会红的断言。
 * 清掉之后它必须依次经过：首次启动写入探针（待重启）→ 重新启动读回探针（通过）。
 *
 * 复位用页面上的「重置数据」，而不是删掉落盘目录：目录在连接活着时由 VFS 缓冲着，
 * 此刻删它，连接关闭时的脏页回写会把整个库原样刷回来，探针「复活」，这条用例会毫无道理地红。
 *
 * `test.describe.serial` 不是可选项：三条用例共享同一份落盘状态，顺序一乱语义就没了。
 * `playwright.config.ts` 的 `workers: 1` 提供了另一半保证——没有第二个实例来抢同一个
 * `wx.env.USER_DATA_PATH`。
 */
test.describe.serial('跨启动持久化', () => {
  test('清掉探针后首次启动重新写入，检查项处于「待重启」', async ({ demoPage, miniProgram }) => {
    await demoPage.resetDemoData();
    const relaunched = await relaunchDemoPage(miniProgram);

    const check = await relaunched.check('跨启动持久化');
    expect(check.status).toBe('待重启');
    expect(check.detail).toContain('已写入探针');
  });

  test('再次启动读回上次写入的探针，检查项转为「通过」', async ({ miniProgram }) => {
    const demoPage = await relaunchDemoPage(miniProgram);

    const check = await demoPage.check('跨启动持久化');
    expect(check.status).toBe('通过');
    expect(check.detail).toContain('已读到上次启动写入的持久化探针');
  });

  test('再清一次探针又回到「待重启」，证明这条检查不是恒真', async ({ demoPage, miniProgram }) => {
    await demoPage.resetDemoData();
    const relaunched = await relaunchDemoPage(miniProgram);

    expect(await relaunched.check('跨启动持久化')).toMatchObject({ status: '待重启' });
  });
});
