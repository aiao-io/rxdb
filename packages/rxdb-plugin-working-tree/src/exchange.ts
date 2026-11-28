/**
 * @fileoverview `@aiao/rxdb-plugin-working-tree/exchange`：提交交换格式的纯函数入口（US-319）。
 *
 * @remarks
 * 给交换的**另一端**用。`importCommits()` / `exportCommits()` 交换的是 {@link CommitExchangeRecord}，内容指纹是跨系统契约：
 * 首个使用方是 Admin 的服务端，它要按平台规则校验上传批次的形状、复算单元与提交的指纹、给自己合成的合并提交算指纹，
 * 收发都走 JSON，还要能跑在 Supabase Edge Function（Deno）里。这几件事的实现本来就在插件里，服务端照着文档另写一份，
 * 写对的那天两边一致，之后谁先改谁就先分岔——而分岔的症状只是每一次导入都落在 `fingerprint_mismatch` 或 `invalid_batch` 上。
 * 所以把它们原样从这里交出去：服务端拿到的，就是导入命令自己用的那几个函数。
 *
 * **为什么是一个子路径，不是主入口。** 主入口是插件：12 个系统实体类（`@Entity` 装饰器在模块求值时就执行）、插件类、
 * 捕获运行时与它要装到核心适配器上的钩子、提交图的读写命令，外加 `@aiao/rxdb-plugin-history`。服务端一个都用不上，
 * 导入主入口却要把它们全部求值一遍。这个入口只加载三个纯模块：
 *
 * - `commit/change-unit.ts`：单元指纹、提交指纹与按交换记录算的提交指纹；
 * - `working-tree/import-batch.ts`：批次形状判定，`importCommits()` 的 `invalid_batch` 就是它判的；
 * - `commit/commit-exchange-json.ts`：`createdAt` 在 Date 与 ISO 串之间的严格编解码。
 *
 * 运行时唯一的外部依赖是 `@aiao/rxdb`（`sha256Hex` 与 `RxDBError`），它本来就是本包的 peer。类型从哪个模块来都无所谓：
 * `export type` 在编译期擦除，`CommitExchangeRecord` 住在要读库的 `commit-exchange.ts` 里也不会把那个模块带进来。
 * 守这条的是 `__tests__/exchange/exchange-entry-isolation.spec.ts`：在一个干净的模块环境里只导入本入口，加载到的本包模块
 * 必须恰好是上面三个加本文件——往闭包里多拉一个实体或运行时模块，它就红。
 *
 * 用法见插件文档「导入与导出远端提交」的「服务端：`./exchange` 子路径」一节。
 */

export {
  computeChangeUnitFingerprint,
  computeCommitContentFingerprint,
  computeCommitExchangeRecordFingerprint,
  type CommitChangeUnitContent,
  type CommitChangeUnitOperation,
  type CommitChangeUnitOrigin,
  type CommitContentFingerprintInput
} from './commit/change-unit.js';
export {
  CommitExchangeJsonError,
  parseCommitExchangeRecord,
  serializeCommitExchangeRecord,
  type CommitExchangeJsonProblem,
  type CommitExchangeRecordJson
} from './commit/commit-exchange-json.js';
export type { CommitExchangeRecord } from './commit/commit-exchange.js';
export type { CommitKind } from './commit/commit.entity.js';
export {
  checkCommitExchangeBatch,
  type CommitImportBatchFinding,
  type CommitImportBatchProblem
} from './working-tree/import-batch.js';
