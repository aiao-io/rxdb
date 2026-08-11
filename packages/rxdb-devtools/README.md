# @aiao/rxdb-devtools

RxDB 与浏览器 DevTools Extension 之间的开发期连接器。它通过当前页面的 `window.postMessage` 发送事件、数据库摘要、实体查询结果和分支操作结果。

## 只在开发环境启用

这个包暴露了数据库检查、查询、分支变更和断开能力，禁止在生产构建中初始化。

```ts
if (import.meta.env.DEV && typeof window !== 'undefined') {
  const { getDevToolsConnector } = await import('@aiao/rxdb-devtools');
  getDevToolsConnector().init(rxdb, getEntityMetadata);
}
```

调用方负责确保生产 bundle 不执行 `init()`。`enabled: false` 可用于测试或显式关闭，但不能替代构建期的开发环境门禁。

## 生命周期

- `getDevToolsConnector()` 返回页面级 connector 单例。
- `init(rxdb, getEntityMetadata)` 注册 RxDB 实例、读取实体 metadata、监听 RxDB 事件并发送 `HANDSHAKE`。
- DevTools 返回 `HANDSHAKE_ACK` 后，connector 发送实时事件，并刷新握手前的内存事件缓冲区。
- 对同一个 RxDB 对象重复 `init()` 是幂等操作，不会重复握手、读取 metadata 或注册监听。
- 当前协议明确只支持一个 RxDB 实例。第二个不同实例会在读取其 metadata、修改映射或注册监听前抛错。
- `disconnect()` 只断开 connector 通信、清理监听和缓冲区，不调用 `rxdb.disconnectAll()`。
- `DISCONNECT_RXDB` 或 `window.__AIAO_RXDB_DEVTOOLS__.disconnectRxdb()` 会请求关闭 RxDB：
  - `graceful`：`disconnectAll()` 成功，随后清理实例和监听；
  - `forced`：graceful 失败，但本地 Worker 终止或 SharedWorker port 关闭成功，随后清理；
  - `failed`：关闭、超时或强制释放失败，保留实例、监听和全局 helper，允许重试；
  - `not-connected`：当前没有已注册实例。

## SSR

`init()` 和 `disconnect()` 在没有 `window` 的环境中是 no-op。仍建议把动态导入和初始化放在浏览器开发环境分支内，避免服务端无意义加载。

## 通信与威胁模型

connector 只接受：

- `event.source === window`；
- `event.origin` 为空或等于当前页面 origin；
- 完整且无额外字段的 message envelope；
- 已知消息类型、合法方向和对应命令 payload。

这些检查用于拒绝 malformed 消息，**不是身份认证**。任何能在同一页面执行 JavaScript 的脚本，都可能构造一条完全合法的 `window.postMessage` 命令。把 token 放进同一个可观察、可重放的 `postMessage` 通道只会制造安全幻觉，因此本包不实现这种 token。

真正可信的 capability 需要 Extension 在隔离边界中建立不可由页面脚本伪造的通道；这涉及包外 Extension 协议，当前未实现。在此之前，只能把本包视为开发工具，并把页面上的第三方脚本视为同等可信。

### 危险命令

- `DISCONNECT_RXDB`：关闭当前 RxDB 实例；
- `QUERY_ENTITY`：读取指定实体，`limit` 仅允许缺省或 `1..1000` 的安全整数；
- `SWITCH_BRANCH`：切换分支；
- `CREATE_BRANCH`：创建分支；
- `DELETE_BRANCH`：删除分支。

malformed envelope 或 payload 会被静默拒绝，不会进入命令 handler，也不会把非法 `limit` 回退成默认值。

## 加密字段策略

`getEntityMetadata` 返回的 `encryptedPropertyMap` 是唯一加密字段来源。connector 在初始化时建立字段映射，并执行以下规则：

- `QUERY_ENTITY` 的结果中，metadata 声明的顶层字段始终替换为 `[encrypted]`；
- 事件 `entities[].patch`、`entities[].inversePatch`、`entities[].data` 使用同一遮罩规则；
- 非敏感字段保持不变；
- 只解释顶层字段名，不解析 `profile.ssn` 一类嵌套路径；嵌套对象中的同名字段不会被递归替换；
- 不提供明文 opt-in，DevTools 永远不会通过本协议请求返回 metadata 声明字段的明文；
- serializer 仍会遮罩符合已知加密 envelope 格式的字符串。

如果 metadata 漏报字段，connector 无法猜测其敏感性。实体 metadata 的正确性属于上游安全契约。

## bigint / binary wire 表示

`QUERY_ENTITY`、`EVENT`、history/change、conflict 和分支响应共用只读 serializer。该表示只服务 DevTools 通信与展示，不用于实体写回或 change 持久化：

```ts
type DevToolsBigIntValue = { $rxdb: 1; type: 'bigint'; value: string };
type DevToolsBinaryValue = {
  $rxdb: 1;
  type: 'binary';
  encoding: 'base64url';
  value: string;
  byteLength: number;
};
```

- bigint 使用精确十进制字符串；
- binary 复制当前 `Uint8Array` 视图后编码为无 padding 的 base64url；
- serializer 不修改实体、patch 或输入字节；
- metadata 声明的加密字段先替换为 `[encrypted]`，再进入 serializer，因此不会暴露明文或 binary 长度；
- 面板只识别 `$rxdb: 1` 的合法已知 envelope，其他版本显示 `unsupported`，不会猜测解码。
