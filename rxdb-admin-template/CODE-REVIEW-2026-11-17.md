# rxdb-admin-template 代码评审报告

> 生成日期：2026-11-17
> 评审范围：产品根 `rxdb-admin-template/` 下全部代码 —— apps/{angular,react,vue} 三端应用与各自 e2e、packages/collaboration 共享协作包、supabase/migrations、scripts 需求门禁。
> 方法：4 个并行只读评审 agent（Angular / React / Vue / collaboration+SQL 各一，未运行任何构建或测试）+ 主会话独立核实争议点。用户故事缺口分析见同目录 [USER-STORY-GAP-2026-11-17.md](USER-STORY-GAP-2026-11-17.md)。

## 1. 总体结论

**🟢 整体质量显著高于平均水平，无 P0（数据丢失/安全漏洞级）问题。** 四个评审域共同确认：

- TS strict 零逃逸（全仓无 `any`/`@ts-ignore`/`TODO`/`console` 残留）、ESLint 零警告、订阅管理干净（无裸 subscribe，四处评审独立扫描一致确认）
- 测试分层扎实：单测用 node:sqlite 真库对拍 SQL/JS 归一化、迟到结果丢弃、竞态注入；集成测试用真实临时 PostgreSQL（RLS、并发、事务注入失败全回滚）；e2e 对三端 production 构建跑共享套件 + 真 Supabase Auth 真栈
- 协作核心安全设计全部落实且有证据：服务端权威授权、RLS 只读投影、共享表直写禁令、行锁+单事务原子合并、幂等回执、不可变提交图、三方合并
- i18n 三端应用层零硬编码、编译期 `satisfies` 门禁强制目录逐键对齐

发现 **1 条 P1**、**约 20 条 P2**、**约 20 条 P3**。P1 集中在协作包的离线会话刷新链路；P2 集中在三端重复实现的领域逻辑、个别竞态与测试深度不对称。

## 2. 问题清单

### 2.1 P1

**[P1][会话/数据丢失风险] packages/collaboration/src/client/controller.ts:67 — 离线冷启动后自动刷新永久失效，锁出时丢弃未保存编辑缓冲**
`autoRefreshToken: navigator.onLine` 只在初始化时求值一次。页面离线打开（US-201 AC#5 支持的冷启动路径）后该值永久为 false，联网后既不刷新会话也不触发 TOKEN_REFRESHED；access_token 过期后首个请求 401 → `failure()` 强制 `lock()`（controller.ts:309-315）→ mount.ts:48 `editor.clear()` 丢弃未保存编辑缓冲，且 form-drafts.ts:13 明确排除 `data-record-id` 输入无法恢复。链路末端有用户输入丢失风险。
建议：恒开 autoRefreshToken（supabase-js 离线会自动暂停），或在 online 回调里 refreshSession()；lock 前把编辑缓冲落盘。

### 2.2 P2（按域分组）

#### 三端共享（同病）

1. **[跨三端][健壮性] dashboard-activity-source 查询失败后流永久完成** — Angular `apps/angular/src/app/pages/dashboard-activity-source.ts:82-85`、React `apps/react/src/app/pages/dashboard-activity-source.ts:82`、Vue 同构实现：`catchError` 发出错误状态后流完成，后续任何 RxDBChange 事件不再重查；三端 spec 都把 `subscription.closed === true` 固化为契约。本地库一次瞬时失败（连接竞争、SQLite busy）后最近活动区永久停更，只有刷新页面恢复。（Angular 评审曾报 P1；综合三端一致性、spec 有意识固化该行为、影响为停更而非数据损坏，定为 P2。）→ 错误后保留事件监听并事件驱动重查，或页面提供重试入口；至少注释声明是刻意决策。
2. **[跨三端][i18n 门禁缺失] 协作 UI「中文为词条键」无编译期保障** — 机制本身正确：`packages/collaboration/src/client/elements.ts` 的 `element()` 内部统一走 `tx()`，320 个中文字面量经主会话脚本核对，英文目录（client/messages.ts，377 行）缺失仅 1 个用户可见键：`client/api.ts:45` 的 `'请求结果不确定，请确认或重试原请求'`（英文界面该错误显示中文）。真正的问题是没有「每个 tx() 词条必须在 collaborationEnglish 中存在」的测试/门禁，新词条会静默回退中文；e2e 只抽查少数文案（collaboration.spec.ts:382）。→ 补 api.ts:45 词条；仿照 React 端 `pageEnMessages` 的 satisfies 门禁给协作目录加逐键校验。（注：两份 agent 报告在此处结论相反——「约 30 处绕过 tx()」与「零缺失」均不准确，主会话逐键核实后定级如上。）
3. **[跨三端][安全边界] 写死匿名身份 `context: { userId: 'userId' }`** — 三端 `apps/*/src/app/rxdb/setup_rxdb.ts:19`。US-201 AC#9 语义下是设计行为（协作包自建按用户隔离的库，导入走显式 readAnonymousAssets），当前无泄漏；但模板消费方接入真实身份后最易漏改此行为，审计归属全部失真，且 README「定制内容」表没有这一项。→ 提为命名常量（如 `ANONYMOUS_LOCAL_USER_ID`）并注释「仅限本地上下文」；在 README 定制表登记一行。
4. **[跨三端][架构] 纯领域/控制器逻辑三端逐份复制** — dashboard-{model,activity-query,activity-source}、shell/record-search、shell/workbench-menu、backup/backup-controller 在 React/Angular/Vue 逐份复制（仅绑定 API 不同）。同产品根的 packages/collaboration 已示范「逻辑共享、三端薄壳」模式。→ 下沉到共享包（如 @rxdb-admin-template/workbench-domain），三端只留框架绑定；符合 AGENTS.md「真实复用出现后抽包」——此处复用已真实存在。
5. **[跨三端][测试深度不对称]** — React 端有页面组件级单测（backup-page.spec.tsx、page-i18n.spec.tsx、dashboard-model 等 15 个 spec）；Angular 端 pages/ 只有纯逻辑 spec、Vue 端缺 page-i18n 级别页面单测，页面渲染分支全靠共享 e2e 兜底。另：React 的 dashboard-page.tsx 与 collaboration-page.tsx 也无组件级单测（StrictMode 下 db.connect() 双调用路径 dev 独有、完全无测试；collaboration 页接线 translate/subscribeLanguage/importAnonymous 零回归保护）。→ 三端各补页面级单测，与 React 对齐。
6. **[跨三端][偏好读取] `extension[SEARCH_PAGE_SIZE_KEY] as number` 裸断言** — React search-page.tsx:18、Angular search-page.ts:60、Vue search-results.vue:16。手工导入的偏好 JSON 非法值会以 undefined/NaN 进入搜索逻辑，用户设置静默失效无信号。→ 用扩展注册声明的 min/max（5–50）与 defaultValue 规范化后再断言。

#### React 端

7. **[代码卫生] Playwright 失败产物被 git 跟踪** — apps/react-e2e/dot/.last-run.json 及 dot/list-view-…-chromium/trace.zip、error-context.md 入库（`git ls-files` 证实），污染仓库体积与 diff。→ dot/ 加入 .gitignore 并 `git rm --cached`。
8. **[竞态] apps/react/src/app/shell/record-search.ts:33-37 — abort 监听注册晚于等待期** — abort 监听在 `firstValueFrom(adapterConnected$)` 返回、句柄创建后才注册；等待连接期间面板被中止则 `search()` 永不 settle，面板卡加载态；abort 路径与 finally 双调 `handle.destroy()`（依赖引擎幂等）。→ abort→destroy 绑定提前到等待期，等待连接用 abort 信号 race。
9. **[可维护性] apps/react-e2e/src/e2e-utils.ts:42-99 — e2e 深度依赖 VTable 私有内部**（`__vtable__`、scenegraph、getHeaderField、records），rxdb-model 表格实现一重构全碎（三端共享同款工具）。→ 在 rxdb-model 提供稳定测试出口（data-* 属性或 window 命名空间）替代私有字段直读。
10. **[质量] apps/react/src/app/pages/dashboard-page.tsx:102 — `{activities.length}/5` 硬编码**，与 dashboard-model.ts 的 DASHBOARD_ACTIVITY_LIMIT 重复；Angular 模板同病（dashboard-page.ts:68）。→ 改用常量。
11. **[规范冲突] apps/react/src/app/entities/entity-labels.ts:10-12,21-22 — 目录缺 key 静默回退中文 displayName**，与「无 fallback 兜底」铁律冲突。模板立场可接受，但缺 key 时无任何提示，英文界面漏中文且查不到。→ 保留行为但 dev 下 console.warn，或 README 要求目录补齐作为 lint 门禁。
12. **[健壮性] apps/react/src/app/backup/backup-ops.ts:48-56 — downloadBlob 的 anchor 未挂 DOM、setTimeout 1s revoke 是启发式**，个别浏览器对未挂载 anchor 的 .click() 行为不一致。→ append→click→remove；revoke 前注释说明依赖关系。

#### Angular 端

13. **[生命周期竞态] apps/angular/src/app/pages/collaboration-page.ts:12-22 — afterNextRender 与组件销毁竞态** — 组件在首次渲染回调执行前被销毁（同帧导航离开 /collaboration），`mountCollaboration` 仍执行（挂到已分离宿主），dispose 注册到已销毁的 DestroyRef 不保证执行：泄漏 document 捕获阶段 click 监听、beforeunload、online/offline、15s presence 心跳 interval 与 controller 订阅。React（useEffect cleanup）与 Vue（onUnmounted）无此竞态，三端不对称。→ 回调内先判断宿主是否仍挂载再 mount，或用 viewChild 生命周期钩子替代 afterNextRender。
14. **[正确性] apps/angular/src/app/pages/dashboard-page.ts:244 — `Promise.resolve(this.db.connect(...))` 接不住同步抛错**（connect 在包装前求值），异常穿透构造函数，`.catch` 形同虚设。→ 改 `.then().catch()` 直连。
15. **[正确性] 实体查找断言未判空** — Angular apps/angular/src/app/app.ts:47 与 Vue apps/vue/src/app/shell/count-value.vue:7 的 `findWorkbenchEntity(...) as EntityType`：注册表与 config.entities 脱节时 null 被断言成实体类喂给 useCount，运行时崩。→ 显式短路（与「无 fallback」铁律一致：显式拒绝而非吞错）。
16. **[正确性] apps/angular/src/app/backup/backup-controller.ts:91 — `getAdapter(...) as RestoreAdapter` 能力断言**：消费方换不支持 cleanupIncompleteRestore 的适配器时 cleanup() 才运行时 TypeError（懒触发，假适配器恒有该方法测不出）。→ 构造时一次性能力检测显式报错。
17. **[TOCTOU] apps/angular/src/app/backup/backup-controller.ts:97-101 — 判连接与 restore 之间的竞态窗**：另一标签页在窗口内完成连接则恢复写入已初始化库。引擎有 target_not_empty 兜底不丢数据，属防御层时序洞。→ 把「连接前恢复」校验收敛到引擎单一执行点。

#### Vue 端

18. **[HMR] apps/vue/src/main.ts:12-18 + rxdb/setup_rxdb.ts:12,47-49 — import.meta.hot.dispose 不销毁模块级 RxDB 单例**：编辑 setup_rxdb.ts 触发模块重估后在同一 dbName 上再建实例（sqlite-wasm idb 多实例冲突风险，dev-only）。→ setup_rxdb 内加 import.meta.hot.dispose 销毁实例。
19. **[规范] apps/vue/eslint.config.mjs:44-48 — vue/attributes-order 被关闭**，注释自述 RV-035 之后「可按 rxdb-model-vue 的做法重新开启」但未跟进，模板属性语义顺序零门禁。→ 跟进重开。

#### collaboration 包与服务端

20. **[可扩展性] packages/collaboration/src/server/engine.ts:70-85 + repository.ts:57-66 — 工作区状态无界增长**：receipts/audit/notifications 永不修剪；每命令 structuredClone 全状态+整行 UPDATE；快照（engine.ts:124）返回用户全部通知+全量审计，无响应大小上限，长期运行每次操作成本线性上升。→ 回执按 TTL 修剪、审计/通知归档、快照分页。
21. **[幂等/死锁] packages/collaboration/src/client/controller.ts:168-174 — accept_invite 超时后 pending 卡死**：retryPending 先 selectWorkspace，尚未成为成员的接受者读快照必 403 → lock，pending 永留 sessionStorage；executeCommand 的 pending 守卫（controller.ts:347-352）跨工作区阻塞该用户所有 durable 命令。→ retryPending 对 accept_invite 跳过 selectWorkspace 直接重发；提供「放弃上次请求」入口。
22. **[DoS] packages/collaboration/src/server/http.ts:80-94 — 请求体流式读取无超时**（未设 server.requestTimeout/请求级 timeout），慢速客户端可长期占 socket。→ request.setTimeout + 连接上限。
23. **[安全卫生] packages/collaboration/src/client/admin-view.ts:85 — 邀请 token 明文进 URL query（?join=）**，泄露浏览器历史/代理日志/Referer；有邮箱绑定+7 天过期兜底故 P2。→ token 放 fragment 或链接只带 id、token 另交付。
24. **[铁律违反] packages/collaboration/src/model.ts（29 导出）、client/controller.ts、client/api.ts 公开面几乎无 TSDoc**，违反「新包/新导出必须补齐 TSDoc」铁律。→ 补全公开 API 与数据结构 TSDoc。

### 2.3 P3（简表）

| # | 位置 | 问题 → 建议 |
| --- | --- | --- |
| 1 | packages/collaboration/src/client/pr-view.ts:238 | 自定义冲突值 JSON.parse 抛错在 button 回调同步段，绕开 perform/failure，用户看到「点了没反应」→ selections 求值移入 perform 或先校验 |
| 2 | packages/collaboration/src/server/engine.ts:98-103 | auditDetails 只删 tokenHash/commits，invite 命令的受邀邮箱随审计对所有 read 成员可见（invitations 列表本身 manage 专属）→ 审计详情对 email 脱敏 |
| 3 | packages/collaboration/src/records.ts:61-62 | 名称唯一性键用 row.fields.name 拼接，缺 name 行全撞 `Asset:undefined`，多行无名称时产生虚假「名称必须唯一」→ 无 name 跳过唯一性检查 |
| 4 | packages/collaboration/src/client/editor.ts:219-223 | Number(value) 可产生 NaN（输入 'e'），JSON 序列化后线上静默变 null，且 checkValue(null) 放行，空金额可过合并检查 → NaN 转 null 并提示，或补业务必填校验 |
| 5 | packages/collaboration/src/server/http.ts:36-40 | decodeURIComponent 对非法百分号编码抛 URIError → 500 → 包 try 返回 400 |
| 6 | supabase/migrations/202611160001_collaboration.sql:17-21 | admin_audit 无 created_at/actor_id 索引，按时间/操作人查询全表扫 → 加 (team_id, app_id, created_at) |
| 7 | packages/collaboration/public/collaboration-sw.js:15 | event.source 为 MessagePort 时 .url undefined 抛未捕获异常；SW scope '/' 与三端应用自有 PWA SW 控制权竞争 → 先判 source 类型；scope 限制到 /collaboration |
| 8 | packages/collaboration/tsconfig.server.json:6 | tsBuildInfoFile 指向 dist/server.tsbuildinfo，dist 清理后增量构建失效 → 挪出 dist |
| 9 | packages/collaboration/src/server/repository.integration.spec.ts:157-179 | RLS 断言覆盖 UPDATE/DELETE/SELECT，未显式断言 INSERT 拒绝（US-203 AC#5 直接点名 insert）→ 补一条 |
| 10 | packages/collaboration/src/client/mount.ts:181-184 | restoreFocus 同一 includes(target.type) 条件写两遍 → 合并 |
| 11 | Angular workbench-shell.spec.ts:151-155 / React workbench-shell.spec.ts:161-166 | 模块级 navigator 被测试永久替换无还原，跨文件测试污染 → finally 里还原绑定 |
| 12 | Angular dashboard-model.ts:64-114 | normalizeDashboardChanges/normalizeDashboardActivities 生产零调用（只在 spec 当 SQL oracle），死代码与漂移风险 → 移入 spec 目录或标注 @internal 测试契约 |
| 13 | Angular entity-shell.ts:24 | 只匹配 /entities 无尾斜杠，深链 /entities/ 渲染空壳页 → URL 归一化比较 |
| 14 | Angular backup-ops.ts:62-69 | 注释称「未知错误兜底为原文」，实际非 Error 值被丢弃（spec 断言了此行为），注释与行为不一致 |
| 15 | Angular workbench-menu.ts:77 | collaboration 菜单项是唯一无 icon 的项，视觉不对称 |
| 16 | Angular main.ts:27 | bootstrap 失败仅 console.error，页面空白无用户可见提示 |
| 17 | packages/collaboration/src/client/controller.ts:57/446 | Supabase access_token 落 localStorage（XSS 面大于 memory/sessionStorage）。Supabase-js 默认行为，模板应在文档提示消费方知晓风险面 |
| 18 | Vue workbench-shell.ts:52 | 注释「路由器在 main.tsx 里才创建」是 React 文件名残留 → 改文件名 |

## 3. 三端对称性对比

三端功能面逐项对齐（路由六页 /、/dashboard、/entities、/search、/collaboration、/backup；外壳 12 主题/4 布局/页签/命令面板/锁屏/计数徽标；搜索分页偏好扩展；旧键迁移；i18n 桥与匿名导入源），协作 UI 由共享包承载、e2e 三 project 跑同一套 spec。核对结果：

- **对称 ✅**：菜单/路由/主题清单/偏好扩展/存储前缀/协作接线（translate/subscribeLanguage/importAnonymous 三参数逐字一致）。Vue 将 dashboard 拆 page+content、search 拆 page+results、backup 抽 controller——功能等价、分层更优。
- **不对称 ⚠️**：
  1. 测试深度：React 有页面组件级单测，Angular/Vue 缺（问题 5）。
  2. 生命周期：Angular 的 afterNextRender 竞态是 Angular 独有（问题 13），React/Vue 无。
  3. 搜索页门控方式：React 用路由 loader 预连接+errorElement，Angular/Vue 用组件内 connect+loading 门控——对外行为与 testid 契约一致，可接受但实现路径已分叉，抽共享包时需收敛。
  4. e2e 共享套件宿主在 react-e2e（angular/vue-e2e 以 `testDir: '../react-e2e/src'` 复用）——设计使然且依赖与 inputs 接线正确，但套件演化事实上有 React 端单点所有权，跨端测试工具（e2e-utils 的 VTable 私有依赖）改动需三端同时回归。

## 4. 需求实现核对（US-201 ~ US-216）

16 条协作故事逐条核对 AC 与实现/测试证据，**未发现虚标**：

- ✅ 完整：US-202（11 AC）、US-203（仅缺 INSERT 拒绝显式断言）、US-204、US-205（9 AC）、US-206（11 AC）、US-207、US-208、US-209（12 AC）、US-210（8 AC）、US-211（9 AC）、US-212（11 AC）、US-213、US-214、US-215、US-216——实现文件与故事声明一致，分层测试证据齐全。
- 🟡 部分：**US-201** 两处真实缺口——(1) AC#2/#3 缺生产 SMTP 投递与验证码自然过期的外部环境证据（故事内已诚实标 ⚠️，非实现缺失）；(2) 离线冷启动后 autoRefreshToken 永久失效（问题 P1），使 AC#4/#5 已标 ✅ 的离线链路在「离线打开后再联网」场景不完整。

安全性独立复核（agent + 主会话）：RLS 逐表核对 5 张 public 表全部 SELECT-only + REVOKE ALL，admin_private 无任何授权，can_read SECURITY DEFINER + search_path=''；前端无 innerHTML/any，用户内容全 textContent 渲染；合并原子性（FOR UPDATE 行锁+单事务+注入失败全回滚）与幂等回执（operationId+canonical 指纹+actor 绑定）成立；服务端全部命令二次授权，anon-key 每请求重验身份。**未发现可绕过服务端规则写入数据的路径。**

## 5. 优化建议汇总（按主题）

1. **补洞优先**：P1（autoRefreshToken + lock 前落盘编辑缓冲）→ api.ts:45 i18n 词条 → accept_invite pending 死锁 → 服务端无界状态修剪（TTL/分页）。
2. **收敛三端重复**：把 dashboard-model/activity-query/activity-source、record-search、workbench-menu、backup-controller 下沉共享包（三端已出现第三份复制，符合抽包条件），顺带收敛搜索页门控方式分叉。
3. **补门禁**：协作词条逐键校验（仿 satisfies 门禁）；TSDoc 门禁（model.ts 等公开面）；RLS INSERT 拒绝断言；Playwright dot/ 产物出库。
4. **测试对称**：Angular/Vue 补页面级单测；React 补 dashboard-page/collaboration-page 组件单测与 /collaboration 路由冒烟。
5. **模板消费方体验**：匿名 userId 常量化+README 登记；access_token 存储方式文档化；bootstrap 失败的用户可见提示。
6. **数据层护栏**：records.ts 无 name 唯一性假冲突、editor NaN 静默变 null 的必填校验、admin_audit 索引。

## 6. 已核实非问题的误报澄清（避免后续误修）

- **协作 UI「约 30 处硬编码中文未走 i18n」**（一份报告报 P1）：不成立——`element()` 工厂内部统一走 `tx()`，主会话逐键核对 320 个中文字面量仅 1 个缺目录键，实为 P2 门禁缺失（问题 2）。
- **协作 UI「i18n 零缺失」**（另一份报告称无问题）：不完全成立——api.ts:45 一词条缺失，且无编译期保障。
- **三端写死 `userId` 匿名身份**：US-201 AC#9 语义下的设计行为，协作库按用户物理隔离，当前无泄漏；风险在模板消费方（问题 3）。
- **material 主题清单**：DaisyUI 列表不含但 `packages/rxdb-admin/admin.css` 在 @layer base 手工定义完整 CSS 变量，非 bug。
- **angular/vue-e2e 无自有 spec**：设计使然（testDir 指向共享套件），非缺口。
- **VTable 私有字段直读**：三端同款且带注释，是已知技术债而非新问题（问题 9 已列改进建议）。

---

*评审为只读执行；未运行构建/测试，报告未验证各修复建议的编译影响。原 agent 完整报告存档于 `tmp/review-{react,angular,vue}-agent.md` 与争议核实记录 `tmp/review-adjudication.md`。*
