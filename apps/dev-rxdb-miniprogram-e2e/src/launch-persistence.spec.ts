import { expect, relaunchDemoPage, resetDatabase, test } from './fixtures';

/**
 * 「跨启动持久化」的完整状态迁移。
 *
 * 这条检查在探针已存在时恒为「通过」，所以**必须先清库**，否则它是一条永远不会红的断言。
 * 清库之后它必须依次经过：首次启动写入探针（待重启）→ 重新启动读回探针（通过）。
 *
 * `test.describe.serial` 不是可选项：三条用例共享同一份落盘状态，顺序一乱语义就没了。
 * `playwright.config.ts` 的 `workers: 1` 提供了另一半保证——没有第二个实例来抢同一个
 * `wx.env.USER_DATA_PATH`。
 */
test.describe.serial('跨启动持久化', () => {
  test('清库后首次启动写入探针，检查项处于「待重启」', async ({ miniProgram }) => {
    await resetDatabase(miniProgram);
    const demoPage = await relaunchDemoPage(miniProgram);

    const check = await demoPage.check('跨启动持久化');
    expect(check.status).toBe('待重启');
    expect(check.detail).toContain('已写入探针');
  });

  test('再次启动读回上次写入的探针，检查项转为「通过」', async ({ miniProgram }) => {
    const demoPage = await relaunchDemoPage(miniProgram);

    const check = await demoPage.check('跨启动持久化');
    expect(check.status).toBe('通过');
    expect(check.detail).toContain('已读到上次启动写入的持久化探针');
  });

  test('再清一次库又回到「待重启」，证明这条检查不是恒真', async ({ miniProgram }) => {
    await resetDatabase(miniProgram);
    const demoPage = await relaunchDemoPage(miniProgram);

    expect(await demoPage.check('跨启动持久化')).toMatchObject({ status: '待重启' });
  });
});
