// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPreview, type PreviewEvent } from './preview-sandbox.js';

class ProbeChannel {
  static instances: ProbeChannel[] = [];
  port1: {
    start: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    onmessage?: (event: MessageEvent) => void;
  } = { start: vi.fn(), close: vi.fn() };
  port2 = { start: vi.fn(), close: vi.fn() };
  constructor() {
    ProbeChannel.instances.push(this);
  }
}

describe('预览挂载的消息来源与释放', () => {
  const identity = { sessionId: 'session', projectId: 'project', revision: 'revision-1' };
  beforeEach(() => {
    const runtime = window as unknown as {
      happyDOM: { settings: { disableJavaScriptEvaluation: boolean; disableIframePageLoading: boolean } };
    };
    runtime.happyDOM.settings.disableJavaScriptEvaluation = true;
    runtime.happyDOM.settings.disableIframePageLoading = true;
    Object.defineProperty(HTMLIFrameElement.prototype, 'credentialless', { value: false, configurable: true });
    ProbeChannel.instances = [];
    vi.stubGlobal('MessageChannel', ProbeChannel);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.replaceChildren();
    delete (HTMLIFrameElement.prototype as unknown as Record<string, unknown>)['credentialless'];
  });

  it('没有无凭据预览能力时明确拒绝', () => {
    delete (HTMLIFrameElement.prototype as unknown as Record<string, unknown>)['credentialless'];
    expect(() =>
      mountPreview(document.createElement('div'), { ...identity, js: '', css: '' }, () => undefined)
    ).toThrow('无凭据');
  });

  it('未握手的预览也能释放，不残留 iframe', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const preview = mountPreview(host, { ...identity, js: '', css: '' }, () => undefined);
    expect(preview.iframe.getAttribute('sandbox')).toBe('allow-scripts');
    preview.dispose();
    expect(host.children).toHaveLength(0);
  });

  it('只向当前 iframe 发送一次私有端口，诊断仍需匹配会话', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const events: PreviewEvent[] = [];
    const preview = mountPreview(host, { ...identity, js: '', css: '' }, event => events.push(event));
    const frame = preview.iframe.contentWindow;
    if (!frame) throw new Error('测试 iframe 未创建窗口');
    const post = vi.spyOn(frame, 'postMessage').mockImplementation(() => undefined);
    const dispatch = (data: unknown, source: MessageEventSource | null = frame) =>
      window.dispatchEvent(new MessageEvent('message', { source, data }));
    dispatch(null);
    dispatch('malformed');
    dispatch({ ...identity, type: 'workbench-awaiting-port' }, window);
    dispatch({ ...identity, sessionId: 'other', type: 'workbench-awaiting-port' });
    expect(ProbeChannel.instances).toHaveLength(0);
    dispatch({ ...identity, type: 'workbench-awaiting-port' });
    dispatch({ ...identity, type: 'workbench-awaiting-port' });
    expect(post).toHaveBeenCalledOnce();
    const channel = ProbeChannel.instances[0];
    channel.port1.onmessage?.(new MessageEvent('message', { data: { ...identity, revision: 'old', type: 'ready' } }));
    channel.port1.onmessage?.(new MessageEvent('message', { data: { ...identity, type: 'ready' } }));
    expect(events).toEqual([{ ...identity, type: 'ready' }]);
    preview.dispose();
    expect(channel.port1.close).toHaveBeenCalledOnce();
    expect(channel.port2.close).toHaveBeenCalledOnce();
    dispatch({ ...identity, type: 'workbench-awaiting-port' });
    expect(ProbeChannel.instances).toHaveLength(1);
  });
});
