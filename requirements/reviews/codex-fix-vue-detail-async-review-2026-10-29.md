# codex/fix-vue-detail-async 相对 origin/main 的深度评审

评审日期：2026-10-29。

## 结论

🟡 需要修复后再合并。确认 **2 条 P2 新回归**，没有发现 P0 / P1：

| 编号 | 级别 | 问题                                             | 用户影响                   |
| ---- | ---- | ------------------------------------------------ | -------------------------- |
| F-01 | P2   | 编辑保存完成时清空了提交之后的新输入             | 独立表单中的未提交内容丢失 |
| F-02 | P2   | 等待实体时把取消按钮一起隐藏，查询失败后无法恢复 | 独立详情页失去取消返回入口 |

两条都用相同操作对照了目标分支与 `origin/main` 的源组件：主线通过，目标分支失败。另有一项委托创建的预填值缺口，底层问题在主线已存在，单列说明，不计入新增回归。

## 范围与方法

- 基线：`origin/main`，`ade2da5f352b4fb5b403abdc396eaf15d715c809`。
- 目标：`codex/fix-vue-detail-async`，`8da92bb8e616a0f42d81451397d85f3403868379`。
- 已执行 `git fetch origin main codex/fix-vue-detail-async`；评审期间两个远端引用与上述快照一致。
- 使用 `git diff origin/main...8da92bb8`，共 **6 个文件，新增 783 行、删除 36 行**；基线是目标的祖先，三点与两点比较的文件内容一致。
- 逐行检查全部差异，并追踪 `EntityForm`、`EntityDialog`、实际 Vue 路由页、数据库实体缓存和 Angular / React 对应实现。
- 已合入 `origin/main` 的跨 Tab 查询修复不在本报告范围内。

| 变更文件                                                                                                               | 检查内容与结论                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [`EntityDetail.vue`](../../packages/rxdb-model-vue/src/entity-detail/EntityDetail.vue)                                 | 响应式数据库、草稿实例化与归属、编辑查询、输入覆盖层、保存代次、取消卸载、关系列表重建；发现 F-01 / F-02     |
| [`entity-detail.async.spec.ts`](../../packages/rxdb-model-vue/src/__tests__/entity-detail/entity-detail.async.spec.ts) | 29 个参数展开后的用例；覆盖 Promise / 工厂 / Ref、实际保存、等待时输入、换库、卸载与 A→B→A；缺少下述两类反例 |
| [`rxdb-vue.ts`](../../packages/rxdb-vue/src/rxdb-vue.ts)                                                               | `injectRxDBRef(quiet?)` 的类型、默认行为、隔离注入器与可选注入语义；未发现新增缺陷                           |
| [`rxdb-vue.spec.ts`](../../packages/rxdb-vue/src/__tests__/rxdb-vue.spec.ts)                                           | 新用例验证静默读取、迟到就绪、无 provider；与既有默认告警及隔离测试共同检查                                  |
| [`rxdb-vue/README.md`](../../packages/rxdb-vue/README.md)                                                              | `injectRxDBRef(true)` 的文档与实现一致                                                                       |
| [`reviews/README.md`](README.md)                                                                                       | 修复说明与代码和现有回归核对；不能据此推导所有保存及失败状态均已覆盖                                         |

## F-01 · [P2] 保存成功只应清理属于该次提交的编辑

**位置：** [`EntityDetail.onFormSubmitted()`，370–374 行](https://github.com/aiao-io/rxdb/blob/8da92bb8e616a0f42d81451397d85f3403868379/packages/rxdb-model-vue/src/entity-detail/EntityDetail.vue#L370)，关联 `onFieldChanged()` 与 `formDataValue`。

```ts
.then(() => {
  if (!isCurrent()) return;
  editFormChanges.value = {};
```

`onFieldChanged()` 每次输入都把字段写入 `editFormChanges`，但不会改变 `editGeneration`。因此，同一数据库、同一实体中发生的新输入，仍会被旧保存的 `isCurrent()` 判为当前操作；旧保存成功后清空整个覆盖层。`formDataValue` 随之变化，[`EntityForm` 监听 `props.data` 的 watcher](../../packages/rxdb-model-vue/src/entity-form/EntityForm.vue#L55) 会整体重置内部表单，新输入被已提交的值替换。

**复现：**

1. 在没有 `ENTITY_DIALOG_CONTEXT`、保存后继续保留组件的独立表单中，编辑一条已存在的记录。
2. 将标题改为 A 并提交。保存 Promise 尚未完成时，将输入框改为 B，不再次提交。
3. 让第一次保存成功，等待 Vue 更新。

| 对照对象             | 数据库标题 | 保存完成后的输入框    |
| -------------------- | ---------- | --------------------- |
| `origin/main` 源组件 | A          | B，保留尚未提交的修改 |
| 目标分支源组件       | A          | **A，B 被覆盖**       |

对照使用真实 `entity.save()` 写入仓库，只在其外层延迟 Promise 返回；不是用一个不落库的假保存推断结果。两端都没有对话框关闭或路由卸载，因此隔离出了表单重置本身。组件明确支持这种独立用法；会在成功事件后立即卸载组件的宿主，另有自己的导航行为。

**建议：** 提交时记录编辑快照，成功后只移除仍属于该快照、期间未被再次修改的字段，保留后续输入。不能仅靠数据库 / 实体身份判断一份编辑是否属于本次提交。补一条真实保存、保存期间继续修改同一字段的独立表单回归，并验证下一次提交能把 B 落库。

## F-02 · [P2] 等待和加载失败时仍应允许取消

**位置：** [`EntityDetail` 的 `show-actions` 绑定，562 行](https://github.com/aiao-io/rxdb/blob/8da92bb8e616a0f42d81451397d85f3403868379/packages/rxdb-model-vue/src/entity-detail/EntityDetail.vue#L562)，关联 `isEditPending`（220–222 行）及编辑查询的错误回调（205–206 行）。

```vue
:show-actions="!isCreateMode && !isEditPending"
```

`showActions` 控制 [`EntityForm` 的整个操作栏](../../packages/rxdb-model-vue/src/entity-form/EntityForm.vue#L573)，其中同时包含保存和取消。本次为阻止实体未就绪时提前提交，把两者一起隐藏了。`isEditPending` 又只用“存在 provider、有 entityId、尚无实例”判断等待，没有终止失败状态；`get()` 报错后只调用 `handleError()` 打印日志，实例仍为空，操作栏不会恢复。

裸用的 [`EntityDialog.isInDialog`](../../packages/rxdb-model-vue/src/entity-dialog/EntityDialog.vue) 为假，不渲染标题栏关闭按钮。实际 [`EntityDetailPage.onCancelled()`](../../apps/dev-rxdb-vue/src/pages/entities/EntityDetailPage.vue) 正是通过 `formCancelled` 返回列表，因此这是可达的用户路径。

**复现：**

1. 连接真实的测试用 InMemory RxDB，独立挂载编辑详情，不提供对话框 context。
2. 传入有效实体类型及不存在的 `entityId = 'missing'`。
3. 让真实 `Repository.get()` 完成；它报 `Entity with id missing not found`，不 mock 仓库查询。

| 对照对象             | 查询结果         | 取消按钮                       |
| -------------------- | ---------------- | ------------------------------ |
| `origin/main` 源组件 | 同样报不存在错误 | 存在，可以触发 `formCancelled` |
| 目标分支源组件       | 同样报不存在错误 | **不存在；按钮列表为空**       |

另用尚未就绪的数据库 Ref 做了对照：目标分支在正常等待期间也没有取消按钮。没有可见加载错误面板是既有缺口；**本次新增回归是取消入口被隐藏**，失败后该入口无法恢复。

**建议：** 只阻止保存，始终保留取消。将“加载中 / 已就绪 / 失败”分开处理，在失败时显示原因并允许重试。补未就绪 Ref、延迟实体查询、真实不存在记录三种独立详情用例，分别断言保存不可提前执行、取消仍可操作。

## C-01 · 已有缺口：无草稿创建表单的预填展示与提交不一致

新增的 [`formDataValue`](../../packages/rxdb-model-vue/src/entity-detail/EntityDetail.vue#L267) 在没有草稿时合并 `props.formData` 与用户修改，因此 `delegateSave: true` 的创建表单现在能显示预填值。但 `onSave()` 仍只读取 `draftFormData` 和 `fixedFormData`，没有读取显示层合并的初始值。

复现：传入 `formData: { title: '预填标题', count: 23 }`，开启 `delegateSave`。不改标题直接保存，界面有值却报标题必填；只修改标题后保存，提交事件遗漏未动过的 `count`。现有“无 provider 的委托表单”测试没有传入初始值，覆盖不到这条路径。

`origin/main` 的委托保存原本也遗漏初始值，只是此前界面也不展示这些值。因此，这里不把旧保存缺陷包装成新的数据丢失回归；本次新增的展示路径暴露了提交数据与展示数据分离的问题。建议创建表单统一使用一份有效数据做展示、校验、关系 tab 校验与提交，并补一条带未修改预填字段的委托保存测试。

## 生命周期、兼容性与三端复核

- 数据库引用变化时先通过 `draftDatabase` 清理原库草稿，避免把清理操作打到新库；`relationListKey` 强制重新装配持有数据库快照的子列表，这两处处理正确。
- 查询的 `onCleanup` 取消订阅并推进代次，旧保存回调也检查数据库、实体及代次。换库、卸载、数据库或实体 A→B→A 的隔离已有回归；F-01 是同一视图内的后续编辑，不被这些条件覆盖。
- 真正更换 metadata 后保留原草稿等行为在基线已存在，不计作本分支新增问题。
- 已核对三端 `src/index.ts` 及其实际再导出的 provider / 详情入口：共享 `RxDBSource`、可选数据库消费及详情输入没有因本次变更缺失；Vue 的 Ref 和注入警告控制属于框架自身语义。`quiet?: boolean` 是可选参数，原有零参数调用和返回类型保持兼容。
- Angular 根 provider 在应用初始化前等待异步源；React 的 context 消费会响应就绪；本次让 Vue 详情改读响应式引用，修复方向正确。这里是源码与 API 对比，没有把 Vue 的测试结果称为三端运行验收。

## 验证结果

使用 Node **26.12.0**、pnpm **12.15.0**，通过 Nx 运行；设置 `NX_DAEMON=false`、`NX_NO_CLOUD=true`，禁用远端缓存。

```bash
pnpm nx run rxdb-model-vue:test --run --skipRemoteCache --output-style=static
pnpm nx run rxdb-vue:test --run --skipRemoteCache --output-style=static
pnpm nx run-many --targets=lint,typecheck,build --projects=rxdb-model-vue,rxdb-vue --parallel=1 --skipRemoteCache --outputStyle=static
```

| 验证                                      | 结果                                                      |
| ----------------------------------------- | --------------------------------------------------------- |
| `rxdb-model-vue:test`                     | 17 个文件，367 / 367 通过，包含详情既有 20 条与新增 29 条 |
| `rxdb-vue:test`                           | 12 个文件，228 / 228 通过                                 |
| 两包 lint / typecheck / build             | 全部通过；Nx 共处理 35 个任务，含依赖；没有 ESLint 告警   |
| `git diff --check origin/main...8da92bb8` | 通过                                                      |
| F-01 定向基线对照                         | 相同断言：目标失败 1 条、主线通过 1 条                    |
| F-02 真实查询失败基线对照                 | 相同断言：目标失败 1 条、主线通过 1 条                    |
| F-02 未就绪 Ref 基线对照                  | 相同断言：目标失败 1 条、主线通过 1 条                    |

全包测试当次的覆盖率如下；临时对照实验另行运行，不混入这些统计：

| 包               | Statements | Branches | Functions | Lines  | 阈值                   |
| ---------------- | ---------- | -------- | --------- | ------ | ---------------------- |
| `rxdb-model-vue` | 91.28%     | 87.09%   | 85.22%    | 92.46% | 四项均超过 80%         |
| `rxdb-vue`       | 98.60%     | 93.43%   | 99.01%    | 98.78% | 四项均超过核心绑定 90% |

F-01 的关键断言是“第一次保存后数据库仍为 A，输入框仍为 B”；F-02 的关键断言是“真实查询已报不存在，页面按钮仍包含取消”。对照组件均从基线 `EntityDetail.vue` 导出，保留其同目录相对依赖，用相同宿主和数据运行。临时对照组件与 spec 已移出仓库，本次提交只包含报告和索引。

全包测试及依赖有本地缓存命中，两包的测试命令均实际执行。没有运行整个仓库的 affected 全量门禁、浏览器 E2E 或三端对拍；本报告的运行证据是两个 Vue 包及其依赖的校验、真实 InMemory RxDB 和组件对照实验。

## 合入前待办

- [ ] F-01：保留保存期间产生的新编辑，补同字段续写后再次保存的回归。
- [ ] F-02：保留等待 / 失败状态的取消入口，补独立详情用例。
- [ ] 复跑两包测试及 lint / typecheck / build；由合入流程执行全量门禁。
- [ ] 明确 C-01 的处理范围；若同时修复，增加预填值与实际提交内容一致的委托保存用例。
