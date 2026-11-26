import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PageWorkbench,
  registerPageWorkbench,
  shortcutAction,
  type PageWorkbenchRegistration,
  type WorkbenchAction
} from './page-workbench';
import { Toasts } from './toasts';

function action(overrides: Partial<{ disabled: string | null; pending: boolean; run: () => Promise<unknown> }> = {}) {
  return {
    run: vi.fn(overrides.run ?? (() => Promise.resolve())),
    count: signal(1),
    pending: signal(overrides.pending ?? false),
    disabledReason: signal(overrides.disabled ?? null)
  } satisfies WorkbenchAction;
}

function registration(overrides: Partial<PageWorkbenchRegistration> = {}): PageWorkbenchRegistration {
  return {
    title: 'Todo',
    scopeLabel: '本页：Todo',
    undo: action(),
    redo: action(),
    history: null,
    push: null,
    pull: null,
    ...overrides
  };
}

const keydown = (init: KeyboardEventInit, target: EventTarget = document.body) => {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

afterEach(() => document.body.replaceChildren());

describe('PageWorkbench', () => {
  it('页面进入时登记、离开时注销；后进的页面不会被先走的页面注销掉', () => {
    const workbench = TestBed.inject(PageWorkbench);
    const first = registration({ title: 'Todo' });
    const second = registration({ title: '商品' });

    workbench.register(first);
    workbench.register(second);
    workbench.unregister(first);

    expect(workbench.current()).toBe(second);
    workbench.unregister(second);
    expect(workbench.current()).toBeNull();
  });

  it('registerPageWorkbench 跟着组件的生命周期登记与注销', () => {
    const page = registration();
    @Component({ template: '' })
    class Page {
      constructor() {
        registerPageWorkbench(page);
      }
    }
    const fixture = TestBed.createComponent(Page);
    const workbench = TestBed.inject(PageWorkbench);

    expect(workbench.current()).toBe(page);
    fixture.destroy();
    expect(workbench.current()).toBeNull();
  });

  it('执行命令：不可用或进行中时不执行；失败的原因弹成一条错误消息', async () => {
    const workbench = TestBed.inject(PageWorkbench);
    const toasts = TestBed.inject(Toasts);
    const disabled = action({ disabled: '没有可撤销的修改' });
    const busy = action({ pending: true });
    const failing = action({ run: () => Promise.reject(new Error('外键约束失败')) });

    await workbench.run(disabled);
    await workbench.run(busy);
    await workbench.run(failing);
    await workbench.run(action());

    expect(disabled.run).not.toHaveBeenCalled();
    expect(busy.run).not.toHaveBeenCalled();
    expect(toasts.list()).toEqual([
      expect.objectContaining({ kind: 'error', message: '外键约束失败', source: 'workbench' })
    ]);
  });

  it('⌘/Ctrl+Z 撤销、⌘/Ctrl+Shift+Z 重做，在页面空白处触发登记的命令', async () => {
    const workbench = TestBed.inject(PageWorkbench);
    const page = registration();
    workbench.register(page);

    const undoEvent = keydown({ key: 'z', metaKey: true });
    keydown({ key: 'Z', ctrlKey: true, shiftKey: true });
    await Promise.resolve();

    expect(undoEvent.defaultPrevented).toBe(true);
    expect(page.undo?.run).toHaveBeenCalledTimes(1);
    expect(page.redo?.run).toHaveBeenCalledTimes(1);
  });
});

describe('shortcutAction', () => {
  const page = registration();
  const event = (init: KeyboardEventInit, target?: EventTarget) => {
    const keyboardEvent = new KeyboardEvent('keydown', init);
    if (target) Object.defineProperty(keyboardEvent, 'target', { value: target });
    return keyboardEvent;
  };

  it('Ctrl+Y 也是重做；不带修饰键、带 Alt 的不算', () => {
    expect(shortcutAction(event({ key: 'y', ctrlKey: true }), page)).toBe(page.redo);
    expect(shortcutAction(event({ key: 'z' }), page)).toBeNull();
    expect(shortcutAction(event({ key: 'z', metaKey: true, altKey: true }), page)).toBeNull();
  });

  it('焦点在输入框、文本域、下拉框或可编辑区域里，或正在组字：交给浏览器原生的撤销', () => {
    const input = document.body.appendChild(document.createElement('input'));
    const editable = document.body.appendChild(document.createElement('div'));
    editable.setAttribute('contenteditable', 'true');

    expect(shortcutAction(event({ key: 'z', metaKey: true }, input), page)).toBeNull();
    expect(shortcutAction(event({ key: 'z', metaKey: true }, editable), page)).toBeNull();
    expect(shortcutAction(event({ key: 'z', metaKey: true, isComposing: true }), page)).toBeNull();
  });

  it('当前页面没有登记、或没有登记撤销时什么也不做', () => {
    expect(shortcutAction(event({ key: 'z', metaKey: true }), null)).toBeNull();
    expect(shortcutAction(event({ key: 'z', metaKey: true }), registration({ undo: null }))).toBeNull();
  });
});
