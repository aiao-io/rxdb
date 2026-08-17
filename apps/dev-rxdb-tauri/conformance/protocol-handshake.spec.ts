/**
 * 跨语言协议版本绑定（US-210 AC#10）。
 *
 * @remarks
 * 线协议版本号在仓库里有两份：TS 的 `DESKTOP_HOST_PROTOCOL_VERSION` 与 Rust 的
 * `PROTOCOL_VERSION`（`src-tauri/src/rxdb/protocol.rs`）。两者之间没有任何机械联系——
 * 改了一侧，另一侧的测试一条不红。Rust 侧原有的断言只证明「应答里出现了**它自己的**常量」，
 * 而客户端单测里「host 报 99 则拒连」验的是共享层的拒绝动作，绑不住手抄的那个数字。
 *
 * 这条用例是两个常量之间唯一的机械联系：真的 Rust 进程报上来的版本号，必须等于 TS 这一侧的常量。
 * 断言写成直接比数而不是走 `parseDesktopHostOpenResult`——后者不匹配时也会抛，但抛的是
 * `protocol_violation`，读起来像「宿主坏了」，而这里要说的是「两份常量漂移了」。
 *
 * 这不进一致性套件：套件按后端并行铺开，而本条只对 Rust 宿主成立（Electron host 回的就是
 * 同一个 TS 常量，没有第二份真相源可漂）。
 */

import {
  assertDesktopHostResponse,
  DESKTOP_HOST_PROTOCOL_VERSION,
  DesktopSqliteClient,
  RxDBAdapterDesktopError,
  type DesktopHostTransport
} from '@aiao/rxdb-adapter-desktop';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRustHostTransport } from './rust-host-transport.js';

/**
 * Rust 常量的所在文件，与 {@link RUST_PROTOCOL_VERSION_PATTERN} 一起构成两份常量之间的机械链接。
 */
const RUST_PROTOCOL_SOURCE = join(import.meta.dirname, '..', 'src-tauri', 'src', 'rxdb', 'protocol.rs');

/**
 * 抓 `pub const PROTOCOL_VERSION: i64 = <n>;`。
 *
 * @remarks
 * 匹配不上要**显式失败**，不能当成「没有这个常量所以跳过」——那样常量一改名，
 * 这条用例就退化成一句空话，而它正是为了盯住改名之后的漂移才存在的。
 * 代价是常量改名必须同步改这里；这是跨语言常量在没有单一真相源时唯一能付的价。
 */
const RUST_PROTOCOL_VERSION_PATTERN = /pub const PROTOCOL_VERSION: i64 = (\d+);/;

const withHost = async (
  run: (host: ReturnType<typeof createRustHostTransport>, workspace: string) => Promise<void>,
  env?: Readonly<Record<string, string>>
): Promise<void> => {
  const workspace = await mkdtemp(join(tmpdir(), 'rxdb-tauri-handshake-'));
  const host = createRustHostTransport(workspace, env);
  try {
    await run(host, workspace);
  } finally {
    host.process.stop();
    await rm(workspace, { recursive: true, force: true });
  }
};

describe('Rust 宿主的协议握手', () => {
  it('open 应答里的协议版本等于 TS 这一侧的常量', async () => {
    await withHost(async host => {
      const opened = assertDesktopHostResponse(
        'open',
        await host.transport.request({
          kind: 'open',
          storage: { engine: 'sqlite', databaseName: 'handshake.sqlite3' }
        })
      );
      expect(opened.result.protocolVersion).toBe(DESKTOP_HOST_PROTOCOL_VERSION);
      assertDesktopHostResponse(
        'close',
        await host.transport.request({ kind: 'close', sessionId: opened.result.sessionId })
      );
    });
  });

  // 上面那条走的是真进程，但它只能证明「跑起来的这个二进制」对得上。源码里的常量与已编译的
  // 二进制之间还隔着一次 `cargo build`：只改了 .rs 还没重编时，上面那条照旧全绿。
  // 这条直接读源码，因此不受编译产物新旧的影响。
  it('Rust 源码里的 PROTOCOL_VERSION 常量等于 TS 这一侧的常量', async () => {
    const source = await readFile(RUST_PROTOCOL_SOURCE, 'utf8');
    const matched = RUST_PROTOCOL_VERSION_PATTERN.exec(source);
    expect(matched, `在 ${RUST_PROTOCOL_SOURCE} 里找不到 ${String(RUST_PROTOCOL_VERSION_PATTERN)}`).not.toBeNull();
    expect(Number(matched?.[1])).toBe(DESKTOP_HOST_PROTOCOL_VERSION);
  });
});

/**
 * 两端版本真的对不上时的连接行为（US-210 AC#10）。
 *
 * @remarks
 * 宿主进程由 `RXDB_HOST_STDIO_PROTOCOL_VERSION` 强行报一个不同的版本号。改写只在
 * stdio 测试二进制里，产品代码一行不动——见 `src-tauri/src/bin/rxdb_host_stdio.rs` 模块头。
 *
 * **已知残留缺口**：握手发生在 host 已经建库、开连接、登记会话**之后**，所以「版本不匹配就
 * 不建库」这半条并未兑现——下面的 `留下了一个空库文件` 就是把它钉成一条会随实现变化而变红的
 * 事实，而不是一句藏在文档里的话。真正的修法是加一条无副作用的握手请求（两端各加一个请求
 * 类型），属于协议层改动；`packages/rxdb-adapter-desktop/src/desktop-sqlite-client.ts` 的
 * `parseOpenResultOrClose` 已经把「会话泄漏」这一半堵上了，本组用例是它在 Tauri 路径上的
 * 第一次真实覆盖。
 */
describe('两端协议版本不一致', () => {
  const MISMATCHED_VERSION = DESKTOP_HOST_PROTOCOL_VERSION + 1;
  const DATABASE_NAME = 'mismatch.sqlite3';
  const mismatchedEnv = { RXDB_HOST_STDIO_PROTOCOL_VERSION: String(MISMATCHED_VERSION) } as const;

  /** 包一层记录请求的传输层，用来断言握手失败之后**什么也没再发**。 */
  const recording = (
    transport: DesktopHostTransport
  ): { transport: DesktopHostTransport; kinds: readonly string[] } => {
    const kinds: string[] = [];
    return {
      kinds,
      transport: {
        request: payload => {
          kinds.push(payload.kind);
          return transport.request(payload);
        },
        subscribe: listener => transport.subscribe(listener),
        subscriptionReady: () => transport.subscriptionReady?.() ?? Promise.resolve()
      }
    };
  };

  const connectAgainstMismatchedHost = async (
    host: ReturnType<typeof createRustHostTransport>
  ): Promise<{ error: unknown; kinds: readonly string[] }> => {
    const recorded = recording(host.transport);
    const error = await DesktopSqliteClient.connect(
      recorded.transport,
      { engine: 'sqlite', databaseName: DATABASE_NAME },
      { runtime: 'tauri' }
    ).then(
      client => {
        void client.disconnect();
        return undefined;
      },
      (reason: unknown) => reason
    );
    return { error, kinds: recorded.kinds };
  };

  it('连接失败，错误里同时点出两端的版本号', async () => {
    await withHost(async host => {
      const { error } = await connectAgainstMismatchedHost(host);
      expect(error, 'host 报了一个不认识的协议版本，连接却成功了').toBeInstanceOf(RxDBAdapterDesktopError);
      const failure = error as RxDBAdapterDesktopError;
      expect(failure.code).toBe('protocol_violation');
      // 两个数字都要在消息里：只说「协议不匹配」的话，排查的人还得自己去两个仓位翻常量。
      // 按整段数字比而不是 `toContain`：版本号涨到两位数后，`toContain('1')` 会被 `10` 满足。
      expect(failure.message.match(/\d+/g)).toEqual(
        expect.arrayContaining([String(MISMATCHED_VERSION), String(DESKTOP_HOST_PROTOCOL_VERSION)])
      );
    }, mismatchedEnv);
  });

  it('不按旧协议降级解释，也不泄漏 host 上那条会话', async () => {
    await withHost(async host => {
      const { kinds } = await connectAgainstMismatchedHost(host);
      // `close` 是客户端替调用方补发的收摊请求：没有它，host 上那条连接会一直握着文件，
      // 直到宿主进程退出——而调用方拿不到 client，永远没有关掉它的把手。
      expect(kinds).toEqual(['open', 'close']);
    }, mismatchedEnv);
  });

  it('留下了一个空库文件——「不建库」这半条尚未兑现', async () => {
    await withHost(async (host, workspace) => {
      await connectAgainstMismatchedHost(host);
      const files = await readdir(join(workspace, 'rxdb-data'));
      // 这条断言是**当前行为的存档**，不是我们想要的行为：一次注定失败的连接仍然在磁盘上
      // 留了痕迹。等无副作用握手请求落地，它会变红——那时把它改成 `toEqual([])` 才是修好了。
      expect(files).toContain(DATABASE_NAME);
    }, mismatchedEnv);
  });
});
