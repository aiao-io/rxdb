import { describe, expect, it, vi } from 'vitest';
import { connectRxDB } from './rxdb-initializer';

describe('connectRxDB', () => {
  /** US-210：适配器名由调用方给出，两个后端（wa-sqlite / desktop）走同一条连接路径。 */
  it.each(['wa-sqlite', 'desktop'])('waits for the %s connection', async adapterName => {
    const adapter = {};
    const connect = vi.fn().mockResolvedValue(adapter);
    const markFailed = vi.fn();

    await expect(connectRxDB({ connect } as never, { markFailed }, adapterName)).resolves.toBeUndefined();
    expect(connect).toHaveBeenCalledWith(adapterName);
    expect(markFailed).not.toHaveBeenCalled();
  });

  /**
   * TAURI-01：这是白屏的根因。
   * `provideAppInitializer(() => connectRxDB(inject(RxDB)))` 里 initializer 一旦 reject，
   * Angular 会**中止 bootstrap** —— 组件树根本不渲染，`main.ts` 只有一句 console.error，
   * 用户看到的是一个空窗口。而 `home.page.html` 里那块 `@case ('error')` 的诊断面板
   * 恰恰**永远到不了**：它需要组件渲染出来才有机会显示。
   *
   * 所以连接失败不能再向上抛 —— 它必须变成应用内的一个状态。
   */
  it('连接失败时不得让 bootstrap 中止，而要把错误交给应用内状态', async () => {
    const failure = new Error('OPFS 不可用');
    const connect = vi.fn().mockRejectedValue(failure);
    const markFailed = vi.fn();

    await expect(connectRxDB({ connect } as never, { markFailed }, 'wa-sqlite')).resolves.toBeUndefined();
    expect(markFailed).toHaveBeenCalledWith(failure);
  });
});
