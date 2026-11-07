# P2P 会话与文件共享

`@aiao/rxdb-plugin-p2p` 提供框架无关的局域网 P2P 服务。一对设备复用一条已认证会话，文件字节经 WebRTC DataChannel 或宿主接入的 TLS TCP 直传。文件持有声明可通过 RxDB 同步，字节传输与数据库同步分别配置。

## 接入职责

当前包族尚未进入 npm 发布集合，先从仓库工作区验证。包名与代码示例描述当前 main 的接入方式，不能把工作区的 `0.0.28` 当作这些包已经发布的证明。本地运行入口见[能力与示例](../../getting-started/capabilities.md)。

应用负责设备发现、信令、认证与字节存储，并把通道接到 `P2PByteTransport`。插件不提供托管信令服务，也不会在 `use()` 或 `connect()` 时自动联网。

```ts
import { rxDBPluginP2PFiles } from '@aiao/rxdb-plugin-p2p';

rxdb.use(rxDBPluginP2PFiles);
await rxdb.connect('local');
```

`local` 为应用已注册的适配器名。插件登记 `P2PFileManifestEntity`，必须在数据库初始化与连接之前安装，晚安装会报错。只有认证宿主确认过的 `P2PPrincipal` 才能用于创建持有声明。

## 在已有通道上打开会话

下面的 `dataChannel`、凭据、内容读取和授权回调都由应用提供：

```ts
import {
  createP2PFilesProtocol,
  createP2PFilesSource,
  createWebRTCTransport,
  downloadP2PFile,
  openP2PSession
} from '@aiao/rxdb-plugin-p2p';

const session = openP2PSession({
  transport: createWebRTCTransport(dataChannel),
  role: 'initiator',
  connectionId,
  local: { principal, instanceId },
  credential,
  authenticate: verifyPeerCredential,
  protocols: [createP2PFilesProtocol({ contents: findLocalFile, authorize: authorizeRead })]
});

await downloadP2PFile({ manifest, sources: [createP2PFilesSource(session, holderId)], writeChunk });
```

双方先交换 hello、认证并协商协议版本。凭据绑定 `connectionId`，认证失败以 `unauthorized` 关闭；files 协议逐请求授权，未经授权不查询内容。`P2PSessionRegistry` 按对端身份去重，心跳超时关闭失联会话。

## 文件传输边界

- 每块按 SHA-256 校验，支持断点续传、多源调度与坏 peer 隔离；未校验的块不会落盘。
- 持有声明只在获得或删除文件时更新。设备在线状态由 presence、发现或连接探测提供，不写进同步实体。
- 传输和流式接收最多缓冲 8 个块，按通道背压发送；大文件不整体装入内存。
- 服务器回退由应用提供流式 `P2PServerFallback`。仅可重试的 P2P 失败触发回退；写盘失败、复核失败或清单矛盾直接报错。

## 本地验证

```bash
pnpm nx serve dev-rxdb-p2p
```

该应用验证会话与文件传输。生产接入仍需配置实际的发现、信令和认证宿主。数据库的分支与 push / pull 接入见[数据协作](../../collaboration/README.md)。
