# `@aiao/rxdb-plugin-p2p-files`

局域网大文件共享的框架无关服务层。清单元数据可由 RxDB 同步，文件字节经已认证的
WebRTC DataChannel 或 TLS TCP 直传；传输按 SHA-256 分块校验，支持断点续传、多源选路、
坏 peer 退避和服务器回退。

```ts
import {
  createAuthenticatedP2PFileManifest,
  downloadP2PFile,
  rxDBPluginP2PFiles
} from '@aiao/rxdb-plugin-p2p-files';
```

插件只注册 `P2PFileManifestEntity`，不会在 `use()` 或 `connect()` 时自行建立网络连接。
应用负责把信令、mDNS 和桌面 socket 接到 `P2PByteTransport`，并把同步认证主体传给
`createAuthenticatedP2PFileManifest`。
