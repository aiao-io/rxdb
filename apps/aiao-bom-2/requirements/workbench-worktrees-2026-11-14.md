# 工作台布局与工作树版本管理

日期：2026-11-14，Asia/Shanghai。适用应用：`aiao-bom-2`。

## 行为

1. 新工作区默认显示全部 20 列，名称列固定；用户手动保存的列偏好继续生效。
2. 列配置中的排序字段、排序方向保留，底部控件之间增加间距。
3. “BOM 工作台”标题与操作保持单行，删除标题副文本。
4. 横向滚动条固定在表格面板底部，少量结果不会把滚动条带到数据行下方；与 Canvas 表格双向同步。
5. 工作台与版本面板取消文件导入、导出入口。
6. 工作草稿采用本地分支、持久工作树、提交说明、HEAD 和父提交链管理；版本面板支持比较父版本和恢复历史内容。

## 数据来源

- 直接复用 `@aiao/rxdb-plugin-history` 与 `@aiao/rxdb-plugin-working-tree`，不修改公共插件。
- 每个数据集使用独立 wa-sqlite 库 `aiao-bom-2-worktrees-<encoded-datasetId>`，持久化于 IndexedDB VFS。
- 每个工作分支对应真实 RxDB branch 和持久可写 checkout。挂载后通过当前适配器事务读写草稿文档。
- 自动保存、挂载、提交和恢复串行执行。提交和恢复携带分支激活代际、HEAD revision、工作树 revision，冲突直接报告。
- 提交身份、父节点、时间及内容以插件记录为准。一次提交包含多次编辑时，展示和恢复最后写入的完整草稿。
- 原 `aiao-bom-2-workspace-v1` 保留视图、分支目录和快照比较缓存；旧草稿只在目标工作树为空时迁入。
- 恢复保留 HEAD 和后续历史，历史内容同时写回业务文档并成为未提交改动；必须先提交当前改动，再恢复历史版本。
- 切换分支前等待自动保存，切换后保存活动分支标记；索引缓存包含分支身份，避免相同修订号的分支互相污染。

这里采用 Git 的分支、提交和 worktree 工作方式。数据保存在浏览器的 RxDB 中，不会生成文件系统 Git 仓库或推送 GitHub。

## 回归范围

- 恢复历史用量后 HEAD 不动、历史不删、工作树变脏。
- 连续多次编辑后，提交记录取最终值。
- 两条分支分别保存不同用量，切换与刷新后数据、活动分支和历史保持一致。
- 保存未完成时不能提前挂载其他工作树进行提交。
- 插件拒绝提交或恢复时报告错误，后续队列仍可继续执行。
- 新旧工作区的列配置、底部滚动条、窄屏版本面板及无障碍检查。

## 验证结果

- 22 个测试文件、116 个单元 / 组件测试通过；新增数据库桥接的 9 个测试在最终 lint 修正后单独复跑通过。
- 完整端到端套件 59 项通过，单 worker、零重试，包含 Chromium、Firefox、WebKit、50k / 100k 数据、真实 3D 联动及领域路由。
- 另补 1 项布局专项并通过：默认勾选全部 20 列、排序下拉框间距、标题无副文本、少量结果的底部滚动条及双向滚动同步。
- 应用与 E2E 的 lint、typecheck，以及应用 spec-typecheck 全部通过；ESLint 零警告。
- 生产构建通过。构建仍报告已有的模型面板 Angular 模板提示及第三方 CommonJS 提示。

| 指标       | 覆盖率 | 门槛 |
| ---------- | -----: | ---: |
| Statements | 91.50% |  80% |
| Branches   | 84.67% |  80% |
| Functions  | 90.64% |  80% |
| Lines      | 95.22% |  80% |

验证均经 Nx 执行：

```bash
NX_NO_CLOUD=true pnpm nx run aiao-bom-2:test --run --coverage
NX_NO_CLOUD=true pnpm nx run-many -p aiao-bom-2,aiao-bom-2-e2e -t lint,typecheck,spec-typecheck --parallel=2
NX_NO_CLOUD=true pnpm nx run aiao-bom-2-e2e:e2e
NX_NO_CLOUD=true pnpm nx run aiao-bom-2-e2e:e2e --args='--project=chromium src/workspace.spec.ts -g 默认全部列'
```
