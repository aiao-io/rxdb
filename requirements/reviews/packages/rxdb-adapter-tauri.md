# rxdb-adapter-tauri 深度评审

评审日期：2026-10-29；源码基线：`f62f77c19d55c73d8335df026778422282c2fed4`。本次为公开入口和高风险路径审计，未声称逐行覆盖整个包。更新轮核对：自基线 `7bb16a9` 至 HEAD 本包无源码变更。

统一 Nx 校验结果见 [包级索引](README.md)；源码实证与测试运行结果分别记录，未运行的宿主验证不计为通过。

## 结论与范围

🟡凑合：Rust 宿主的路径白名单、SQL authorizer 和按窗口会话归属有独立实现；公开 JSON 编解码器存在特殊键往返丢失。独立问题 1 条，另继承共享 SQLite 加密缺陷。2026-10-29 更新轮复核：自基线起本包无源码变更，TAU-001 仍有效，本更新轮未发现新的确定问题。

| 评审重点            | 源码与符号                                                                                                                                                                                                            | 当前判断                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| adapter 入口与恢复  | [`RxDBAdapterTauri`](../../../packages/rxdb-adapter-tauri/src/RxDBAdapterTauri.ts)                                                                                                                                    | 逻辑库名构造期校验、恢复前由桌面共享层取得文件独占连接                     |
| 订阅生命周期        | [`createTauriHostTransport`](../../../packages/rxdb-adapter-tauri/src/tauri-host-transport.ts)                                                                                                                        | 共享惰性订阅、异步注册期间退订清理、subscriptionReady 与监听错误出口已检查 |
| JSON 传输与公开 API | [`encodeDesktopJsonPayload` / `decodeDesktopJsonPayload`](../../../packages/rxdb-adapter-tauri/src/desktop-json-codec.ts)、[`index`](../../../packages/rxdb-adapter-tauri/src/index.ts)                               | 发现 TAU-001；bigint/base64 标签的规范形式已检查                           |
| Rust 作用域         | [`DesktopRouter.handle_owned` / `close_owner`](../../../packages/rxdb-adapter-tauri/rust/src/router.rs)、[`validate_database_name` / `resolve_database_path`](../../../packages/rxdb-adapter-tauri/rust/src/paths.rs) | 根据窗口校验归属、回收代次兜住迟到 open；路径严格白名单                    |
| Rust SQL 边界       | [`Engine` 的 authorizer](../../../packages/rxdb-adapter-tauri/rust/src/engine.rs)                                                                                                                                     | 抽查 ATTACH/DETACH、VACUUM INTO 与重定向全局目录 PRAGMA 拒绝路径           |

## 确定问题

### TAU-001 · P2 · JSON codec 把 `__proto__` 数据键写成结果对象原型

**证据与根因。** [`encodeEntries` / `decodeEntries`](../../../packages/rxdb-adapter-tauri/src/desktop-json-codec.ts) 都新建 `{}` 后用 `result[key] = value` 填值。合法 JSON 自有键 `__proto__` 会调用普通对象的原型 setter。两个函数通过包根公开导出，声明接受一般 JSON payload，并专门保证类似标签的用户对象可以往返；该键没有被契约排除。

**触发步骤。** 对 `JSON.parse('{"__proto__":{"fromPayload":true},"safe":1}')` 调用编码器或解码器。预期结果仍有两个自有键；实际只剩 `safe`，且结果对象从 payload 继承了 `fromPayload`。

**验证。** 用 Node `stripTypeScriptTypes` 执行当前整个 codec 文件，移除 import 并只注入错误类，原函数实际输出：

```json
{
  "decodedInherited": true,
  "decodedKeys": ["safe"],
  "encodedInherited": true,
  "encodedKeys": ["safe"],
  "inputKeys": ["__proto__", "safe"]
}
```

**影响与限定。** 公开 helper 的数据往返丢键，后续 JSON.stringify 会静默丢掉该字段；结果对象的继承链也被输入改变。这里没有写入 `Object.prototype`，**不构成已证实的全局原型污染**；现有 SQLite 窄协议通常不携带任意键的对象，该协议普通查询受影响范围也不能由此扩大推断。

**修复与回归。** 用 `Object.defineProperty` 定义自有数据属性，或用空原型容器并验证上层对原型的约定。编码与解码两侧同时补 `__proto__`、`constructor`、`prototype`、嵌套对象、`$esc` 组合的往返断言；断言自有键完整、原型未被用户值替换。

**2026-10-29 复核：**仍有效。HEAD `f62f77c19d55c73d8335df026778422282c2fed4` 相对基线本包无源码变更：`encodeEntries()` / `decodeEntries()` 仍新建 `{}` 后以 `record[key] = value` 填值，`__proto__` 键仍走原型 setter；包根 [`src/index.ts`](../../../packages/rxdb-adapter-tauri/src/index.ts) 仍公开导出两个 codec。Rust 侧 `validate_database_name()` / `resolve_database_path()` 白名单与 `DesktopRouter` 的代次回收仍在，TAU-001 与其是不同的边界。

## 共享风险

[sqlite-core SQLC-001](rxdb-adapter-sqlite-core.md)（P2）会经 `RxDBAdapterSqliteBase` 影响 Tauri：合法加密 Id 后缀列写入失败。TypeScript 生成的绑定参数跳过加密，但普通公开仓库的解密回填失败会回滚同一事务；不能据此宣称 Tauri 普通保存后已提交明文。修复归共享转换层，不重复计数。

## 测试与宿主边界

已定位 [`desktop-json-codec.spec.ts`](../../../packages/rxdb-adapter-tauri/src/__tests__/desktop-json-codec.spec.ts)、[`tauri-host-transport.spec.ts`](../../../packages/rxdb-adapter-tauri/src/__tests__/tauri-host-transport.spec.ts) 与 Rust authorizer/路径内置测试。上述局部 codec 复现不等于已运行 Rust 或真实 Tauri WebView；窗口销毁回收、多窗口事件投递和文件锁还需宿主验收。

## 调用链交叉核查

TAU-001 限于编解码 helper 对结果对象继承链及自有键的修改，不影响全局 Object.prototype。Rust owner 校验和路径白名单与 TypeScript codec 是不同边界，未因 helper 复现而宣称已穿透窗口/文件访问控制。

## 本次 Nx 校验

首轮（2026-10-28）`rxdb-adapter-tauri:test`：39 passed (39)；目标实际执行。命令及整体边界见[总索引](README.md)。
