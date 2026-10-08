# Quickstart: 验证 US-031 阶段 A

前提：Node 26（`export PATH="$HOME/.nvm/versions/node/v26.7.0/bin:$PATH"`）；本地验证加 `--skipRemoteCache`（Nx Cloud 已超限）。
全量门禁失败时先单独复跑失败任务，再判断是否真失败（AGENTS.md「全量测试坑」）。

## 1. core 批内追加（契约 [core-batch-append.md](contracts/core-batch-append.md)）

```bash
pnpm nx test rxdb --skipRemoteCache                      # sortable 单测：组键拆分、同批新建父行的组不读尾键
pnpm nx test rxdb-adapter-pglite --skipRemoteCache       # 手动排序契约套件（含新增的自引用树用例），PGlite runner
pnpm nx test rxdb-adapter-sqlite-wasm --skipRemoteCache  # 同一套件，SQLite runner（浏览器模式）
pnpm nx run benchmarks:bench-sortable-batch --skipRemoteCache
```

预期：US-028 既有契约用例零修改通过；该基准同时接入 CI 的 `benchmark` job（`.github/workflows/ci-template.yml`），改了 `packages/` 或 `benchmarks/` 的 PR 都会跑；基准打印「显式键」与「缺键追加」两组耗时，10,000 行一档比值 ≤ 1.2，超出即非零退出。

## 2. 新实体（契约 [rxdb-test-sortable-tree-entities.md](contracts/rxdb-test-sortable-tree-entities.md)）

```bash
pnpm nx test rxdb-test --skipRemoteCache
```

预期：同形契约单测通过（新实体与旧实体除 `sortOrder.nullable` / `manualOrder` / 名称外逐项相等）；`DEMO_ENTITIES` 长度 18；公开契约基线含四个新导出。

## 3. 旧实体不受影响（AC#1）

```bash
pnpm nx run-many -t test --skipRemoteCache \
  -p rxdb-adapter-sqlite-wasm,rxdb-adapter-wa-sqlite,rxdb-adapter-sqlite,rxdb-adapter-sqliteai,rxdb-adapter-pglite,rxdb-adapter-electron
git diff --stat main -- packages/rxdb-test/entities/MenuSimple.ts packages/rxdb-test/entities/MenuLarge.ts \
  packages/rxdb-test/entities/FileNode.ts packages/rxdb-test/entities/FileLarge.ts docker/sql
```

预期：`menuIntegrationSuite` 与 PGlite / supabase 树测试不改即过；`git diff` 无输出。supabase 测试需要本机 `supabase-db` 容器，没有时注明未跑。

## 4. 三端 demo（契约 [demo-write-paths.md](contracts/demo-write-paths.md)）

```bash
pnpm nx run-many -t test --skipRemoteCache -p dev-rxdb-angular,dev-rxdb-react,dev-rxdb-vue
pnpm nx run-many -t e2e --skipRemoteCache -p dev-rxdb-angular-e2e,dev-rxdb-react-e2e,dev-rxdb-vue-e2e
```

手工走查（任一端，`pnpm nx serve dev-rxdb-<framework>`）：

1. 文件管理器根级依次新建文件夹 A、文件 X、文件夹 B，刷新 → A、X、B。
2. 菜单懒加载页：折叠一个已有子节点的节点，在它下面新建子节点，展开 → 新节点在最后。
3. 菜单任一页：G 下建 P、Q，P 下建 c1、c2；删除 P 选「提升子节点」，刷新 → G 下 Q、c1、c2。懒加载页里先折叠 P 再删，仍弹出选择对话框。
4. 批量添加 10,000 条（Angular 档位），观察完成时间与本阶段之前同机对比。

## 5. 源码检索（SC-005）

```bash
grep -rlE "generateKeys?Between" apps/dev-rxdb-{angular,react,vue}/src --include='*.ts' --include='*.tsx' --include='*.vue' | grep -v '\.spec\.'
```

预期只剩四个拖放文件（阶段 B 处理）：Angular `menu-drag-drop.service.ts`、`file-drag-drop.service.ts`，React `hooks/useDragDropService.ts`，
Vue `composables/useDragDropService.ts`。

## 6. 需求文档

```bash
node scripts/audit/requirements-consistency.mjs
```

阶段 A 合入时把 US-031 AC#1～4 的状态与证据回写故事，交付阶段表 A 改 ✅。
