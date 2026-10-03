# Quickstart: 阶段 C 验证

**Plan**: [plan.md](plan.md) | 命令前缀统一：

```bash
export PATH="$HOME/.nvm/versions/node/v26.7.0/bin:$PATH"; unset CI; export NX_DAEMON=false
```

## 1. 单元 / 组件测试（AC#10、11、14、15、16、17）

```bash
pnpm nx run-many -t lint test build --projects=rxdb-plugin-working-tree,rxdb-plugin-replay,rxdb-plugin-replay-angular,rxdb-plugin-replay-react,rxdb-plugin-replay-vue
```

期望：

- working-tree：`facade-commits.spec.ts` 覆盖 [contracts/working-tree-commits.md](contracts/working-tree-commits.md) §1 全表；
  `facade-capability-gate` 与 API 基线测试通过（基线 diff 随提交）。
- replay core（node）：上限四种情形（未超、单会话超、总量超、`start()` 拒绝）、`deleteSession` 后可再开、刷新续录（暂存过滤 /
  `gap` / 暂存损坏）、双写入者合计不越线、commit 标记顺序、`restoreToCommit` 四种拒绝的提示、选项校验。
- replay core（chromium `*.browser.spec.ts`）：真 rrweb 录一段 DOM 变化 → 回放 seek 到中途的 DOM 正确；`maskAllInputs` 默认生效、
  `data-rxdb-replay-block` 区块被替换（AC#16）；`mountReplayer` 四态与键盘可达。
- 三个封装包：parity 契约 7 条全绿（[contracts/replayer-component.md](contracts/replayer-component.md) §4）。
- 覆盖率：四个新包 ≥ 80%（`pnpm nx test <project> --coverage` 后 `node scripts/audit/coverage-check.mjs`）。

## 2. demo 闭环（AC#10～14、16、17）

```bash
pnpm nx e2e dev-rxdb-angular-e2e -- --grep "replay"
git restore benchmarks/reports/
```

期望：`replay.spec.ts` 全绿（场景见 research D11）；同时跑一遍阶段 A / B 的 spec（`failure-archive`、trace 配置）确认 AC#1～3 不回退。

手动：

1. `pnpm nx serve dev-rxdb-angular` → `/replay` → 打开录制开关（页面 reload）。
2. 建两条 Todo、各提交一次 → 回 `/replay` → 停止 → 选会话：时间轴可拖，两个 commit 标记按提交顺序排列。
3. 点第一个标记：回放跳到第一次提交那一刻，状态区显示 `Restored …`；Todo 页上工作树变脏（恢复出来的变更）。
4. 关掉开关 reload：DevTools Network 里不出现 `rrweb` 与 `rxdb-plugin-replay` 的 chunk，IndexedDB 里没有新建 `*-replay` 库（FR-022）。

## 3. 性能（SC-007、SC-008）

```bash
REPLAY_BENCH=1 pnpm nx test rxdb-plugin-replay -- store.bench
pnpm nx build rxdb-plugin-replay
npx esbuild packages/rxdb-plugin-replay/dist/index.js --bundle --minify --format=esm \
  --external:rrweb --external:'@rrweb/*' --external:'@aiao/*' --external:rxjs | gzip -c | wc -c
```

期望：基准输出的中位数 < 100 ms；最后一条输出 < 51200（50 KB）。实测数写进 tasks.md 对应任务与故事的实现记录。

## 4. 依赖门禁（FR-023）

```bash
grep -n '"rrweb"\|"@rrweb/types"' packages/rxdb-plugin-replay/package.json   # 值无 ^ / ~
pnpm audit --prod
```
