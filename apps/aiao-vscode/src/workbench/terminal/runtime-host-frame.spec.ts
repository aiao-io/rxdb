// @vitest-environment happy-dom
import { MessageChannel as NodeMessageChannel, MessagePort as NodeMessagePort } from 'node:worker_threads';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openRuntimeHost } from './runtime-host-frame.js';
import {
  RUNTIME_HOST_CONNECT,
  RUNTIME_HOST_READY,
  serveRuntimeHost,
  type RuntimeHostBackend
} from './runtime-host-protocol.js';

const HOST = 'http://localhost:4331';

function backend(): RuntimeHostBackend {
  return {
    boot: vi.fn(async () => undefined),
    mount: vi.fn(async () => undefined),
    readdir: vi.fn(async () => []),
    readFile: vi.fn(async () => new Uint8Array()),
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    rm: vi.fn(async () => undefined),
    watch: vi.fn(() => () => undefined),
    spawn: vi.fn(async () => ({ write: async () => undefined, kill: () => undefined })),
    onServerReady: vi.fn(() => () => undefined),
    teardown: vi.fn()
  };
}

/** 测试环境不加载跨源页面：给宿主 iframe 换上只会收消息的窗口，截获私有端口并在另一端起宿主服务。 */
function hostFrame(host: RuntimeHostBackend) {
  const frame = document.querySelector<HTMLIFrameElement>('iframe[data-runtime-host]');
  if (!frame) throw new Error('宿主 iframe 未创建');
  const post = vi.fn((_message: unknown, _targetOrigin: string, transfer?: Transferable[]) => {
    const port = transfer?.[0];
    if (port instanceof NodeMessagePort) serveRuntimeHost(port as unknown as MessagePort, host);
  });
  const contentWindow = { postMessage: post } as unknown as Window;
  Object.defineProperty(frame, 'contentWindow', { value: contentWindow, configurable: true });
  return { frame, contentWindow, post };
}

const announce = (source: MessageEventSource | null, origin = HOST, data: unknown = { type: RUNTIME_HOST_READY }) =>
  window.dispatchEvent(new MessageEvent('message', { source, origin, data }));

beforeEach(() => {
  const runtime = window as unknown as { happyDOM: { settings: { disableIframePageLoading: boolean } } };
  // 不加载跨源页面（happy-dom 会在控制台记一条 NotSupportedError），宿主窗口由 hostFrame 替换
  runtime.happyDOM.settings.disableIframePageLoading = true;
  vi.stubGlobal('MessageChannel', NodeMessageChannel);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('独立源运行时宿主页', () => {
  it('隐藏加载宿主页并委托跨源隔离，只接受该 iframe 从宿主源发出的就绪通知', async () => {
    const opening = openRuntimeHost(document, { origin: HOST, runtime: 'vivari' });
    const host = backend();
    const { frame, contentWindow, post } = hostFrame(host);
    // 宿主页不放在源根：Nodepod 的 reservedHostPaths 里 `/` 会按前缀匹配全部路径，宿主页要有自己的精确路径
    expect(frame.src).toBe(`${HOST}/runtime-host.html`);
    expect(frame.getAttribute('allow')).toBe('cross-origin-isolated');
    expect(frame.getAttribute('aria-hidden')).toBe('true');
    expect(frame.name).toMatch(/^aiao-runtime-host-vivari-/);
    announce(contentWindow, 'http://localhost:9999');
    announce(window);
    announce(contentWindow, HOST, { type: 'other' });
    expect(post).not.toHaveBeenCalled();
    announce(contentWindow);
    announce(contentWindow);
    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith({ type: RUNTIME_HOST_CONNECT }, HOST, [expect.any(NodeMessagePort)]);
    const connection = await opening;
    await connection.boot();
    expect(host.boot).toHaveBeenCalledOnce();
    connection.teardown();
    expect(document.querySelector('iframe[data-runtime-host]')).toBeNull();
    await vi.waitFor(() => expect(host.teardown).toHaveBeenCalledOnce());
  });

  it('宿主页迟迟不就绪时明确失败并移除 iframe', async () => {
    vi.useFakeTimers();
    const opening = openRuntimeHost(document, { origin: HOST, runtime: 'vivari' });
    const failed = expect(opening).rejects.toThrow(`${HOST}`);
    await vi.advanceTimersByTimeAsync(30_000);
    await failed;
    expect(document.querySelector('iframe[data-runtime-host]')).toBeNull();
  });
});
