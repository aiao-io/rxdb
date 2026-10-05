# PKG-sqlite-core：本地新风险交接（主控去重后决定 RV）

- 对象仅 `packages/rxdb-adapter-sqlite-core`；原 scope 179 文件 / 54,621 行。
- **这是 checkpoint 的已确认源码意见，不是整包完成或发布就绪。** 未读正文继续留在审。
- 读证据：`file-inspection.json`（实际有界输出、人工确认 notes/C、当前 SHA）；测试输出不替代全文阅读。
- 去重：RV066/067 已 `resolved-removed`，本轮不复报 factory/oo1 迟到初始化关闭窗；非 public QueryCache 的 target/refresh/delete 归既有 RV061（报告根因第25行已包含刷新和删除），不新登记。RV028/029/046/055 等旧修复也不从旧红日志复活。
- 下列局部 ID **不是 RV 编号**，由主控核对当前根 RV 登记后分配。

## 已确认 SC-PKG-001 — [P1] `*Id` 属性在加密判断前被普通值捷径截获

**触发条件**：合法元数据包含 `encrypted: true` 的字符串属性 `nationalId`（默认同名物理列），实体没有关系外键。

**源码链**：`src/sqlite-core.utils.ts:401–403` 在 `propertyMap.get(key)` 之前，用 `!hasForeignKeys && key.endsWith('Id')` 直接普通转换并 `continue`；因此跳过 `409–429` 的 locked 检查和 encrypt/AAD 路径。真实 INSERT 构造器 `src/entity/insert_sql.ts:66–69` 使用同一个转换器，并把转换结果直接作为 SQL 参数。

**实际观察**：公开 `Entity`/`getEntityMetadata` 和 `validateEncryptedPropertyMetadata` 接受该元数据；`foreignKeyNames=[]`，`encryptedPropertyMap` 有 `nationalId` 和非后缀对照 `secret`。未锁定 fake keyring 的 encrypt 只调用一次（对照字段），`nationalId` 原始敏感字符串进入绑定并在真实 Node 26 `DatabaseSync` 中读回明文。keyring 为 null 时，只写 `nationalId` 仍 fulfilled 且返回明文，没有 `EncryptedLockedError`。

**证据边界**：真实 SQLite 落库 + shared-core 转换器，encrypt 为计数/返回密文标记的替身，不是密码学实现验收；没有冒充四浏览器引擎、OPFS 或完整 Repository UI 用户链路。2 个契约断言真实失败，输入179文件无漂移。

**证据**：`review-packages-20261005-encrypted-id.spec.ts`、对应 config/report；`validation/encrypted-id-01-*` 的完整 raw/status/inputs 与 JSON report。

**最小改进**：先按实际 FK 元数据和 property/columnName 元数据识别字段；未知 `*Id` 兼容路径不能压过已声明属性。不要把「带 Id 后缀」等同于关系外键。保留普通/物理列映射契约，补 unlocked、locked、nullable、自定义 columnName 和三类写构造器回归。先保留红测，未改业务。

## 已确认 SC-PKG-002 — [P2] COMMIT / ROLLBACK 事件先于 executor 终态，回调能在事务结束后写库

**源码链**：`src/RxDBAdapterSqliteBase.ts:1667–1677` 已 COMMIT 后派发 commit 事件，`1695–1700` 已 ROLLBACK 后派发 rollback 事件；executor 直到 `1714–1717` 的 finally 才 settle。`src/transaction/SqliteTransactionExecutor.ts:115–118` 只在调用时检查 active，然后直接 client.execute。

**实际观察**：使用真实 Node 26 内存 SQLite、原 adapter/executor、按公开事务事件 tag 的同步 dispatch 替身。事件回调捕获事务 executor 后执行 INSERT：两条事件内 state 均为 active，写入均 accepted。COMMIT 后表包含 owned 和 escaped 两行；ROLLBACK 后本应为空的表仍包含 escaped 一行。事务 Promise 返回后 state 才分别变 committed / rolled-back。

**证据边界**：确认 shared-core 的终态/下发顺序以及 SQLite autocommit 残留；RxDB dispatch 为同步替身，不宣称整仓事件总线或三框架公开用户链路已跑。现有 executor 测试只手动 settle 后验证拒绝（168行已全文读），不能覆盖此时序。

**证据**：`review-packages-20261005-transaction-boundary.spec.ts` 与对应 config/report；最终有效测量 `validation/transaction-boundary-03-*` 的 raw/status/inputs/report，2 个断言真实失败且输入无漂移。第01轮 import 路径错误（0 tests）、第02轮 source/dist instanceof 错配是探针接线失败，不作为业务缺陷依据；全部留档。

**最小改进**：物理 COMMIT 成功或 ROLLBACK 完毕即先 settle，再暴露终结事件；保持已提交监听器失败不再回滚、领域 Error 原样抛出、finally 兜住所有异常路径。补两种终结事件内重入和提交后监听异常回归。先保留红测，未改业务。

## 候选 SC-PKG-C01 — [P2 待证] 回滚失败 invalidate 丢代理引用却未释放 transport

- `src/RxDBAdapterSqliteBase.ts:1598–1604` 清 cached/clientPromise 后仅 client.disconnect，未走 releaseComlinkProxy/存储锁释放；后续普通 disconnect 已没有该 cached 代理可释放。
- `src/create_sqlite_client.ts:188–201,232–240` 的 transportRoot.activeClients 只在 endpoint 创建失败或 explicit releaseComlinkProxy 后归零，同一 Worker 未归零会拒绝新连接。
- 推论：Comlink 回滚失败路径可能永久占同 Worker 的客户端租用及 message port；不是 RV066/067 的 factory/load 迟到关闭问题。
- **尚未跑真实 MessagePort / Worker + 故障注入复验，不标 confirmed。** owner：sqlite-core 生命周期与各 Worker 子后端；场景：SQL failure + ROLLBACK failure → invalidate → reconnect same caller-owned Worker → stop/release，同时核查 shared lock。无需用发布/真设备门禁阻止已确认意见交付。

## 未测（不是缺陷、不是源码完成阻断的发布门禁）

- 新 probe 的独立 strict typecheck/lint 尚未运行；本轮没有改 strict/skipLibCheck、没有 any 或 warning suppressions，没有依赖或原测试/index 变更。
- 各后端/浏览器/桌面真实宿主、跨 Tab、OPFS/WAL、backup/restore 崩溃和发布 consumer 全矩阵未本轮执行，归场景/发布 owner。
- 整包正文仍有大量未读文件；此项是**源码完成本身**的真实剩余工作，不能用绿色探针或哈希代替。
