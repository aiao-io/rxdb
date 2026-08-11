# `@aiao/rxdb-devtools` 代码评审

## 结论

🔴 不通过。Observable 异步错误已可回传，但页面命令通道仍缺少可信认证，破坏性操作仍可被同页脚本伪造。

## 修复状态（2026-07-15）

- DEVTOOLS-002 已修复：查询与分支 Observable 的异步错误都会返回确定响应。
- DEVTOOLS-001 未修复：需重新设计页面与扩展之间的可信握手边界。
- `test` 172 个用例通过，覆盖率 91.66%；`lint`、`typecheck`、`build` 全部通过。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`packages/rxdb-devtools` 下消息协议、连接器、序列化、缓冲区、测试和 Nx 配置；20 个文件，约 2,834 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过
- 测试现状：6 个 spec/test 文件；消息形状覆盖较好，但未覆盖伪造命令和异步 Observable error

## 问题

| ID           | 级别 | 位置                   | 问题与影响                                                                                                                                                                                                                                                                         | 建议                                                                                                                         |
| ------------ | ---- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| DEVTOOLS-001 | P1   | `src/connector.ts:256` | 入站命令只要求 `event.source === window`、同 origin 和公开的 `source/direction/type` 字段。页面内任意脚本都能构造合法消息，触发 `QUERY_ENTITY`、`DELETE_BRANCH`、`DISCONNECT_RXDB` 等读写/破坏性操作；默认配置还是 `enabled: true`。消息严格校验解决了形状问题，没有解决认证问题。 | 握手生成不可预测 session nonce，并要求后续命令携带且匹配；默认仅开发环境启用，生产必须显式 opt-in。为伪造命令增加拒绝测试。  |
| DEVTOOLS-002 | P1   | `src/connector.ts:116` | `subscribeOnce()` 只提供 `next` 回调，没有 `error` 回调。`#handleQueryEntity()` 和 `#handleGetBranches()` 外层 `try/catch` 只能捕获同步 subscribe 异常，RxJS 的异步 error 会变成未处理错误，DevTools 永远收不到失败响应。                                                          | 让 helper 接收 `next/error` observer，所有请求都必须在成功或失败路径发送一次响应并取消订阅；增加异步 `throwError` 回归测试。 |

## 其余观察

- 加密字段在实体查询和事件 payload 两条路径都会遮罩，envelope 形式也有兜底遮罩。
- 缓冲区有固定上限，断开时移除 window/RxDB 监听并清空状态。
- 未发现 `any`、TypeScript 抑制指令或 ESLint 忽略。

## 验收条件

- 修复后执行 `pnpm nx test rxdb-devtools`、`pnpm nx typecheck rxdb-devtools`、`pnpm nx lint rxdb-devtools`、`pnpm nx build rxdb-devtools`。
- 未通过已认证握手的页面消息不得读取数据、切换/创建/删除分支或断开数据库。
