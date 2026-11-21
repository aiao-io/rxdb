import { describe, expect, it, vi } from 'vitest';
import { UnsavedInput, type LeaveTarget } from './unsaved-input.js';

/** 记下 `beforeunload` 监听的窗口替身：派发一次离开，返回浏览器会不会提示（监听取消了默认行为）。 */
function leaveTarget() {
  const target = new EventTarget();
  const add = vi.spyOn(target, 'addEventListener');
  const remove = vi.spyOn(target, 'removeEventListener');
  const leave = () => {
    const event = new Event('beforeunload', { cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  return { target: target as unknown as LeaveTarget, add, remove, leave };
}

describe('编辑界面里未保存的输入（ADMIN-US-205 AC#5）', () => {
  it('报告有未保存的输入时注册离开提示，没有了就撤下；只在状态变化时通知重绘', () => {
    const { target, add, remove, leave } = leaveTarget();
    const changed = vi.fn();
    const unsaved = new UnsavedInput(target, changed);
    const report = unsaved.open();
    expect(unsaved.dirty).toBe(false);
    expect(leave()).toBe(false);

    report(true);
    report(true);
    expect(unsaved.dirty).toBe(true);
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    expect(leave()).toBe(true);

    report(false);
    report(false);
    expect(unsaved.dirty).toBe(false);
    expect(remove).toHaveBeenCalledWith('beforeunload', add.mock.calls[0]![1]);
    expect(leave()).toBe(false);
    expect(changed.mock.calls).toEqual([[true], [false]]);
  });

  it('只认当前打开着的编辑界面：换了编辑界面之后，旧入口迟到的报告不再算数', () => {
    const { target, leave } = leaveTarget();
    const changed = vi.fn();
    const unsaved = new UnsavedInput(target, changed);
    const first = unsaved.open();
    const second = unsaved.open();

    first(true);
    expect(unsaved.dirty).toBe(false);
    expect(leave()).toBe(false);
    second(true);
    expect(unsaved.dirty).toBe(true);
    expect(changed.mock.calls).toEqual([[true]]);
  });

  it('关闭编辑界面：撤下离开提示、作废报告入口，返回卸载时有没有随之丢掉的输入；关闭本身不通知重绘', () => {
    const { target, remove, leave } = leaveTarget();
    const changed = vi.fn();
    const unsaved = new UnsavedInput(target, changed);
    const report = unsaved.open();
    report(true);
    changed.mockClear();

    expect(unsaved.close()).toBe(true);
    expect(unsaved.dirty).toBe(false);
    expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    expect(leave()).toBe(false);
    // 卸载途中实体列表补报的 false、之后迟到的 true 都不再算数
    report(false);
    report(true);
    expect(unsaved.dirty).toBe(false);
    expect(changed).not.toHaveBeenCalled();
    expect(unsaved.close()).toBe(false);
  });
});
