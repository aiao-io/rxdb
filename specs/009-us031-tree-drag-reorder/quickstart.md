# Quickstart: US-031 阶段 B 验证

命令前先 `export PATH="$HOME/.nvm/versions/node/v26.7.0/bin:$PATH"`；nx 一律带 `--skipRemoteCache`。

## 1. core 换算

```bash
pnpm nx test rxdb --skipRemoteCache   # 含 reorder-target-for-drop.spec.ts 与 api-baseline
```

期望：[contracts/core-drop-target.md](contracts/core-drop-target.md) 的十条用例通过；api-baseline 首跑失败属正常（新增导出），基线 diff 随提交。

## 2. 三端单测

```bash
pnpm nx run-many -t test --skipRemoteCache -p dev-rxdb-angular,dev-rxdb-react,dev-rxdb-vue
```

期望：[contracts/demo-drag-drop.md](contracts/demo-drag-drop.md) §4 的用例三端同名通过。

## 3. 三端 e2e

```bash
pnpm nx run-many -t e2e --skipRemoteCache --parallel=1 -p dev-rxdb-angular-e2e,dev-rxdb-react-e2e,dev-rxdb-vue-e2e
```

期望：三端 `tree-drag-reorder.spec.ts` 同名用例全绿，阶段 A 的 `tree-write-order.spec.ts` 不受影响。

## 4. 检索（AC#9）

```bash
grep -rlE "generateKeys?Between|compareSortOrder|rebalanceSortOrder|REORDER_NEEDED" apps/dev-rxdb-{angular,react,vue}/src
grep -rlE "sortOrder *(\?\?|\|\|) *''" apps/dev-rxdb-{angular,react,vue}/src
```

期望：两条都无输出。

## 5. 手工走查（每端一遍，`pnpm nx serve dev-rxdb-{angular,react,vue}`）

1. 菜单懒加载页：折叠有子节点的 P，把 X 拖进 P，展开——X 在最后；刷新不变。
2. 菜单全量页：搜索过滤出 A、C（B 被隐藏），把 X 拖到 A 下方——成功，清空搜索后 X 在 A 与 B 之间。
3. 文件管理器切到「名称 A→Z」：把某文件夹下的文件拖到根级节点下方；切回「自由排序」——它在根级最后。
4. 拖放后点撤销——复原。
5. 虚拟滚动页批量添加 10,000 条，拖一次：松开到新顺序可见 ≤ 1 秒（SC-004），数字记入 research R10。
