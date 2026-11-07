import { EXTENSION_CHANNEL, type ExtensionEvent, type ExtensionReply, type ExtensionRequest } from './extension-protocol.js';
import type { MarkdownRuntime, MarkdownRuntimeOptions } from './markdown-extension.js';

/** 独立页面内运行正式 VS Code 扩展宿主，使用专属消息端口隔离文档事件。 */
export function mountMarkdownRuntime(host: HTMLElement, options: MarkdownRuntimeOptions, assetBase: string): Promise<MarkdownRuntime> {
  const iframe = document.createElement('iframe');
  iframe.title = 'Markdown Preview Enhanced 插件宿主';
  iframe.dataset['markdownExtensionHost'] = '';
  iframe.style.cssText = 'width:100%;height:100%;border:0;display:block';
  iframe.allow = 'clipboard-read; clipboard-write';
  const url = new URL('extension-host/index.html', assetBase);
  iframe.src = url.href;
  const channel = new MessageChannel();
  let disposed = false;
  let ready = false;
  let closed = false;
  let sequence = 0;
  let rejectReady: (error: Error) => void;
  const pending = new Map<number, { resolve(): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout>; focus: Element | null }>();
  function request(message: Omit<Extract<ExtensionRequest, { type: 'sync' }>, 'id'> | Omit<Extract<ExtensionRequest, { type: 'execute' }>, 'id'> | Omit<Extract<ExtensionRequest, { type: 'cursor' }>, 'id'> | Omit<Extract<ExtensionRequest, { type: 'viewport' }>, 'id'>): Promise<void> {
    if (disposed) return Promise.reject(new Error('Markdown 扩展宿主已经释放'));
    const id = ++sequence;
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Markdown 扩展请求超时：${message.type}`)); }, 30000);
      pending.set(id, { resolve, reject, timer, focus: message.type === 'sync' ? document.activeElement : null });
      channel.port1.postMessage({ ...message, id });
    });
  }
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    clearTimeout(startupTimer);
    channel.port1.close();
    channel.port2.close();
    options.signal.removeEventListener('abort', dispose);
    iframe.remove();
    const error = new Error('Markdown 扩展宿主已经释放');
    if (!ready) rejectReady(error);
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); }
    pending.clear();
  }
  const runtime: MarkdownRuntime = {
    sync: snapshot => request({ type: 'sync', snapshot }),
    execute: command => request({ type: 'execute', command }),
    cursor: (line, column) => request({ type: 'cursor', line, column }),
    viewport: viewport => request({ type: 'viewport', viewport }),
    dispose
  };
  const startupTimer = setTimeout(() => { rejectReady(new Error('Markdown 扩展启动超时，请检查扩展静态资源')); dispose(); }, 60000);
  const result = new Promise<MarkdownRuntime>((resolve, reject) => {
    rejectReady = reject;
    channel.port1.onmessage = event => {
      const message = event.data as ExtensionEvent | ExtensionReply;
      if (disposed) return;
      if (message.type === 'ready') {
        ready = true;
        clearTimeout(startupTimer);
        options.onCommands(message.commands);
        resolve(runtime);
      }
      if (message.type === 'reply') {
        const entry = pending.get(message.id);
        if (!entry) return;
        clearTimeout(entry.timer);
        pending.delete(message.id);
        if (document.activeElement === iframe && entry.focus instanceof HTMLElement && entry.focus.isConnected) entry.focus.focus({ preventScroll: true });
        if (message.error) entry.reject(new Error(message.error)); else entry.resolve();
        if (closed && pending.size === 0) queueMicrotask(() => options.onClosed?.());
      }
      if (message.type === 'error') {
        const error = new Error(message.message);
        if (!ready) { reject(error); dispose(); } else options.onError(error);
      }
      if (message.type === 'edit') options.onEdit(message.path, message.content, message.baseContent);
      if (message.type === 'reveal') options.onReveal(message.path, message.line);
      if (message.type === 'scroll') options.onScroll?.(message.path, message.line);
      if (message.type === 'closed') { closed = true; if (pending.size === 0) options.onClosed?.(); }
      if (message.type === 'write') {
        void options.onWrite(message.path, message.content, message.baseline).then(
          () => channel.port1.postMessage({ type: 'written', id: message.id }),
          error => channel.port1.postMessage({ type: 'written', id: message.id, error: String(error) })
        );
      }
    };
    iframe.addEventListener('load', () => {
      if (!disposed) iframe.contentWindow!.postMessage({ channel: EXTENSION_CHANNEL, snapshot: options.snapshot }, url.origin, [channel.port2]);
    }, { once: true });
    options.signal.addEventListener('abort', dispose, { once: true });
    if (options.signal.aborted) dispose(); else host.replaceChildren(iframe);
  });
  return result;
}
