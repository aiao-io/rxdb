# US-310 命名工作上下文（git worktree 能力）—— 执行任务单

> 状态：待评审——§7 第 1～7 步与 `pnpm test-all` 全量门禁均已完成；§6.3 的 speckit 配套文档按原计划后补。前置：US-309 改名已完成（commit `ffb66c62`，分支 `claude/worktree-rename-contexts`）。
> 本文档是自包含的执行清单：背景、设计、任务、验证一步不缺，按序执行即可。
> **§0 的评审修订优先于下文**；下文相应位置已同步改写。

## 0. 评审修订（2026-10-13，开工前对照代码复核）

| #   | 原写法                                                       | 修订                                                                                                                                         | 依据                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | UI 点行 `switchWorktree(id, { requireClean: true })`，脏则拒 | **git 口径自由切换**：worktree 之间切换不带 `requireClean`，未提交改动按分支隔离保留；只有 remove 拒脏。e2e ⑥⑩ 随之改写                      | owner 2026-10-13 拍板；与「创建即切换」同口径，否则 create 与 switch 两条离开路径规则相反                                                                                                                                    |
| R2  | 0005 复用 `assertSingleActiveBranch`，0/多行抛               | 读 active 行（不带 limit）：1 → 钉主行；**0 → 不落行**；>1 → 抛 `AmbiguousActiveBranchError`                                                 | 迁移对所有既有库都跑，零 active 是未启用能力老库的合法态（`commit-error-codes.ts` `no_active_branch`：迁移期不抛；`bootstrapExisting` 只在已启用时断言）；照原写法升级即拒连                                                 |
| R3  | §5.1 #7 并发、#8 唯一约束放核心包单测                        | 挪进 **commit** conformance 套件 §2.8（6 真后端），并补全流程、WIP 隔离、requireClean 透传、删分支连带、次序共 8 条                          | 核心包单测底座 `createCommitGraphProbe` 不执行 SQL、不校验唯一约束、事务不串行；核心包也不能反依赖适配器（成环）。不放 capture 套件：它的库为 QueryCache 实体声明了不注册的远端适配器名，`createBranch()` 会去远端查重而失败 |
| R4  | `branchId` 属性级 `unique: true`（同 restore-session）       | `indexes: [{ name: 'idx_worktree_branch', properties: ['branchId'], unique: true }]`                                                         | `branchId` 是 MANY_TO_ONE 生成的外键列，不能再声明同名属性；`WorkingTreeEntry.idx_working_tree_entry_identity` 同款                                                                                                          |
| R5  | 核心命令体 `src/worktree/worktree-commands.ts`               | `src/worktree/worktree-command.ts`                                                                                                           | 与绑定层 `working-tree-commands.ts` 只差一词；单数与 `commit-command.ts` / `discard-command.ts` 同名法                                                                                                                       |
| R6  | `EPIC_006_SYSTEM_ENTITIES` 绊线加 `Worktree`                 | 另立 `EPIC_010_SYSTEM_ENTITIES`，三条断言遍历两份                                                                                            | `Worktree` 属 epic-010，塞进 epic-006 清单名字就撒谎                                                                                                                                                                         |
| R7  | 列表按 `createdAt` 升序                                      | 按 `(createdAt, branchId)` 升序                                                                                                              | SQLite `CURRENT_TIMESTAMP` 只到秒，同秒创建并列；`branchId` 唯一，次序确定                                                                                                                                                   |
| R8  | 未写 createWorktree 第二阶段失败的处置                       | 行保留、原错上抛（可 `switchWorktree` 重试），不做补偿删除                                                                                   | 补偿本身可能失败并盖掉原错                                                                                                                                                                                                   |
| R9  | facade 直接取 `this.#rxdb.versionManager`                    | 门禁之后、写行之前断言 history 插件在场，缺则抛明确 `RxDBError`                                                                              | 未装 history 插件时是裸 TypeError，且 create 会先落一行孤行                                                                                                                                                                  |
| R10 | `Worktree` 带 `updatedAt`                                    | 只留 `createdAt`                                                                                                                             | 行创建后不再更新（无改名操作），`updatedAt` 恒等于 `createdAt`；不可变行只带 `createdAt` 与 `Commit` 同口径                                                                                                                  |
| R11 | —                                                            | US-309 全局替换把注释里的 `working-tree/` 目录指针改成了 `worktree/`（目录本身没改名），本 story 新建 `src/worktree/` 后会变成指错，一并改回 | `grep -rn '\`worktree/' packages/rxdb-plugin-worktree/src`                                                                                                                                                                   |
| R12 | `facade-capability-gate.spec.ts` 清单 12→16                  | 无需改：测试枚举原型成员，新成员自动纳管                                                                                                     | 该 spec 的 `gatedMemberNames()`                                                                                                                                                                                              |

## 1. 背景与已确认决策

用户诉求：Angular working-tree 页面没有「创建 worktree」的入口——要有 git worktree 的能力。
结论：现模型的 working tree = git 术语的「工作区」（每分支一份脏状态，`WorkingTreeState` 主键 = branchId），
没有 worktree 实体；业务表同一时刻只装一个分支的内容（切换即物化替换），因此 **worktree 在本模型 =
「钉在分支上的命名工作上下文」**，单库同一时刻一个 checkout（用户已接受此语义）。

已确认决策（2026-10-13）：

1. 包名 + 公开符号全改 → 已随 US-309 完成。
2. worktree 语义：create / list / switch / remove，1:1 钉住分支，WIP 沿用按分支隔离的 `WorkingTreeState`，创建即切换。
3. 能力水位线冻结：`WORKING_TREE_CAPABILITY = 'workingTree'` 与版本 1 不动；本 story 不碰。
4. 旧包 npm 处置：无 deprecate（未发布过），迁移文档指路 → 已随 US-309 完成。

## 2. 数据模型（核心包 `packages/rxdb-plugin-worktree`）

新目录 `src/worktree/`（与 WIP 捕获域 `src/working-tree/` 平行，不混文件）。

### 2.1 实体 `Worktree`（表 `rxdb_worktree`，第 11 张系统表）

写法参照 `src/working-tree/working-tree-state.entity.ts`：

- `id` PK（uuid）；`branchId` **非空唯一**（1:1 钉住；`indexes: [{ properties: ['branchId'], unique: true }]`，见 R4）
- `label` nullable（null 时 UI 回退显示 branchId）；`createdAt`（`CURRENT_TIMESTAMP`，见 R10）
- MANY_TO_ONE → `RxDBBranch`（字符串 mappedProperty，不声明反向属性——working-tree-state.entity.ts 同款，核心零改动）
- `namespace: 'rxdb'` + `SYSTEM_ENTITY_PERMISSIONS` → 系统实体天然不进 sync scope，无 sync 改动

### 2.2 迁移 `0005-worktrees`（照 `src/migrations/0004-working-tree-commits.ts` 工厂形态）

- **迁移名是持久化元数据，合入即钉死**，down() 拒绝
- 建表走 `RxDBSystemContribution.entities`（plugin.ts 的 `WORKTREE_SYSTEM_ENTITIES` 追加 `Worktree`，文件头「10 张」→ 11）；
  迁移本身只做一件事：为 `rxdb_branch.activated` 行补**主 worktree 行**（1 行 → 钉它；0 行 → 不落行；
  多行 → 抛 `AmbiguousActiveBranchError`，见 R2）
- `createInitialRows` 为新库写主行（新库 branchIds 恰一个 'main'）；`createMigrations` 追加在 0004 之后
- 主 worktree **显式落行**，不做「合成 active 行」视图（单一真相原则，同 activation-state.ts:14-17 裁决）；
  active 勾选复用 `rxdb_branch.activated`

### 2.3 命令语义

| 命令                               | 语义                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createWorktree(branchId, label?)` | 唯一判据 = branchId 是否已有行。已有 → `WorktreeBranchPinnedError`（git "already checked out"）；= active 无行分支 → **允许**（单 checkout 模型无第二槽位）；分支不存在 → `WorktreeBranchNotFoundError`；`label === ''` → `WorktreeLabelError`（无 fallback 铁律）。**创建即切换**。两阶段：runEnabled 单事务插行（并发由唯一索引后盾，败者炸响亮错误），事务提交后调 `versionManager.switchBranch`——**绝不在事务内调（嵌套事务死锁）** |
| `listWorktrees()`                  | 全行按 `(createdAt, branchId)` 升序（R7），含 `active` 布尔（与 rxdb_branch.activated 同口径）；零行合法                                                                                                                                                                                                                                                                                                                                |
| `switchWorktree(id, options?)`     | runEnabled 单事务门禁 + 读行（缺 → `WorktreeNotFoundError`），提交后委托 `versionManager.switchBranch(row.branchId, options)`；第二参透传 `WorktreeSwitchBranchOptions`（requireClean / expectedActivationRevision，脏拒走 `WorktreeDirtyError` 原类）。facade 现取 `this.#rxdb.versionManager`（连接纪元挂载，不能构造时缓存）。切已 active 分支 = switchBranch 同分支 no-op 早退                                                      |
| `removeWorktree(id)`               | 单事务：门禁 → 读行 → active 行拒（`WorktreeActiveError`，git 同款）→ 读 `WorkingTreeState.entryCount`，>0 复用 `WorktreeDirtyError` 原类原码 → 删行。分支/WIP/提交图不动；删后分支回到隐式未钉住，可再次 createWorktree                                                                                                                                                                                                                |

- `removeBranch` 时 CASCADE 自动带走 worktree 行，并在 `removeBranchCommitRows` 补显式删（与 WorkingTreeState 双保险同款）
- **credentials 零改动**：worktree WIP = 分支 WIP，三个捕获位仍锚定 active 分支

## 3. API 面

### 3.1 核心 `WorktreeManager`（`src/working-tree/working-tree-facade.ts`，改名后类名）

新增 4 方法全部经 `runEnabled`：
`listWorktrees(): Promise<readonly WorktreeInfo[]>`、
`createWorktree(branchId: string, label?: string): Promise<WorktreeInfo>`、
`switchWorktree(id: string, options?: WorktreeSwitchBranchOptions): Promise<void>`、
`removeWorktree(id: string): Promise<void>`；
`WorktreeInfo = { id, branchId, label, active, createdAt }`（R10）。

新错误文件 `src/worktree/worktree-errors.ts`（RxDBError 子类 + readonly code + 判别字段 + name + setPrototypeOf，照 `WorktreeDirtyError` 写法）：
`WorktreeBranchPinnedError`(worktree_branch_pinned) / `WorktreeBranchNotFoundError`(worktree_branch_not_found) /
`WorktreeNotFoundError`(worktree_not_found) / `WorktreeActiveError`(worktree_active) / `WorktreeLabelError`(worktree_label_invalid)。
全部新导出补 TSDoc。

### 3.2 三端 `useWorktree()`（三框架对称，`tri-framework-check` 复核）

- `async-state.ts` 的 `WorktreeAsyncStates` 12 → 16 格：`listWorktreesState`(Query，empty=零行) / `createWorktreeState` /
  `switchWorktreeState` / `removeWorktreeState`（Command）；判空谓词收口核心
- `createWorktreeCommands` 新增 4 命令：create/switch 成功后 `refreshStatus()` + `refreshWorktrees()`
  （复用 working-tree-commands.ts:289-299 的 switchBranch+refreshStatus 链路）
- React 交叉类型零结构改动；Angular/Vue 各补 4 格状态声明 + 4 方法 + computed 接线
- 三端 `use-worktree.ts` 与 spec 已随 US-309 改名

## 4. demo UI（三端对称）

新组件三端同名 worktree-menu（全面仿 Angular 的 `branch-menu.component.ts`：内联 absolute 下拉 + fixed 背板 +
筛选 + 创建弹层 + a11y 走查，`left-0` 对齐）：

- 触发按钮：工具栏 repo 选择器与分支菜单之间，`data-testid="wt-worktree-menu"`，显示当前 worktree 的 label（回退 branchId）+ chevron，`aria-expanded`/`aria-haspopup`
- 下拉：`role=menu` `data-testid="wt-worktree-menu-popup"`；顶部筛选框（`aria-label="Filter worktrees"`）；
  行 `role=menuitem` `data-testid="wt-worktree-item"`：Check（active）/ label + branchId 小字 + 右端**兄弟布局** remove
  按钮（嵌套 button 非法 HTML；active 行 `disabled` + `aria-disabled`，`data-testid="wt-worktree-remove"`）
- 点行 = `switchWorktree(id)`（**不带** `requireClean`，R1：未提交改动留在原 worktree，切回原样还在）
- 创建弹层 `role=dialog` `data-testid="wt-worktree-create-popover"` 两段式：**Existing branch**（分支集 ∩ 未钉住者，
  用 listWorktrees 求差）或 **New branch**（`git worktree add -b` 同款：页面组合 `createBranch(name)` +
  `createWorktree(name)`）+ 可选 label（`data-testid="wt-worktree-label"`）；校验与建库调用由页面做
- 页面接线：init 与各命令后刷新 listWorktrees；sr-only 仪器条加 `data-testid="wt-worktrees"`（phase/count/activeId）

## 5. 测试清单（TDD 先红后绿）

### 5.1 核心单测（新目录 `src/__tests__/worktree/`）

1. `worktree-entity.spec.ts`——第 11 表注册、log:false、SYSTEM_ENTITY_PERMISSIONS、branchId 唯一索引存在
2. `worktrees-migration.spec.ts`——新库初始主行钉 'main'；既有库升级 0005 恰跑一次、主行钉 activated 分支；
   无 active 抛；0004→0005 顺序
3. `worktree-create.spec.ts`——钉 + 自动切换；重复钉 → PinnedError；active 无行分支允许；分支不存在；空 label 拒；
   未启用库 → `WorktreeCapabilityDisabledError` 且零写入
4. `worktree-list.spec.ts`——active 标记正确；空表 `[]`；顺序稳定
5. `worktree-switch.spec.ts`——切换生效（status 换分支）；requireClean 透传（脏 → DirtyError）；
   expectedActivationRevision 透传（过期 → StaleActiveBranchError）；行不存在；切已 active → no-op 成功；
   未启用库门禁拒且未发生切换；目标损坏原错上抛且行完好
6. `worktree-remove.spec.ts`——移除非 active 行；active → ActiveError；脏 → DirtyError；删后可重钉；
   分支/WIP/提交图不动；未启用库门禁
7. ~~核心单测~~ → commit conformance §2.8：Promise.all 并发同分支 createWorktree → 恰一胜出（R3）
8. ~~核心单测~~ → commit conformance §2.8：裸仓库双插同 branchId → 约束抛错（R3）
9. `capability-identity.spec.ts` 增补——旧包名行 + 新包名行共存放行（守卫只认能力名）
10. `facade-capability-gate.spec.ts`——无需改，原型枚举自动纳管（R12）
11. `system-entity-registration.spec.ts`——11 张表
12. `testing/capture.suite.ts`——另立 `EPIC_010_SYSTEM_ENTITIES = [Worktree]`（R6），补新表三断言（登记、log false、不引用 rxdb_change）

Conformance 不扩第三套：7、8 两条（连同真后端上的全流程用例）加进现有 commit 套件 §2.8。

### 5.2 三端绑定单测

`use-worktree.spec.ts`（Angular）/`.tsx`（React）/`.ts`（Vue）：4 新格初值 idle；listWorktrees 的 empty/success 相位；
create/switch/remove 命令相位 + 成功后重读 status 与 list；错误原样上抛不吞。

### 5.3 e2e / a11y（三端各一份 `worktree.spec.ts` + `worktree.a11y.spec.ts` 增补）

① 选择器显示当前分支主行；② 从已有分支创建 → 行出现、勾选移动、sr-only wt-status-branch 更新；③ 带 label 创建 →
label 显示；④ 新建分支并钉住（-b 同款）；⑤ 重复钉 → toast；⑥ 带未提交改动切到另一个 worktree → 切换成功，
Changes/History 换成目标分支数据；⑦ 移除非 active 行 → 行消失、分支仍在分支菜单；⑧ active 行 remove 按钮 disabled；
⑨ 非 active 且有未提交改动的 worktree 移除被拒 → toast；⑩ WIP 隔离往返（A 改 → 切 B → B 改 → 切回 A：A 的改动在、
B 的不在 → 切回 B：B 的改动在）。
a11y：纯 Tab 走查、Escape（document 级）、背板点击关闭、role/aria 断言、筛空文案、remove 可访问名。

### 5.4 审计门禁

- api-baseline 4 个 `rxdb-plugin-worktree*.json` 自更新（`pnpm audit:api-surface:update`，**首跑 --check 红属正常**）
- `pnpm audit:coverage:update`（新代码覆盖率：核心 ≥ 90%）
- package-graph / package-knowledge 重生成（`pnpm audit:package-graph --update`）
- `audit:suite-callsites` / `audit:callsite-drift` 保持绿

## 6. 需求文档（仓内惯例）

1. 新 epic：`requirements/epics/epic-010-worktree-contexts.md`（epic-009 已被 BOM 占用；status: In Progress）
2. `requirements/stories/collaboration/US-310-named-worktrees.md`（挂 epic-010，story.template.md 的 AC 表格式，
   AC 以上文 §5 清单为素材）
3. 本文档所在目录补 `spec.md` / `data-model.md` / `research.md`（git worktree 语义对照）/ `quickstart.md` /
   `contracts/`（core-api.md 增补 + tri-framework-api.md 增补）——speckit 惯例，可后补
4. status-overview.md 登记 US-310

## 7. 执行顺序与验证

1. 文档（§6 的 1、2）→ 2. 红：§5.1 失败测试 → 3. 绿：`worktree.entity.ts` → `0005-worktrees.ts` + plugin.ts 装配 +
   capture 绊线更新 → `worktree-errors.ts` → `worktree-commands.ts` → facade 4 方法 → 导出接线
   → 4. 三端绑定 + 单测 + `tri-framework-check` → 5. demo 三端 UI + e2e + a11y → 6. 基线/审计收尾 → 7. 文档收尾

每步验证（nx 目标名按新项目名）：

```bash
pnpm nx run rxdb-plugin-worktree:lint && pnpm nx run rxdb-plugin-worktree:typecheck && pnpm nx test rxdb-plugin-worktree
pnpm nx test rxdb-plugin-worktree-angular   # 及 -react / -vue
pnpm nx run dev-rxdb-angular-e2e:e2e -- worktree.spec.ts   # 及 react / vue 同名 + a11y spec
pnpm audit:api-surface:update && pnpm audit:coverage:update && pnpm audit:package-graph --update
pnpm audit:suite-callsites && pnpm audit:callsite-drift
# 收尾：pnpm test-all（失败先单独复跑各 target）
```

## 8. 风险与注意

- **嵌套事务死锁**：switchWorktree/createWorktree 的两阶段边界写进 TSDoc + 专项测试用超时守护
- **0005 迁移名合入即钉死**；down() 拒绝
- **回退**：本 story 在迁移合入前回退无数据影响；合入后旧客户端开新库走能力守卫正常（能力名未变）
- **三框架对称**：单端缺失 = 未完成（铁律）；e2e 本地跑注意 worker 并行干扰，重 spec 用串行
- **pnpm 需 Node 26**：命令前 `export PATH="$HOME/.nvm/versions/node/v26.7.0/bin:$PATH"`

## 9. 文档收尾（story 完成时）

- `website/docs/plugins/rxdb-plugin-worktree/README.md` 整篇重写（worktree 能力章节）
- CHANGELOG Unreleased 加 feature 条目；release-plan 无新增口径
- capability-matrix / zh-glossary / roadmap 引用更新（如涉及）
