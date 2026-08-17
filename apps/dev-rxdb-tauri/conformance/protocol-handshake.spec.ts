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

import { assertDesktopHostResponse, DESKTOP_HOST_PROTOCOL_VERSION } from '@aiao/rxdb-adapter-desktop';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRustHostTransport } from './rust-host-transport.js';

describe('Rust 宿主的协议握手', () => {
  it('open 应答里的协议版本等于 TS 这一侧的常量', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'rxdb-tauri-handshake-'));
    const host = createRustHostTransport(workspace);
    try {
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
    } finally {
      host.process.stop();
      await rm(workspace, { recursive: true, force: true });
    }
  });
});
