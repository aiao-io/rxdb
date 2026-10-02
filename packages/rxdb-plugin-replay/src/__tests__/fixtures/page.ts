/**
 * @fileoverview node 里的「页面」：假 rrweb `record`、`document` / `sessionStorage` / 页面事件桩。
 *
 * @remarks
 * 插件只经 `import('rrweb')` 拿 `record`，用例在文件顶部 `vi.mock('rrweb', …)` 把它指到 {@link fakeRrweb} 的当前实例。
 * 真 rrweb 与真 DOM 的路径在浏览器用例里覆盖；这里只看插件自己的状态机、落库与续录。
 */

import type { eventWithTime } from '@rrweb/types';
import { vi } from 'vitest';
import type { ReplayRecordFn } from '../../recorder.js';

/** rrweb `EventType.Custom`。 */
const CUSTOM = 5;

/** 一条增量快照事件（内容无关紧要，只要可序列化、带时间戳）。 */
export const domEvent = (i: number, timestamp = 1_000 + i): eventWithTime =>
  ({
    type: 3,
    data: { source: 0, texts: [], attributes: [], removes: [], adds: [], i },
    timestamp
  }) as unknown as eventWithTime;

/**
 * 假 rrweb：`record()` 记下 `emit`，`addCustomEvent()` 像真 rrweb 一样经同一个 `emit` 发一条 Custom 事件。
 *
 * @remarks
 * `record()` 之后立刻发一条事件，替代真 rrweb 同步发的全量快照。
 */
export const fakeRrweb = () => {
  let emit: ((event: eventWithTime) => void) | null = null;
  let clock = 1_000;
  const stopRecording = vi.fn(() => {
    emit = null;
  });
  const record = Object.assign(
    vi.fn((options: Parameters<ReplayRecordFn>[0]): ReturnType<ReplayRecordFn> => {
      emit = options.emit ?? null;
      emit?.(domEvent(0, clock++));
      return stopRecording;
    }),
    {
      addCustomEvent: vi.fn(<Payload>(tag: string, payload: Payload) => {
        emit?.({ type: CUSTOM, data: { tag, payload }, timestamp: clock++ } as unknown as eventWithTime);
      })
    }
  ) as ReplayRecordFn & { addCustomEvent: ReturnType<typeof vi.fn> };
  const emitEvents = (count: number): void => {
    for (let i = 0; i < count; i++) emit?.(domEvent(i, clock++));
  };
  return { record, stopRecording, emitEvents, isRecording: () => emit !== null };
};

/** `Map` 背的 `Storage`；`failWrites` 让 `setItem` 抛（模拟配额）。 */
export class MemoryStorage implements Storage {
  readonly #items = new Map<string, string>();
  failWrites: 'none' | 'large' | 'all' = 'none';

  get length(): number {
    return this.#items.size;
  }

  clear(): void {
    this.#items.clear();
  }

  getItem(key: string): string | null {
    return this.#items.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#items.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#items.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failWrites === 'all' || (this.failWrites === 'large' && !value.includes('"gap":true'))) {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    }
    this.#items.set(key, value);
  }
}

/**
 * 给 node 装一个页面：`document`（只要存在）、全局 `sessionStorage` 与 `pagehide` / `pageshow` 事件。
 *
 * @remarks
 * 只桩插件经 `globalThis` 用到的几个成员，**不桩 `window`**：PGlite（emscripten）见到 `window` 就按浏览器环境初始化，会崩。
 * 跨「刷新」复用同一个 `storage` 即可模拟同一标签页；用例结束 `vi.unstubAllGlobals()`。
 */
export const stubPage = (storage: MemoryStorage = new MemoryStorage()) => {
  const target = new EventTarget();
  vi.stubGlobal('sessionStorage', storage);
  vi.stubGlobal('addEventListener', target.addEventListener.bind(target));
  vi.stubGlobal('removeEventListener', target.removeEventListener.bind(target));
  vi.stubGlobal('document', {});
  const pageTransition = (type: 'pagehide' | 'pageshow', persisted: boolean): void => {
    target.dispatchEvent(Object.assign(new Event(type), { persisted }));
  };
  return {
    storage,
    pagehide: (persisted = false) => pageTransition('pagehide', persisted),
    pageshow: (persisted: boolean) => pageTransition('pageshow', persisted)
  };
};
