import type { Page } from '@playwright/test';
import { expect, FIXTURE_ORIGIN, openPanel, test } from './extension.fixture';

/** 页内录制到的一条出站/入站消息。 */
interface RecordedFrame {
  readonly lane: 'window-in' | 'window-out' | 'port-in' | 'port-out';
  /** v2 信封的版本判别位；v1 帧没有这个字段。两代协议的 `source` 是同一个常量，只能靠它分。 */
  readonly protocol: unknown;
  readonly type: unknown;
}

declare global {
  interface Window {
    __frames?: RecordedFrame[];
    __fixture?: { emit(type: string, event?: unknown): void; readonly connected: boolean };
  }
}

/**
 * 在 connector 之前挂上录制器。
 *
 * @remarks
 * 四条车道都要录。v2 帧收发都在 `window` 总线上，v1 握手之后的命令与 `HANDSHAKE_ACK`
 * 走的是握手时 transfer 出去的私有 `MessagePort`（见 connector 的 `#postMessage`
 * 与 bridge 的 `forwardExtensionMessage`）。只录 window 会让「`none` 档没有泄漏」
 * 变成一句在错误的车道上做的断言，也会让「background 有没有代发 legacy ACK」不可见——
 * 那条 ACK 恰好只在端口上出现。
 */
async function recordFrames(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const frames: RecordedFrame[] = [];
    window.__frames = frames;
    const record = (lane: RecordedFrame['lane'], value: unknown): void => {
      const frame = value as { protocol?: unknown; type?: unknown } | null;
      if (frame === null || typeof frame !== 'object') return;
      frames.push({ lane, protocol: frame.protocol, type: frame.type });
    };

    window.addEventListener('message', event => record('window-in', event.data));

    const windowPost = window.postMessage.bind(window);
    window.postMessage = ((message: unknown, ...rest: unknown[]) => {
      record('window-out', message);
      return (windowPost as (...args: unknown[]) => unknown)(message, ...rest);
    }) as typeof window.postMessage;

    const portPost = MessagePort.prototype.postMessage;
    MessagePort.prototype.postMessage = function patched(this: MessagePort, message: unknown, ...rest: unknown[]) {
      record('port-out', message);
      return (portPost as (...args: unknown[]) => unknown).call(this, message, ...rest);
    } as typeof MessagePort.prototype.postMessage;

    // 入站端口帧只能从 `onmessage` 的赋值处截：connector 用的是 `port.onmessage = ...`，
    // 在原型上包一层 setter 才能在不改被测代码的前提下看到那条车道。
    const onmessage = Object.getOwnPropertyDescriptor(MessagePort.prototype, 'onmessage');
    if (onmessage?.set && onmessage.get) {
      const { get, set } = onmessage;
      Object.defineProperty(MessagePort.prototype, 'onmessage', {
        configurable: true,
        get,
        set(this: MessagePort, handler: ((event: MessageEvent) => void) | null) {
          if (handler === null) {
            set.call(this, null);
            return;
          }
          set.call(this, (event: MessageEvent) => {
            record('port-in', event.data);
            handler.call(this, event);
          });
        }
      });
    }
  });
}

function framesOf(page: Page): Promise<RecordedFrame[]> {
  return page.evaluate(() => window.__frames ?? []);
}

/** 打开 fixture 页并返回它的 tabId（由真实 service worker 查出，不猜）。 */
async function openFixture(
  context: Parameters<typeof openPanel>[0],
  serviceWorker: { evaluate<T>(fn: (url: string) => Promise<T> | T, arg: string): Promise<T> },
  query: string
): Promise<{ page: Page; url: string; tabId: number }> {
  const url = `${FIXTURE_ORIGIN}/index.html${query}`;
  const page = await context.newPage();
  await recordFrames(page);
  await page.goto(url);
  await expect(page.locator('#status')).toHaveText('connector-ready');
  const tabId = await serviceWorker.evaluate<number>(async (target: string) => {
    // service worker 里没有 DOM 的 lib，`chrome` 也不在本项目的类型里——这里只用两个字段，
    // 就地窄化比给 e2e 项目引一整套扩展类型更诚实。
    const runtime = globalThis as unknown as {
      chrome: { tabs: { query(info: Record<string, never>): Promise<{ id?: number; url?: string }[]> } };
    };
    const tabs = await runtime.chrome.tabs.query({});
    const found = tabs.find(tab => tab.url === target);
    if (found?.id === undefined) throw new Error(`no tab for ${target}`);
    return found.id;
  }, url);
  return { page, url, tabId };
}

/**
 * 走一遍真实用户路径：先开面板拿到 host 授权，再刷新被检查页面。
 *
 * @remarks
 * 顺序不能倒过来。bridge 由 `chrome.scripting` 在授权后注入，而注入的脚本**不跨导航存活**；
 * 页面若在授权之前就完成了握手，那条 legacy HANDSHAKE 与面板的 PROTOCOL_HELLO 都会
 * 撞在「还没有 bridge」上而丢失，两端从此互相等待。故事 AC#37 写的「授权后刷新页面」
 * 说的就是这件事。刷新后由面板的 `onNavigated` 触发重新注入。
 */
async function handshakeThroughRelay(
  context: Parameters<typeof openPanel>[0],
  extensionId: string,
  fixture: { page: Page; url: string; tabId: number }
): Promise<void> {
  const panel = await openPanel(context, extensionId, fixture.url, fixture.tabId);
  await fixture.page.reload();
  await panel.evaluate(
    url => (window as unknown as { __emitNavigated(v: string): void }).__emitNavigated(url),
    fixture.url
  );
}

/** 挑出某个类型的帧；`protocol` 为 `2` 即 v2 信封。 */
function pick(frames: readonly RecordedFrame[], type: string, lanes: readonly RecordedFrame['lane'][]) {
  return frames.filter(frame => frame.type === type && lanes.includes(frame.lane));
}

test.describe('真实四段中继', () => {
  test('AC#36 两端都支持 v2 时只建立一个 v2 session，background 不代 ACK', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    const fixture = await openFixture(context, serviceWorker, '?capabilities=readonly');
    await handshakeThroughRelay(context, extensionId, fixture);

    await expect
      .poll(() => fixture.page.evaluate(() => (window.__frames ?? []).some(frame => frame.type === 'HANDSHAKE_ACK')))
      .toBe(true);

    const frames = await framesOf(fixture.page);
    const inbound: readonly RecordedFrame['lane'][] = ['window-in', 'port-in'];

    // 面板的 HELLO 真的穿过了 panel → background → content script → 页面四段。
    expect(pick(frames, 'PROTOCOL_HELLO', inbound).length).toBeGreaterThan(0);
    // 只建立一个 session：页面只发一条 v2 HANDSHAKE。
    expect(pick(frames, 'HANDSHAKE', ['window-out', 'port-out']).filter(frame => frame.protocol === 2)).toHaveLength(1);

    const acks = pick(frames, 'HANDSHAKE_ACK', inbound);
    // ACK 只有一条，且是 v2 信封。中继若代 ACK，代出来的只能是 v1 那条
    // （`protocol` 为 `undefined`）——两代 ACK 的 `source` 相同，唯一能分开它们的就是版本判别位。
    expect(acks).toHaveLength(1);
    expect(acks[0]?.protocol).toBe(2);
    // v2 赢下协商之后，面板不再发 legacy ACK；端口车道上出现一条就说明有人替它答了。
    expect(acks.filter(frame => frame.protocol !== 2)).toHaveLength(0);
  });

  test('AC#41 capability 为 none 时握手前后都零业务数据', async ({ context, extensionId, serviceWorker }) => {
    // `emitOnInit` 让页面在 init 的同一个 tick 里就发一条事件——那是确定性的「握手之前」。
    const fixture = await openFixture(context, serviceWorker, '?capabilities=none&emitOnInit=1');
    await handshakeThroughRelay(context, extensionId, fixture);
    await expect
      .poll(() => fixture.page.evaluate(() => (window.__frames ?? []).some(frame => frame.type === 'HANDSHAKE_ACK')))
      .toBe(true);

    // 握手**之后**再制造一次：证明零泄漏不是「还没连上」造成的。
    await fixture.page.evaluate(async () => {
      window.__fixture?.emit('ENTITY_LOCAL_CREATE', { type: 'ENTITY_LOCAL_CREATE' });
      // 事件出站是同步的（connector 在监听器里直接 `#postMessage`），但 v1 的 buffer 冲刷
      // 是在收到 ACK 的那一跳里做的。让出一跳宏任务即可，不用挂一个会随机通过的等待时长。
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    const frames = await framesOf(fixture.page);
    const outbound: readonly RecordedFrame['lane'][] = ['window-out', 'port-out'];
    expect(pick(frames, 'EVENT', outbound)).toHaveLength(0);
    expect(pick(frames, 'DB_INFO', outbound)).toHaveLength(0);
    expect(pick(frames, 'BRANCHES', outbound)).toHaveLength(0);
  });
});
