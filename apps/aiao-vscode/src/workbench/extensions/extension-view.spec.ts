// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { mountMarkdownExtensionView } from './extension-view.js';

function fixture() {
  const host = document.createElement('div');
  const options = { onToggle: vi.fn(), onInstall: vi.fn(), onUninstall: vi.fn(), onPreview: vi.fn() };
  const view = mountMarkdownExtensionView(host, options);
  const state = { installed: true, enabled: true, status: 'idle' as const, operation: null, markdown: true, error: '' };
  view.render(state);
  return { host, options, view, state };
}

describe('扩展视图的安装与卸载入口', () => {
  it('已安装扩展显示数量、启停与卸载，未安装时只提供安装', () => {
    const f = fixture();
    expect(f.host.querySelector('[data-extension-group]')?.textContent).toContain('已安装');
    f.host.querySelector<HTMLButtonElement>('[data-extension-uninstall]')!.click();
    expect(f.options.onUninstall).toHaveBeenCalledOnce();
    f.view.render({ ...f.state, installed: false, enabled: false, status: 'uninstalled' });
    expect(f.host.querySelector('[data-extension-group]')?.textContent).toContain('可安装');
    expect(f.host.querySelector<HTMLElement>('[data-extension-toggle]')!.hidden).toBe(true);
    expect(f.host.querySelector<HTMLElement>('[data-extension-uninstall]')!.hidden).toBe(true);
    f.host.querySelector<HTMLButtonElement>('[data-extension-install]')!.click();
    expect(f.options.onInstall).toHaveBeenCalledOnce();
    f.view.dispose();
  });

  it('安装中锁定操作并显示真实错误，重试入口恢复', () => {
    const f = fixture();
    f.view.render({ ...f.state, installed: false, enabled: false, status: 'uninstalled', operation: 'installing' });
    expect(f.host.querySelector<HTMLButtonElement>('[data-extension-install]')!.disabled).toBe(true);
    expect(f.host.querySelector('[data-extension-status]')?.textContent).toBe('正在安装…');
    f.view.render({ ...f.state, installed: false, enabled: false, status: 'uninstalled', error: '资源校验失败' });
    expect(f.host.querySelector<HTMLButtonElement>('[data-extension-install]')!.disabled).toBe(false);
    expect(f.host.querySelector('[role="alert"]')?.textContent).toBe('资源校验失败');
    f.view.dispose();
  });

  it('支持名称、发布者、扩展 ID 及 @installed / @enabled / @disabled 筛选', () => {
    const f = fixture();
    const search = f.host.querySelector<HTMLInputElement>('[data-extension-search]')!;
    const card = f.host.querySelector<HTMLElement>('.wb-extension-details')!;
    const query = (value: string) => {
      search.value = value;
      search.dispatchEvent(new Event('input'));
    };
    query('@installed markdown');
    expect(card.hidden).toBe(false);
    query('@disabled');
    expect(card.hidden).toBe(true);
    query('@enabled shd101wyy');
    expect(card.hidden).toBe(false);
    query('@id:shd101wyy.markdown-preview-enhanced');
    expect(card.hidden).toBe(false);
    query('不存在');
    expect(card.hidden).toBe(true);
    expect(f.host.textContent).toContain('未找到扩展');
    f.view.dispose();
  });

  it('快捷筛选与键盘聚焦使用同一搜索框', () => {
    const f = fixture();
    document.body.append(f.host);
    const search = f.host.querySelector<HTMLInputElement>('[data-extension-search]')!;
    f.view.focus();
    expect(document.activeElement).toBe(search);
    f.host.querySelector<HTMLButtonElement>('[data-extension-filter="@available"]')!.click();
    expect(search.value).toBe('@available');
    expect(f.host.querySelector<HTMLElement>('.wb-extension-details')!.hidden).toBe(true);
    expect(f.host.querySelector('[data-extension-filter="@available"]')?.getAttribute('aria-pressed')).toBe('true');
    f.view.render({ ...f.state, installed: false, enabled: false, status: 'uninstalled' });
    expect(f.host.querySelector<HTMLElement>('.wb-extension-details')!.hidden).toBe(false);
    f.view.dispose();
    f.host.remove();
  });

  it('筛选随卸载同步更新，清除搜索后可重新安装', () => {
    const f = fixture();
    const search = f.host.querySelector<HTMLInputElement>('[data-extension-search]')!;
    search.value = '@installed';
    search.dispatchEvent(new Event('input'));
    f.view.render({ ...f.state, installed: false, enabled: false, status: 'uninstalled' });
    expect(f.host.querySelector<HTMLElement>('.wb-extension-details')!.hidden).toBe(true);
    f.host.querySelector<HTMLButtonElement>('[data-extension-clear]')!.click();
    expect(search.value).toBe('');
    expect(f.host.querySelector<HTMLElement>('.wb-extension-details')!.hidden).toBe(false);
    f.view.dispose();
  });
});
