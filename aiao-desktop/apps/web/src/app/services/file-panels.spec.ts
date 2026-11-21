import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { FilePanelRequest, FilePanels } from './file-panels';

const request = (overrides: Partial<FilePanelRequest> = {}): FilePanelRequest => ({
  mode: 'open',
  app: { id: 'vscode', name: 'Aiao Code', icon: 'app-aiao-code' },
  accept: [],
  maxBytes: 524_288,
  suggestedName: '',
  nameLength: 255,
  restoreFocus: vi.fn(),
  ...overrides
});

function setup(): FilePanels {
  configureServices([FilePanels]);
  return TestBed.inject(FilePanels);
}

describe('FilePanels', () => {
  it('弹出面板：它成为当前面板，请求原样交给面板组件；没有面板时当前是 null', () => {
    const panels = setup();
    expect(panels.current()).toBeNull();
    const asked = request({ accept: ['.md'] });
    panels.show(asked);
    expect(panels.current()?.request).toBe(asked);
  });

  it('用户选定：结果交回给请求方，面板收起', async () => {
    const panels = setup();
    const ticket = panels.show(request());
    panels.current()!.submit({ kind: 'open', path: ['Users', 'prasenjit', 'a.md'] });
    expect(await ticket.result).toEqual({ kind: 'open', path: ['Users', 'prasenjit', 'a.md'] });
    expect(panels.current()).toBeNull();
  });

  it('用户取消：结果是 null，面板收起', async () => {
    const panels = setup();
    const ticket = panels.show(request({ mode: 'save' }));
    panels.current()!.cancel();
    expect(await ticket.result).toBeNull();
    expect(panels.current()).toBeNull();
  });

  it('请求方收回面板（窗口关闭）：面板随之关闭，结果是 null；收回幂等', async () => {
    const panels = setup();
    const ticket = panels.show(request());
    ticket.close();
    ticket.close();
    expect(await ticket.result).toBeNull();
    expect(panels.current()).toBeNull();
  });

  it('面板结束之后再提交、再取消都不起作用：不会把已经被收回的面板的选择交出去', async () => {
    const panels = setup();
    const ticket = panels.show(request({ mode: 'save' }));
    const panel = panels.current()!;
    ticket.close();
    panel.submit({ kind: 'save', dir: ['Users'], name: 'late.txt', replace: true });
    panel.cancel();
    expect(await ticket.result).toBeNull();
  });

  it('同一个面板只结算一次：先取消再提交，结果仍是取消', async () => {
    const panels = setup();
    const ticket = panels.show(request());
    const panel = panels.current()!;
    panel.cancel();
    panel.submit({ kind: 'open', path: ['x'] });
    expect(await ticket.result).toBeNull();
  });

  it('不同窗口的面板排成一摞：最上面的是当前面板，它结束后下面的接着成为当前', async () => {
    const panels = setup();
    const first = panels.show(request());
    const lower = panels.current()!;
    const second = panels.show(request({ app: { id: 'notes', name: 'Notes', icon: 'app-notes' } }));
    expect(panels.current()?.request.app.id).toBe('notes');
    panels.current()!.cancel();
    expect(await second.result).toBeNull();
    expect(panels.current()).toBe(lower);
    first.close();
    expect(panels.current()).toBeNull();
  });

  it('收回的是下面的面板：当前面板不受影响', async () => {
    const panels = setup();
    const lower = panels.show(request());
    panels.show(request({ app: { id: 'notes', name: 'Notes', icon: 'app-notes' } }));
    const top = panels.current()!;
    lower.close();
    expect(await lower.result).toBeNull();
    expect(panels.current()).toBe(top);
  });
});
