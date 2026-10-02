# Quickstart: US-909 阶段 B 验证

**Plan**: [plan.md](plan.md) | 契约见 [data-model.md](data-model.md)

## 前置

```bash
export PATH="$HOME/.nvm/versions/node/v26.7.0/bin:$PATH"; unset CI
cd /Users/jimmy/Documents/aiao/rxdb
```

所有 nx 命令加 `NX_DAEMON=false`。e2e 由 `dev-rxdb-angular-e2e` 的 webServer 在 8200 端口起 dev 应用（强制 IDB）。

## 1. 单测（纯函数）

```bash
NX_DAEMON=false pnpm nx test dev-rxdb-angular -- src/app/rxdb/failure-archive.spec.ts
```

预期：原因映射、sink 上限、base64 往返、manifest → 库名、业务表筛选全部通过。

## 2. lint 守卫（AC#6）

```bash
NX_DAEMON=false pnpm nx lint dev-rxdb-angular-e2e
```

预期：0 error / 0 warning。临时在任意 spec 写 `import { test } from '@playwright/test'` → 报 `no-restricted-imports`。

## 3. 归档行为（AC#4、5、8、9）

```bash
NX_DAEMON=false pnpm nx e2e dev-rxdb-angular-e2e -- src/failure-archive.spec.ts --retries=0
```

预期：

- 导出前后 `snapshot()` 的结构文本、业务表行数、工作树状态相等；附件 `rxdb-failure-archive`（octet-stream）与
  `rxdb-failure-summary`（JSON）各一份；摘要 `outcome: 'archived'`、`page: 'original'`、`dbName` 等于页面的 e2e 库名。
- 关页 → `page: 'reopened'` 且导出成功；崩溃同上；上下文关闭 → `page: 'unavailable'`、`reason.code: 'context_unavailable'`。
- 护栏 1 ms → `reason: { stage: 'transfer', code: 'timeout' }`；页内截止 1 ms → `{ stage: 'connect', code: 'timeout' }`；
  `maxBytes: 1` → `{ stage: 'backup', code: 'io_error' }`；三者都没有归档附件，只有摘要。

## 4. 导入（AC#7）

```bash
NX_DAEMON=false pnpm nx e2e dev-rxdb-angular-e2e -- src/failure-archive-import.spec.ts --retries=0
```

预期：新上下文在 `/failure-archive` 导入后 reload 进导入库；业务表行数、HEAD、未提交条目数与摘要一致；丢弃未提交改动后
恢复较早的提交，状态条显示「恢复中」与「有未提交改动」。

手动：`pnpm nx serve dev-rxdb-angular` → 打开 `/failure-archive` → 选报告里下载的 `rxdb-failure-archive` → 「导入并打开」→
顶部提示条显示导入库名 → `/working-tree` 查看；「回到默认库」回到 `aiao`。

## 5. 自动触发 + AC#1～3 不回退（临时探针，不提交）

在 `apps/dev-rxdb-angular-e2e/src/` 临时加一个 spec：写一条 Todo 后 `expect(1).toBe(2)`。

```bash
NX_DAEMON=false pnpm nx e2e dev-rxdb-angular-e2e -- src/<probe>.spec.ts --retries=0 --reporter=json
```

预期：1 failed；失败原因仍是 `expect(1).toBe(2)`；该用例的附件里有 `rxdb-failure-archive`、`rxdb-failure-summary` 与 `trace`；
`test-output/playwright/output/<用例目录>/trace.zip` 存在。删除探针。

## 6. 全量（AC#6、9）

```bash
NX_DAEMON=false pnpm nx e2e dev-rxdb-angular-e2e -- --retries=0 --reporter=json > /tmp/us909-b-full.json
```

预期：全部通过；除 `failure-archive*.spec.ts`（直接调用 `archiveFailure()`，附件挂在自己身上）外，JSON 报告里没有任何
`rxdb-failure-archive` / `rxdb-failure-summary` 附件；墙钟与 `rrweb` 分支同机基线相比在噪声内。
