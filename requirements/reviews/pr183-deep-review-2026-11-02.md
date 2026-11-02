# PR #183 深度评审：Headless 实体 API

- 评审日期：2026-11-02。
- PR：<https://github.com/aiao-io/rxdb/pull/183>。
- 分支：`codex/us-403-headless`。
- 被评审 HEAD：`4f672cfe708d32627f22ae6343e660d22b33d6db`。
- 基线及 merge-base：`94e89be7dcd25575d2f9b5d560e1861fc645e78c`（评审时 `origin/main`）。
- 差异：69 个文件，5013 行新增、193 行删除；不把本报告提交计入实现基线。

## 结论

🔴 暂不建议合并。确认 7 个问题：1 P1、6 P2；8 条反例断言失败，另有 1 条边界对照通过。已有测试覆盖了 StrictMode、迟到成功、查询失效等路径，但漏掉 Activity 重显、迟到失败及初始化同步顺序。

评审覆盖六类控制器、三框架绑定与默认表单迁移、根入口和 `/headless` 导出、manifest 与 Vite/APF 构建配置、消费者探针、相关测试、API 基线及需求/网站差异。生成的 API 基线按源码和导出核对，未把生成文件当成独立行为证据。

US-403 已正确保持 In Progress。默认 QueryBuilder/List/Detail 尚未全部迁移、历史与手动排序接线、独立 UI 示例、仓外 tarball 安装、完整覆盖率与可访问性验收是故事已明确的剩余范围，不重复包装成新缺陷。发布依赖的严格类型隔离未完成，也不能由运行时导入探针证明。

## F-01 · P1 · React Activity 重显复用已销毁控制器，默认表单也受影响

**证据：**[controller-store.ts:22](../../packages/rxdb-model-react/src/controller-store.ts#L22) 在 effect 清理后的微任务中永久 `dispose()`，而 [controller-store.ts:35](../../packages/rxdb-model-react/src/controller-store.ts#L35) 将同一个 store 放在 `useState` 中；重显只重新 retain，不重新建立可用控制器。[默认 EntityForm:174](../../packages/rxdb-model-react/src/entity-form/entity-form.tsx#L174) 已改用该 hook。

**复现：**在 `<Activity mode="visible">` 内使用 `useEntityForm`，编辑草稿；切换为 hidden，等待一个微任务，再切回 visible。重显的同步 effect 调用 `setFields` 时抛出 `EntityFormController has been disposed`，表单无法恢复。定向测试对重显的 `not.toThrow()` 断言失败。

**根因与影响：**微任务只足以避开 StrictMode 的即时 effect 回放，无法区分真正卸载与 Activity 暂时隐藏。Activity 保留 state，同时清理并在重显时重建 effects；这里保留了控制器引用，却永久终结了它。共享 store 的所有 headless React hook 都存在相同生命周期问题；已有默认 EntityForm 从本 PR 起新增此回归。

**建议：**把可暂停/恢复的订阅和终态销毁分开，或在重建资源时从保留的领域状态恢复控制器；保持 hook 返回值、草稿与外部事件连接一致。不要只延长销毁定时器。

**回归：**visible→hidden→跨微任务→visible 后草稿、动作和订阅仍可用；同时保留 StrictMode 与最终卸载仅清理一次的用例。React 官方 [Activity 文档](https://react.dev/reference/react/Activity) 的 effect 清理与 state 保留语义已通过 Context7 核实。

## F-02 · P2 · 提交会清掉仍未修正的解析错误并提交旧值

**证据：**[EntityFormController.validate:231](../../packages/rxdb-model/src/entity-form/headless.ts#L231) 只校验最近合法的 `#data`，随即 `this.#errors = []`；[submit:247](../../packages/rxdb-model/src/entity-form/headless.ts#L247) 无条件走该方法。[网站约定:28](../../website/docs/entity-model/headless.md#L28) 明确承诺“错误修复前不能提交”。

**复现：**整数 `count` 初值为 1，`setField('count', 'invalid')` 后快照 `valid === false`；直接 `submit()`，实际返回 `valid: true, data: { count: 1 }`，错误消失。该反例已执行，预期拒绝提交的断言失败。

**根因与影响：**严格解析失败本来应保留最近合法值及未解决错误；重新校验合法存量值不能证明用户已修复输入。自定义控件显示非法输入时，提交动作会保存旧值，状态与用户输入不一致。

**建议：**提交和显式校验合并尚未解决的解析错误与字段约束错误；只在同字段合法输入、取消或有效宿主重置时清掉解析错误。保持默认组件已发布语义时，应明确处理默认展示与新 headless 契约的兼容边界。

**回归：**合法初值→非法输入→validate/submit 均保持拒绝；修改其他字段不解锁；修正原字段后才成功提交。

## F-03 · P2 · Angular/Vue 列表初始化把宿主 records 清空

**证据：**[Angular injectEntityList:130](../../packages/rxdb-model-angular/src/headless/bindings.ts#L130) 先 `setRecords`，后 `setPage`；[Vue useEntityList:87](../../packages/rxdb-model-vue/src/headless.ts#L87) 的 immediate watchers 也按此顺序初始化。[setPage:148](../../packages/rxdb-model/src/entity-list/headless.ts#L148) 无等值判断，始终调用 `#invalidatePending(true)` 清空记录。

**复现：**传入 `{ records: [record], page: 0, pageSize: 10 }`。Angular 首次 `detectChanges()` 后、Vue `mount()` 后，实际 `snapshot.records` 均为 `[]`，预期保留一条记录的两个定向测试均失败。React 同条件由构造器保留记录，未无条件回放分页。

**影响：**带受控分页的初始页面空白；没有 loader 的宿主不会自动补回这批记录。Angular 后续 options effect 还会重复执行该清空顺序。

**建议：**初始化时不要重放未改变的分页；统一先同步会失效旧页的查询/排序/分页，最后接收对应的新 records，并对语义相同输入幂等处理。

**回归：**三端同样的 records/page/pageSize 初态对拍；新增 Angular 只改能力或重传等值 options 时不清记录、不终止有效请求的用例。Vue“同批更新 page 和 records”的对照测试本轮通过，因此不声称该更新路径必然丢数据。

## F-04 · P2 · QueryTable 三端不跟随分页/排序输入变化

**证据：**[React useQueryTable:183](../../packages/rxdb-model-react/src/headless.ts#L183) 只同步 query、records、capabilities；[Vue useQueryTable:196](../../packages/rxdb-model-vue/src/headless.ts#L196) 与 [Angular injectQueryTable:200](../../packages/rxdb-model-angular/src/headless/bindings.ts#L200) 相同，均没有同步 page/pageSize/sorts。EntityList 三端的 sorts 也仅构造时读取。

**复现：**React 以 `{ page: 0, pageSize: 10, sorts: [{ field: 'title', sort: 'asc' }] }` 初始化，再 rerender 为 page 2、pageSize 20、desc。实际仍为 0/10/asc，定向断言失败。Angular/Vue 的同步代码逐项核对后确认相同缺口，未声称对这两个框架运行了同一分页反例。

**影响：**宿主分页器、排序控件已更新，`refresh()` 收到的仍是旧请求上下文；返回错误页或错误顺序。三个出口都有 API，并不等于响应式行为完整。

**建议：**明确构造专用选项与响应式输入合同；对公开响应式分页/排序补齐三端同步，并按查询/排序→分页→records 的次序统一处理，避免引入 F-03。

**回归：**三端更新 QueryTable 页码/页大小/排序，断言 snapshot 与 loader 上下文一致；EntityList 补排序输入用例。

## F-05 · P2 · 旧详情保存失败污染新会话错误面板

**证据：**[EntityDetailController.save:111](../../packages/rxdb-model/src/entity-detail/headless.ts#L111) 的成功分支检查 `session`，但 [catch:121](../../packages/rxdb-model/src/entity-detail/headless.ts#L121) 仅检查 disposed，随后无条件写入 `#error` 并发布 `saveFailed`。

**复现：**A 详情开始 pending 保存，close→`form.setData(B)`→open，然后 A 的保存 reject。旧 Promise 正常向原调用方抛错，但 B 的 `snapshot.error` 实际也变成 A 的错误；预期保持 null 的测试失败。

**影响：**切换记录、取消/重开或后续编辑后的新界面收到旧操作错误，与迟到成功已隔离的行为不一致。

**建议：**失败也按保存所属会话判断，原 Promise 保持 reject；只对仍属于该操作的界面更新错误和保存状态，不覆盖当前会话。

**回归：**旧保存 reject 分别发生在换输入、cancel、close/open、dispose 后；原调用方收到错误，当前会话不接收过期错误事件。

## F-06 · P2 · 刷新期间写入失败，公开 loading 永久停在 true

**证据：**[EntityListController.#beginMutation:379](../../packages/rxdb-model/src/entity-list/headless.ts#L379) 改内部 `#loading` 并使旧请求失效，却没有重建/发布 snapshot；[create:209](../../packages/rxdb-model/src/entity-list/headless.ts#L209) 的回调拒绝后直接退出，其他写入路径也有相同发布缺口。

**复现：**启动一个 pending `refresh()`，此时 snapshot.loading 为 true；调用 `create()`，`onCreate` 抛错；再让旧 refresh 完成。旧查询已因 requestId 变化被丢弃，没有任何路径发布 loading=false，最终公开快照仍为 true。定向测试失败。

**影响：**UI 持续显示加载中；如果按 loading 禁用刷新/写按钮，就无法通过正常操作恢复，虽然控制器内部早已停止加载。

**建议：**请求失效/写入开始导致的状态变化应同步发布；写入成败均收敛可观察状态，避免只修改内部字段。写入错误是否自动进入 snapshot.error 也应形成一致合同。

**回归：**刷新期间 create/update/remove 的同步抛错与异步 reject；旧 loader 成功和失败两种结束方式；均不得残留 loading。

## F-07 · P2 · config.initialQuery 仍与宿主共享，只读查询可绕过动作直接改变

**证据：**[QueryBuilderController 构造器:57](../../packages/rxdb-model/src/query-builder/services/headless.ts#L57) 克隆 fields、initialState、initialQuery，却直接透传 config；[QueryBuilderService:161](../../packages/rxdb-model/src/query-builder/services/query-builder.service.ts#L161) 把 `config.initialQuery` 本身作为内部 rootGroup。

**复现：**提供有一条规则的 `root`，创建 `createQueryBuilderController({ readonly: true, config: { initialQuery: root } })`；宿主执行 `root.rules.length = 0`。不调用任何写动作，`toRxDBQuery().rules` 已变为空，预期仍有一条规则的定向断言失败。同时缓存 snapshot 仍保留旧规则，两个公开读取口径不一致。

**根因与影响：**漏掉了第二个合法初始查询入口。新控制器声称隔离领域状态，且拒绝 readonly 编辑动作，但配置引用仍能静默改变其查询；这属于状态封装问题，不是授权安全边界。

**建议：**隔离 config 内参与状态和配置判定的结构化数据；明确可保留引用的服务对象，避免盲目克隆注入的 registry/service 实例。

**回归：**同时覆盖 initialQuery、initialState、config.initialQuery 三条入口；宿主原地修改后，snapshot、validate、toRxDBQuery 均保持一致。

## 三框架核查

按 `tri-framework-check` 对根入口和 `/headless` 的实际 export 核对，而非按文件名判断。

| 能力 | Angular | React | Vue | 结果 |
| --- | --- | --- | --- | --- |
| 表单 | injectEntityForm | useEntityForm | useEntityForm | 入口及 Headless 别名齐全 |
| 查询构建器 | injectQueryBuilder | useQueryBuilder | useQueryBuilder | 入口齐全，复用核心控制器 |
| 列表 | injectEntityList | useEntityList | useEntityList | 入口齐全，初始化有 F-03，排序有 F-04 |
| 详情 | injectEntityDetail | useEntityDetail | useEntityDetail | 入口齐全，使用核心状态机 |
| 弹窗 | injectEntityDialog | useEntityDialog | useEntityDialog | 入口齐全 |
| 查询表格 | injectQueryTable | useQueryTable | useQueryTable | 入口齐全，响应式输入有 F-04 |

框架命名、Signal / 普通快照 / ShallowRef 返回形式属于适配差异。三端绑定都引用同一核心契约，没有发现某一端独有的共享类型透传缺失；运行时生命周期与初始化语义尚不对称，不能给“完全对称”结论。

## 验证与限制

使用独立 worktree；Node 26.12.0、pnpm 12.16.1、Nx 24.0.3、Vitest 4.1.11。起初宿主 Node22/pnpm 自动切换和 symlink 依赖导致的 graph 错误，通过切换已安装 Node26 并执行 frozen-lockfile 安装解决，不作为 PR 缺陷。所有任务经 Nx 执行，`NX_DAEMON=false NX_NO_CLOUD=true`，单 worker。

定向反例使用临时 `src/__tests__/review-repro.spec.*`，执行后已删除；本提交仅报告和索引，不提交业务修改或临时失败测试。上文保留了各反例的输入、时序和实际输出，修复时应转成永久回归。

| 命令（环境变量同上） | 结果 |
| --- | --- |
| `pnpm nx run rxdb-model:test --args='run src/__tests__/review-repro.spec.ts --maxWorkers=1'` | 4/4 失败，对应 F-02/05/06/07 |
| `pnpm nx run rxdb-model-react:test --args='run src/__tests__/review-repro.spec.tsx --maxWorkers=1 --coverage.enabled=false'` | 2/2 失败，对应 F-01/04 |
| `pnpm nx run rxdb-model-angular:test --args='run src/__tests__/review-repro.spec.ts --maxWorkers=1 --coverage.enabled=false'` | 1/1 失败，对应 F-03 |
| `pnpm nx run rxdb-model-vue:test --args='run src/__tests__/review-repro.spec.ts --maxWorkers=1 --coverage.enabled=false'` | 1 失败、1 通过；失败对应 F-03，更新次序对照通过 |

删除临时反例后执行 `pnpm nx run-many -t test -p rxdb-model rxdb-model-angular rxdb-model-react rxdb-model-vue --parallel=1 --output-style=static --args='run --maxWorkers=1 --coverage.enabled=false'`，四包整套测试通过：核心 1113、Angular 376、React 363、Vue 387 项。依赖构建使用了本地缓存，四包测试均实际执行。

未在本轮执行完整 `pnpm test-all`、覆盖率门禁、真实浏览器可访问性、独立 tarball 安装或三端完整 UI 消费；不把测试通过等同于这些验收完成。
