/**
 * 调试窗口的宿主访问面（US-905 阶段 2 的 D2 决定）。
 *
 * @remarks
 * 这份用例钉的不是「还没实现」，而是一条**决定**：调试窗口不获得在被检查页里跑脚本或
 * 重载页面的能力。理由见服务的模块注释——注入的脚本跑在主窗口的授权上下文里，
 * capability / descriptor / mutation policy 三层一条也管不着它。
 *
 * 钉住它是因为反向改动毫无阻力：给 Rust 加一条把命令路由到 `main` 的通道，两个方法就都能
 * 「顺手实现掉」，而且看起来像是在补一个 TODO。
 */
import { describe, expect, it } from 'vitest';
import { TauriHostAccessService } from './tauri-host-access.service';

describe('TauriHostAccessService', () => {
  it('被检查页天然可访问：状态恒为 granted', () => {
    const service = new TauriHostAccessService();

    // Tauri 没有 Chrome 的授权 UI，也没有不可注入的页面——这里没有第二种状态可言。
    expect(service.state()).toBe('granted');
    expect(service.error()).toBeNull();
  });

  it('requestAccess 恒真', async () => {
    await expect(new TauriHostAccessService().requestAccess()).resolves.toBe(true);
  });

  it('reloadInspectedPage 明确拒绝，而不是静默空操作', () => {
    // 空操作会把「不提供这个能力」伪装成「执行成功」，面板于是等一个永远不会发生的刷新。
    expect(() => new TauriHostAccessService().reloadInspectedPage()).toThrowError(/deliberately not available/);
  });

  it('evaluate 明确拒绝，且拒绝走 Promise 而不是同步抛出', async () => {
    const service = new TauriHostAccessService();

    // 同步抛出会绕过调用方的 catch/finally，挂在 finally 里的收尾（解锁 UI、清请求表）一条都不跑。
    const pending = service.evaluate('1 + 1', 'r-1');

    expect(pending).toBeInstanceOf(Promise);
    await expect(pending).rejects.toThrowError(/deliberately not available/);
  });
});
