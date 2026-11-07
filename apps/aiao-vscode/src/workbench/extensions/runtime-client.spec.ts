// @vitest-environment happy-dom
// @vitest-environment-options {"settings":{"disableIframePageLoading":true}}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionEvent, ExtensionReply } from './extension-protocol.js';
import type { MarkdownRuntimeOptions } from './markdown-extension.js';
import { mountMarkdownRuntime } from './runtime-client.js';

class TestChannel {
  static latest: TestChannel;
  readonly port1 = { onmessage: undefined as ((event: { data: ExtensionEvent | ExtensionReply }) => void) | undefined, postMessage: vi.fn(), close: vi.fn() };
  readonly port2 = { close: vi.fn() };
  constructor() { TestChannel.latest = this; }
  receive(data: ExtensionEvent | ExtensionReply): void { this.port1.onmessage?.({ data }); }
}
const snapshot = { projectId: 'test', activePath: 'README.md', files: { 'README.md': '# 草稿' }, savedFiles: { 'README.md': '# 磁盘' } };
const lifetimes: AbortController[] = [];
function fixture(aborted = false) {
  const lifetime = new AbortController();
  lifetimes.push(lifetime);
  if (aborted) lifetime.abort();
  const host = document.createElement('div');
  document.body.append(host);
  const options: MarkdownRuntimeOptions = { snapshot, signal: lifetime.signal, onEdit: vi.fn(), onSave: vi.fn(async () => undefined), onWrite: vi.fn(async () => undefined), onReveal: vi.fn(), onScroll: vi.fn(), onClosed: vi.fn(), onError: vi.fn(), onCommands: vi.fn() };
  const pending = mountMarkdownRuntime(host, options, 'http://localhost/assets/');
  return { lifetime, host, options, pending, channel: TestChannel.latest };
}
async function active() {
  const f = fixture();
  f.channel.receive({ type: 'ready', commands: [{ id: 'markdown-preview-enhanced.openPreview', label: '预览' }] });
  return { ...f, runtime: await f.pending };
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('MessageChannel', TestChannel); });
afterEach(() => { for (const lifetime of lifetimes.splice(0)) lifetime.abort(); document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('真实插件宿主的消息桥', () => {
  it('同源 iframe 加载后传递独立端口和草稿快照，等插件 ready 才返回运行时', async () => {
    const f = fixture();
    const iframe = f.host.querySelector('iframe')!;
    const post = vi.fn();
    Object.defineProperty(iframe, 'contentWindow', { value: { postMessage: post } });
    iframe.dispatchEvent(new Event('load'));
    expect(post).toHaveBeenCalledWith({ channel: 'aiao-vscode-extension-host-v1', snapshot }, 'http://localhost', [f.channel.port2]);
    f.channel.receive({ type: 'ready', commands: [] });
    const runtime = await f.pending;
    expect(f.options.onCommands).toHaveBeenCalledWith([]);
    runtime.dispose();
    expect(f.host.children).toHaveLength(0);
    expect(f.channel.port1.close).toHaveBeenCalledOnce();
  });

  it('宿主页地址带协议频道查询参数，绕开浏览器缓存的旧 308 重定向', () => {
    const src = new URL(fixture().host.querySelector('iframe')!.src);
    expect(src.pathname).toBe('/assets/extension-host/index.html');
    expect(src.searchParams.get('channel')).toBe('aiao-vscode-extension-host-v1');
  });

  it('文档、命令、光标和视区都有独立编号并等待实际回复', async () => {
    const f = await active();
    const calls = [f.runtime.sync(snapshot), f.runtime.execute('markdown-preview-enhanced.openPreview'), f.runtime.cursor!(2, 3), f.runtime.viewport!({ firstLine: 2, lastLine: 30 })];
    expect(f.channel.port1.postMessage.mock.calls.map(([message]) => message.type)).toEqual(['sync', 'execute', 'cursor', 'viewport']);
    for (let id = 1; id <= 4; id++) f.channel.receive({ type: 'reply', id });
    await Promise.all(calls);
    f.channel.receive({ type: 'reply', id: 999 });
    f.runtime.dispose();
    await expect(f.runtime.sync(snapshot)).rejects.toThrow('已经释放');
  });

  it('插件文档编辑、跳转和滚动按原事件转发', async () => {
    const f = await active();
    f.channel.receive({ type: 'edit', path: 'README.md', content: '# 插件修改', baseContent: '# 草稿' });
    f.channel.receive({ type: 'reveal', path: 'README.md', line: 12 });
    f.channel.receive({ type: 'scroll', path: 'README.md', line: 30 });
    expect(f.options.onEdit).toHaveBeenCalledWith('README.md', '# 插件修改', '# 草稿');
    expect(f.options.onReveal).toHaveBeenCalledWith('README.md', 12);
    expect(f.options.onScroll).toHaveBeenCalledWith('README.md', 30);
  });

  it('文件写入等待工作台完成保存，失败回传插件', async () => {
    const f = await active();
    const content = new Uint8Array([35]);
    const baseline = { draft: '# 草稿', saved: '# 磁盘' };
    f.channel.receive({ type: 'write', id: 12, path: 'README.md', content, baseline });
    await Promise.resolve();
    expect(f.options.onWrite).toHaveBeenCalledWith('README.md', content, baseline);
    expect(f.channel.port1.postMessage).toHaveBeenCalledWith({ type: 'written', id: 12 });
    vi.mocked(f.options.onWrite).mockRejectedValueOnce(new Error('写入冲突'));
    f.channel.receive({ type: 'write', id: 13, path: 'README.md', content, baseline });
    await Promise.resolve();
    expect(f.channel.port1.postMessage).toHaveBeenCalledWith({ type: 'written', id: 13, error: 'Error: 写入冲突' });
  });

  it('切换文档过程中宿主获得焦点时恢复原编辑器焦点', async () => {
    const f = await active();
    const editor = document.createElement('textarea');
    document.body.append(editor);
    editor.focus();
    const pending = f.runtime.sync(snapshot);
    f.host.querySelector('iframe')!.focus();
    f.channel.receive({ type: 'reply', id: 1 });
    await pending;
    expect(document.activeElement).toBe(editor);
  });

  it('原生关闭等当前命令回执后通知工作台，防止正常关闭变成释放错误', async () => {
    const f = await active();
    const pending = f.runtime.execute('markdown-preview-enhanced.openCurrentSourceInEditorAndClosePreview');
    f.channel.receive({ type: 'closed' });
    expect(f.options.onClosed).not.toHaveBeenCalled();
    f.channel.receive({ type: 'reply', id: 1 });
    await pending;
    await vi.runAllTimersAsync();
    expect(f.options.onClosed).toHaveBeenCalledOnce();
  });

  it('没有未完成命令时原生关闭立即通知，释放后忽略迟到事件', async () => {
    const f = await active();
    f.channel.receive({ type: 'closed' });
    expect(f.options.onClosed).toHaveBeenCalledOnce();
    f.runtime.dispose();
    f.channel.receive({ type: 'error', message: '迟到错误' });
    expect(f.options.onError).not.toHaveBeenCalled();
  });

  it('启动失败和启动超时都释放 iframe 并报告真实原因', async () => {
    const f = fixture();
    const failed = expect(f.pending).rejects.toThrow('没有资源');
    f.channel.receive({ type: 'error', message: '没有资源' });
    await failed;
    expect(f.host.children).toHaveLength(0);
    const next = fixture();
    const timedOut = expect(next.pending).rejects.toThrow('启动超时');
    await vi.advanceTimersByTimeAsync(60000);
    await timedOut;
    expect(next.host.children).toHaveLength(0);
  });

  it('命令失败、请求超时和激活后的错误显式报告', async () => {
    const f = await active();
    const failed = f.runtime.execute('markdown-preview-enhanced.openPreview');
    const failure = expect(failed).rejects.toThrow('命令失败');
    f.channel.receive({ type: 'reply', id: 1, error: '命令失败' });
    await failure;
    const timedOut = expect(f.runtime.sync(snapshot)).rejects.toThrow('请求超时');
    await vi.advanceTimersByTimeAsync(30000);
    await timedOut;
    f.channel.receive({ type: 'error', message: '插件出错' });
    expect(f.options.onError).toHaveBeenCalledWith(new Error('插件出错'));
  });

  it('AbortSignal 取消启动或所有未完成请求', async () => {
    const aborted = fixture(true);
    await expect(aborted.pending).rejects.toThrow('已经释放');
    const loading = fixture();
    const rejected = expect(loading.pending).rejects.toThrow('已经释放');
    loading.lifetime.abort();
    await rejected;
    const f = await active();
    const pending = expect(f.runtime.sync(snapshot)).rejects.toThrow('已经释放');
    f.lifetime.abort();
    await pending;
    expect(f.host.children).toHaveLength(0);
  });
});
