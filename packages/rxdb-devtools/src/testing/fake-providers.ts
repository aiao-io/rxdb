/**
 * @fileoverview 三领域 fake provider：conformance 里「次数为 0」类判据的唯一凭据。
 *
 * @remarks
 * AC#9 / #10 / #16 / #24 的判据全是**次数**——provider 调用、host 读取、事件订阅、临时资源。
 * 这些断言不能写成「没有收到响应消息」：capability 拒绝本来就是静默丢弃，没有响应是它的
 * 正常形态，那样的测试对着一个坏实现也照样绿。所以每个接缝都在这里记一个可读计数器，
 * suite 断言计数器。
 *
 * 三条刻意的行为约定：
 *
 * 1. **`settings.export` 恒返回 `export_unsupported`，且不增加 `hostReads`**（AC#24）。
 *    它必须在任何 host 侧动作之前返回——否则「读取次数为 0」只能靠实现恰好没读来成立。
 * 2. **注入的平台失败不计 `hostReads`**：它模拟「打开句柄那一步就被平台拒绝」，
 *    这样 AC#24 的计数不会被别处注入的失败污染。
 * 3. **chunk sink 只累加长度，绝不保留字节**。`peakRetainedBytes` 因此等于最大的单块长度；
 *    任何整文件驻留的实现会让它等于总字节数，这是 AC#19 在本包结构上唯一可观测的代理。
 *
 * @module @aiao/rxdb-devtools/testing/fake-providers
 */

import { DEVTOOLS_BROWSER_OPFS_MAX_TRANSFER_BYTES } from '../v2/constants.js';
import { createProviderError, mapPlatformError } from '../v2/error-mapping.js';
import type { DevToolsErrorOrigin } from '../v2/error-mapping.js';
import type { DevToolsProviderErrorCode } from '../v2/errors.js';
import { isRecord } from '../v2/guards.js';
import { DEVTOOLS_PROVIDER_DOMAINS, DEVTOOLS_PROVIDER_OPERATIONS } from '../provider/descriptor.js';
import type {
  DevToolsProviderDescriptor,
  DevToolsProviderDomain,
  DevToolsProviderKind,
  DevToolsProviderRuntime
} from '../provider/descriptor.js';
import type { DevToolsChunkSink, DevToolsProvider, DevToolsProviderResult } from '../provider/types.js';
import type { DevToolsProviderProbe } from './driver.js';

/** 注入给某个操作的平台失败。 */
export interface DevToolsFakePlatformFailure {
  /** 该值来自哪个平台；映射不做嗅探。 */
  readonly origin: DevToolsErrorOrigin;
  /** 平台原样抛出的值。 */
  readonly error: unknown;
}

/** 各领域要伪装成哪种语义 kind。 */
export type DevToolsFakeProviderKinds = Partial<Record<DevToolsProviderDomain, DevToolsProviderKind>>;

/** fake provider 集合的构造参数。 */
export interface DevToolsFakeProviderOptions {
  /** descriptor 上回显的 runtime；**不参与行为判定**。 */
  readonly runtime?: DevToolsProviderRuntime;
  /** 未指定的领域取该领域的默认可用 kind。 */
  readonly kinds?: DevToolsFakeProviderKinds;
  /** descriptor 声明的 `maxTransferBytes`；`unavailable` 领域恒为 0。 */
  readonly maxTransferBytes?: number;
  /** `${domain}.${operation}` → 该操作要经共享映射抛出的平台失败。 */
  readonly failures?: Readonly<Record<string, DevToolsFakePlatformFailure>>;
}

/** 一组 fake provider 及其观测面。 */
export interface DevToolsFakeProviderSet {
  /** 供 conformance driver 直接转交的探针；全部字段是活值。 */
  readonly probe: DevToolsProviderProbe;
  /** 三个领域各一份，顺序与 {@link DEVTOOLS_PROVIDER_DOMAINS} 一致。 */
  readonly descriptors: readonly DevToolsProviderDescriptor[];
  /**
   * 取某个领域的 provider。
   *
   * @remarks
   * `unavailable` 领域同样有 provider——它对每个操作回 `provider_unavailable`。
   * 让这里返回 `undefined` 会把「领域缺席」和「领域不可用」混成一件事，而协议里它们
   * 分别对应 `provider_unsupported` 与 `provider_unavailable`。
   *
   * @param domain - 领域。
   * @returns 该领域的 provider。
   */
  provider(domain: DevToolsProviderDomain): DevToolsProvider;
  /**
   * 建一个只计量、不留存字节的 chunk sink。
   *
   * @param name - 目标逻辑路径。
   * @returns 该次写入的 sink。
   */
  createChunkSink(name: string): DevToolsChunkSink;
  /**
   * 已提交的文件。
   *
   * @returns `[逻辑路径, 字节数]` 序对；只有 `commit()` 会往里加。
   */
  committedFiles(): readonly (readonly [string, number])[];
  /** 记一次事件入缓冲；由 driver 在 connector 侧调用。 */
  recordBufferedEvent(): void;
}

/** 各领域的默认可用 kind。 */
const DEFAULT_KINDS = {
  database: 'rxdb',
  files: 'opfs',
  settings: 'opfs'
} as const satisfies Record<DevToolsProviderDomain, DevToolsProviderKind>;

interface FakeState {
  hostReads: number;
  eventSubscriptions: number;
  bufferedEvents: number;
  peakRetainedBytes: number;
  readonly calls: Map<string, number>;
  readonly temporary: Set<string>;
  readonly committed: Map<string, number>;
  readonly branches: Set<string>;
  currentBranch: string;
  readonly files: Map<string, number>;
  readonly directories: Set<string>;
}

type FakeHandler = (params: unknown) => DevToolsProviderResult;

function createState(): FakeState {
  return {
    hostReads: 0,
    eventSubscriptions: 0,
    bufferedEvents: 0,
    peakRetainedBytes: 0,
    calls: new Map(),
    temporary: new Set(),
    committed: new Map(),
    branches: new Set(['main']),
    currentBranch: 'main',
    files: new Map([
      ['/db.sqlite', 4_096],
      ['/notes/a.md', 12]
    ]),
    directories: new Set(['/notes'])
  };
}

function ok(result: unknown): DevToolsProviderResult {
  return { outcome: 'ok', result };
}

function fail(code: DevToolsProviderErrorCode): DevToolsProviderResult {
  return { outcome: 'failed', error: createProviderError(code) };
}

/** 读取一个字符串参数；缺失或类型不对按领域级校验失败处理。 */
function readString(params: unknown, key: string): string | undefined {
  if (!isRecord(params)) return undefined;
  const value = params[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function createDatabaseHandlers(state: FakeState): Readonly<Record<string, FakeHandler>> {
  const read = <TResult>(produce: () => TResult): DevToolsProviderResult => {
    state.hostReads += 1;
    return ok(produce());
  };

  return {
    inspect: () => read(() => ({ collections: ['todos'], documents: state.files.size })),
    query: () => read(() => ({ docs: [] })),
    events: () => {
      state.eventSubscriptions += 1;
      return ok({ subscribed: true });
    },
    'get-branches': () => read(() => ({ branches: [...state.branches], current: state.currentBranch })),
    'switch-branch': params => {
      const name = readString(params, 'name');
      if (name === undefined) return fail('invalid_path');
      if (!state.branches.has(name)) return fail('resource_not_found');
      return read(() => {
        state.currentBranch = name;
        return { current: name };
      });
    },
    'create-branch': params => {
      const name = readString(params, 'name');
      if (name === undefined) return fail('invalid_path');
      if (state.branches.has(name)) return fail('resource_conflict');
      return read(() => {
        state.branches.add(name);
        return { created: name };
      });
    },
    'delete-branch': params => {
      const name = readString(params, 'name');
      if (name === undefined) return fail('invalid_path');
      if (!state.branches.has(name)) return fail('resource_not_found');
      if (name === state.currentBranch) return fail('resource_conflict');
      return read(() => {
        state.branches.delete(name);
        return { deleted: name };
      });
    }
  };
}

function createFilesHandlers(state: FakeState): Readonly<Record<string, FakeHandler>> {
  const read = <TResult>(produce: () => TResult): DevToolsProviderResult => {
    state.hostReads += 1;
    return ok(produce());
  };

  return {
    list: () => read(() => ({ entries: [...state.files].map(([path, size]) => ({ path, size })) })),
    download: params => {
      const path = readString(params, 'path');
      if (path === undefined) return fail('invalid_path');
      const size = state.files.get(path);
      if (size === undefined) return fail('resource_not_found');
      return read(() => ({ path, size }));
    },
    // 字节不经返回值：它们只能走 chunk sink，这样「整文件不得驻留内存」是结构性的。
    upload: params => {
      const path = readString(params, 'path');
      if (path === undefined) return fail('invalid_path');
      return ok({ accepted: path });
    },
    'create-directory': params => {
      const path = readString(params, 'path');
      if (path === undefined) return fail('invalid_path');
      if (state.directories.has(path)) return fail('resource_conflict');
      return read(() => {
        state.directories.add(path);
        return { created: path };
      });
    },
    delete: params => {
      const path = readString(params, 'path');
      if (path === undefined) return fail('invalid_path');
      if (!state.files.has(path)) return fail('resource_not_found');
      return read(() => {
        state.files.delete(path);
        return { deleted: path };
      });
    }
  };
}

function createSettingsHandlers(state: FakeState): Readonly<Record<string, FakeHandler>> {
  return {
    clear: () => {
      state.hostReads += 1;
      return ok({ cleared: true });
    },
    // AC#24：任何 kind、任何 runtime 下都是这个码，且**在此之前不碰任何 host 资源**。
    export: () => fail('export_unsupported')
  };
}

const HANDLER_FACTORIES = {
  database: createDatabaseHandlers,
  files: createFilesHandlers,
  settings: createSettingsHandlers
} as const satisfies Record<DevToolsProviderDomain, (state: FakeState) => Readonly<Record<string, FakeHandler>>>;

function describeDomain(
  domain: DevToolsProviderDomain,
  kind: DevToolsProviderKind,
  runtime: DevToolsProviderRuntime,
  maxTransferBytes: number
): DevToolsProviderDescriptor {
  if (kind === 'unavailable') {
    return {
      domain,
      version: 1,
      kind,
      operations: [],
      runtime,
      limits: { maxTransferBytes: 0 },
      reason: 'not_configured'
    };
  }
  return {
    domain,
    version: 1,
    kind,
    operations: DEVTOOLS_PROVIDER_OPERATIONS[domain],
    runtime,
    limits: { maxTransferBytes }
  };
}

function createProvider(
  domain: DevToolsProviderDomain,
  descriptor: DevToolsProviderDescriptor,
  state: FakeState,
  options: DevToolsFakeProviderOptions
): DevToolsProvider {
  const handlers = HANDLER_FACTORIES[domain](state);

  return {
    descriptor,
    invoke(operation: string, params: unknown): Promise<DevToolsProviderResult> {
      const qualified = `${domain}.${operation}`;
      state.calls.set(qualified, (state.calls.get(qualified) ?? 0) + 1);

      if (descriptor.kind === 'unavailable') return Promise.resolve(fail('provider_unavailable'));
      if (!Object.hasOwn(handlers, operation)) return Promise.resolve(fail('provider_unsupported'));

      const failure = options.failures?.[qualified];
      if (failure !== undefined) {
        return Promise.resolve({ outcome: 'failed', error: mapPlatformError(failure.origin, failure.error) });
      }
      return Promise.resolve(handlers[operation](params));
    }
  };
}

function createSink(state: FakeState, name: string): DevToolsChunkSink {
  const temporary = `${name}.tmp`;
  state.temporary.add(temporary);
  let written = 0;
  let settled = false;

  // 三个方法都是 async：fake 必须和真实实现同形，否则「等落盘」这条时序在 fake 上恒真，
  // 而 conformance suite 正是拿同一份断言去跑两者的。
  return {
    async write(data: Uint8Array): Promise<void> {
      if (settled) return;
      written += data.byteLength;
      // 只记峰值与长度：真要保留 `data` 就等于把整文件搬进内存。
      state.peakRetainedBytes = Math.max(state.peakRetainedBytes, data.byteLength);
    },
    async commit(): Promise<void> {
      if (settled) return;
      settled = true;
      state.temporary.delete(temporary);
      state.committed.set(name, written);
    },
    async discard(): Promise<void> {
      if (settled) return;
      settled = true;
      state.temporary.delete(temporary);
    }
  };
}

function createProbe(state: FakeState): DevToolsProviderProbe {
  return {
    get operationCalls(): ReadonlyMap<string, number> {
      return state.calls;
    },
    get hostReads(): number {
      return state.hostReads;
    },
    get eventSubscriptions(): number {
      return state.eventSubscriptions;
    },
    get bufferedEvents(): number {
      return state.bufferedEvents;
    },
    get peakRetainedBytes(): number {
      return state.peakRetainedBytes;
    },
    temporaryArtifacts(): Promise<readonly string[]> {
      return Promise.resolve([...state.temporary]);
    },
    committedTransfers(): Promise<readonly (readonly [string, number])[]> {
      return Promise.resolve([...state.committed]);
    }
  };
}

/**
 * 构造一组三领域 fake provider。
 *
 * @remarks
 * 同一个 kind 在三个 runtime 下给出**完全相同**的 descriptor 与错误行为——runtime 只回显。
 * 这正是共享契约要求的：任何按 runtime 分叉的实现，在 conformance 上会立刻表现为
 * 同一份断言在某一端红。
 *
 * @param options - 可选的 kind、runtime、限额与注入失败。
 * @returns provider 集合与其观测面。
 */
export function createFakeProviders(options: DevToolsFakeProviderOptions = {}): DevToolsFakeProviderSet {
  const state = createState();
  const runtime = options.runtime ?? 'browser';
  const maxTransferBytes = options.maxTransferBytes ?? DEVTOOLS_BROWSER_OPFS_MAX_TRANSFER_BYTES;

  const providers = new Map<DevToolsProviderDomain, DevToolsProvider>();
  for (const domain of DEVTOOLS_PROVIDER_DOMAINS) {
    const kind = options.kinds?.[domain] ?? DEFAULT_KINDS[domain];
    const descriptor = describeDomain(domain, kind, runtime, maxTransferBytes);
    providers.set(domain, createProvider(domain, descriptor, state, options));
  }

  return {
    probe: createProbe(state),
    descriptors: [...providers.values()].map(provider => provider.descriptor),
    provider(domain: DevToolsProviderDomain): DevToolsProvider {
      const provider = providers.get(domain);
      // 三个领域在构造时全部登记过，取不到只可能是调用方传了非法领域。
      if (provider === undefined) throw new TypeError(`unknown provider domain: ${domain}`);
      return provider;
    },
    createChunkSink(name: string): DevToolsChunkSink {
      return createSink(state, name);
    },
    committedFiles(): readonly (readonly [string, number])[] {
      return [...state.committed];
    },
    recordBufferedEvent(): void {
      state.bufferedEvents += 1;
    }
  };
}
