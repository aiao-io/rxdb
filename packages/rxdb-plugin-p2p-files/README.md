# `@aiao/rxdb-plugin-p2p-files`

局域网大文件共享的框架无关服务层。持有声明可由 RxDB 同步，文件字节经已认证的
WebRTC DataChannel 或 TLS TCP 直传；传输按 SHA-256 分块校验，支持断点续传、多源调度、
坏 peer 隔离和服务器回退。

```ts
import { createAuthenticatedP2PFileManifest, downloadP2PFile, rxDBPluginP2PFiles } from '@aiao/rxdb-plugin-p2p-files';
```

插件只登记 `P2PFileManifestEntity`，不会在 `use()` 或 `connect()` 时自行建立网络连接。
实体在 `init()` 时绑定、建表，所以必须在 `connect()` 之前 `use()`，晚了直接抛错。
应用负责把信令、mDNS 和桌面 socket 接到 `P2PByteTransport`，并把认证宿主验证过的用户与设备
（`P2PPrincipal`）传给 `createAuthenticatedP2PFileManifest`。

- **持有声明不过期**：声明只在获得或删除文件时变更；设备是否在线由信令 presence、mDNS 或连接探测回答，
  不写进同步实体，也不拿本机时钟比较远端时间戳。同步来的行先过 `isP2PManifestRecord` 结构校验再用于选源。
- **按字节区间取块**：请求带请求方清单的 `offset` / `size`，持有方用 `readRange` 读本地文件，
  块大小不同的持有者也能互相供块。
- **有界缓冲**：传输并发、流式接收窗口与单连接入站并发都不超过 8 个块；TCP 等 `drain`，
  WebRTC 等 `bufferedamountlow`，超过 DataChannel 消息上限的帧自动分片。
- **存储故障不回退**：写盘、读回复核失败或清单自相矛盾抛不可重试的 `P2PTransferError`；
  只有可重试的 P2P 失败才回退服务器，回退时跳过已校验落盘的块。
