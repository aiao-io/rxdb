// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startPreviewFrame } from './vivari-host.js';

const HOST = 'http://localhost:4331';
const KERNEL = 'aiao-runtime-host-vivari-1';

/** 预览容器页的窗口：真实的测试文档，父窗口与内核宿主页用假的。 */
function containerWindow(search: string, frames: Record<string, unknown>) {
  const listeners = new Map<string, ((event: Event) => void)[]>();
  const view = {
    location: { search, origin: HOST },
    document,
    parent: frames,
    addEventListener: vi.fn((type: string, listener: (event: Event) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    })
  };
  const dispatch = (type: string, event: Partial<MessageEvent>) =>
    listeners.get(type)?.forEach(listener => listener(event as unknown as Event));
  return { view: view as unknown as Window, dispatch };
}

function kernelWindow() {
  const detach = vi.fn();
  const kernel = {
    postMessage: vi.fn(),
    aiaoVivariHost: { attachPreview: vi.fn(() => detach) }
  };
  return { kernel, detach };
}

const query = (src: string, host = KERNEL) => `?${new URLSearchParams({ host, src })}`;

beforeEach(() => {
  const runtime = window as unknown as { happyDOM: { settings: { disableIframePageLoading: boolean } } };
  runtime.happyDOM.settings.disableIframePageLoading = true;
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('vivari 预览容器页', () => {
  it('内层 iframe 加载 vivari 的服务预览并接上内核的热更新隧道，预览发给父窗口的帧转交内核', () => {
    const { kernel, detach } = kernelWindow();
    const { view, dispatch } = containerWindow(query('/preview/5173/?__vv_kernel=k'), { [KERNEL]: kernel });
    startPreviewFrame(view);
    const frame = document.querySelector('iframe');
    if (!frame) throw new Error('预览 iframe 未创建');
    expect(frame.getAttribute('src')).toBe(`${HOST}/preview/5173/?__vv_kernel=k`);
    expect(kernel.aiaoVivariHost.attachPreview).toHaveBeenCalledExactlyOnceWith(frame);
    const preview = {} as Window;
    Object.defineProperty(frame, 'contentWindow', { value: preview, configurable: true });
    const frameData = { type: 'vv-ws', dir: 'out', sub: 'open', connId: 'a-1' };
    dispatch('message', { source: {} as Window, data: { type: 'vv-ws', dir: 'out' } });
    dispatch('message', { source: preview, data: frameData });
    expect(kernel.postMessage).toHaveBeenCalledExactlyOnceWith(frameData, HOST);
    dispatch('pagehide', {});
    expect(detach).toHaveBeenCalledOnce();
  });

  it('只加载 vivari 预览路径，其他地址不嵌入', () => {
    const { kernel } = kernelWindow();
    for (const src of [
      '/assets/kernel.js',
      '//evil.example/preview/5173/',
      'https://evil.example/preview/1/',
      '/preview/5173/../../assets/kernel.js',
      '/preview/5173/%2e%2e/%2e%2e/assets/kernel.js',
      '/preview/5173/..\\..\\assets/kernel.js'
    ]) {
      startPreviewFrame(containerWindow(query(src), { [KERNEL]: kernel }).view);
      expect(document.querySelector('iframe')).toBeNull();
      expect(document.body.textContent).toContain('预览地址无效');
    }
    expect(kernel.aiaoVivariHost.attachPreview).not.toHaveBeenCalled();
  });

  it('找不到内核宿主页（运行时已停止）时说明原因，不取父窗口上的其他属性', () => {
    const { kernel } = kernelWindow();
    startPreviewFrame(containerWindow(query('/preview/5173/'), {}).view);
    expect(document.body.textContent).toContain('运行时已停止');
    startPreviewFrame(containerWindow(query('/preview/5173/', 'location'), { location: kernel }).view);
    expect(document.body.textContent).toContain('运行时已停止');
    expect(kernel.aiaoVivariHost.attachPreview).not.toHaveBeenCalled();
  });
});
