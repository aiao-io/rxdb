# `@aiao/rxdb-plugin-p2p`

局域网 P2P 的框架无关服务层：一对设备只建一条已认证的会话（WebRTC DataChannel 或 TLS TCP），
多个协议在这条会话上复用。内置 files 协议做大文件共享：持有声明可由 RxDB 同步，文件字节经会话直传，
按 SHA-256 分块校验，支持断点续传、多源调度、坏 peer 隔离和服务器回退。

```ts
import {
  createAuthenticatedP2PFileManifest,
  createP2PFilesProtocol,
  createP2PFilesSource,
  createWebRTCTransport,
  downloadP2PFile,
  openP2PSession,
  rxDBPluginP2PFiles
} from '@aiao/rxdb-plugin-p2p';
```

插件只登记 `P2PFileManifestEntity`，不会在 `use()` 或 `connect()` 时自行建立网络连接。
实体在 `init()` 时绑定、建表，所以必须在 `connect()` 之前 `use()`，晚了直接抛错。
应用负责把信令、mDNS 和桌面 socket 接到 `P2PByteTransport`，并把认证宿主验证过的用户与设备
（`P2PPrincipal`）传给 `createAuthenticatedP2PFileManifest`。

## 会话

在应用接好的字节通道上打开会话，files 协议作为会话上的一个协议：

```ts
const session = openP2PSession({
  transport: createWebRTCTransport(dataChannel),
  role: 'initiator',
  connectionId,
  local: { principal, instanceId },
  credential, // 认证宿主签发、绑定到 connectionId
  authenticate: verifyPeerCredential, // 返回对端的 P2PPrincipal，或 null 拒绝
  protocols: [createP2PFilesProtocol({ contents: findLocalFile, authorize: authorizeRead })]
});
await downloadP2PFile({ manifest, sources: [createP2PFilesSource(session, holderId)], writeChunk });
```

- **hello 与认证**：双方先交换 hello，凭据绑定到 `connectionId`，未通过认证即以通用的 `unauthorized` 关闭，
  不泄露本端持有的任何内容。
- **协议协商**：两端都声明、版本相同的协议才可用；对端请求未协商的协议得到 `unsupported`，会话不断；
  未知帧类型被忽略，较新版本的对端不会因此断连。
- **逐请求授权**：files 协议先 `authorize` 再查内容表，本端没有该内容以 `not_holder` 拒绝；
  请求方取消后，供块端不再读盘。
- **调度与限流**：每个协议的入站并发缺省 8，全会话未完成请求超过 32 个即视为对端违反协议；
  控制帧（hello、心跳、取消、不带负载的应答）先于带负载的批量帧发送。
- **生命周期**：心跳超时以 `peer_lost` 结束会话；`P2PSessionRegistry` 按对端身份去重，
  双方同时拨号时两端保留同一条连接。

## 文件传输

- **持有声明不过期**：声明只在获得或删除文件时变更；设备是否在线由信令 presence、mDNS 或连接探测回答，
  不写进同步实体，也不拿本机时钟比较远端时间戳。同步来的行先过 `isP2PManifestRecord` 结构校验再用于选源。
- **按字节区间取块**：请求带请求方清单的 `offset` / `size`，持有方用 `readRange` 读本地文件，
  块大小不同的持有者也能互相供块。
- **有界缓冲**：传输并发、流式接收窗口与 files 协议的入站并发都不超过 8 个块；TCP 等 `drain`，
  WebRTC 等 `bufferedamountlow`，超过 DataChannel 消息上限（不小于 1 KiB）的帧自动分片，
  短于该下限的非末片按对端违反协议处理。
- **服务器回退流式落盘**：`P2PServerFallback.download` 返回响应字节流（如 `fetch()` 的 `body`），
  按清单逐块校验通过才落盘，不整体载入文件；坏块不落盘，响应长度或整文件哈希不符都报错。
- **存储故障不回退**：写盘、读回复核失败或清单自相矛盾抛不可重试的 `P2PTransferError`；
  只有可重试的 P2P 失败才回退服务器，回退时跳过已校验落盘的块。
