# frontends 新问题候选（2026-10-05）

只写本轮现存公开路径，不复制 RV-056/057、存储或 Node 引导历史红。两个 probe 尚待主控串行运行；下面不是 confirm，不登记总 RV。源码推导不等于真实浏览器复验。

## FE-PENDING-001 · P2 · Angular 表单与 value 同绑的公开优先级

- 状态：**待证**；判别 spec 已新增，未执行。不是 RV-056。
- 公开触发：消费者按 `CodeEditor.value` TSDoc 同时绑定 `[(ngModel)]` 与 `[value]`；初始化模型值成功后，宿主更新 `[value]`。同一 CVA 路径的 Reactive Forms 对照也纳入。
- 生产符号：`packages/code-editor-angular/src/code-editor.ts:246-247` 明说「与 ngModel 同时使用以 ngModel 为准」；`ngOnInit:297-305` 只在初始化用 `#pendingValue ?? value()`，`writeValue:406-420` 不保留后续表单所有权，`ngOnChanges:333-342` 无条件将后到 value 写入。
- 时序：Forms `writeValue(model)` → view 文档为 model → 外部 value 变化 → OnChanges 差量 dispatch → 文档变 value；External 标记又令 `#updateListener:132-137` 不把该值写回模型。源码推导可能得到「模型旧值 / 可见文档新值」。
- 复验：`packages/code-editor-angular/src/__tests__/review-parallel-form-value.spec.ts`：ngModel 原文契约、真实 FormControl、仅 value 正对照。请求见 validation-requests.json；需记录最先失败断言，不能把 fixture 初始化问题当业务失败。
- 边界：仅 value、仅 Forms、初始化前 writeValue、禁用合并、IME 是不同场景；不把同绑问题扩成全编辑器失效。若项目明确只保证初始化优先，则先更正规格与文档，不假装运行优先已保证。
- 最小修法候选：明确并记录 CVA 所有权，输入同步仅在未被 Forms 接管时运行；三端非 Forms 行为不变。补初始化与后续回写/回调隔离双向对照；不重建 EditorView。

## FE-PENDING-002 · P2 · 旧 origin 授权晚到覆盖导航/销毁状态

- 状态：**待证**；判别 spec 已新增，未执行。**不是 Chrome host 权限绕过的确认**。
- 公开触发：扩展面板请求当前站点权限时，inspected tab 导航到另一 origin/`chrome://settings`，或面板关闭；旧 permissions.request Promise 随后返回 true。
- 生产符号：`apps/rxdb-devtools-extension/src/devtools/services/inspected-page-access.service.ts:66-83 requestAccess` 未捕获 revision；`navigationListener:46-49` / `refresh:100-121` 推进并检查 revision；`ngOnDestroy:61-64` 也推进 revision，但 requestAccess 不消费它；`PortService.activateTab:106-110` 启动的是当前 inspected tab。
- 时序：old pattern 请求挂起 → 导航触发 notifyNavigation + refresh，新页为 unsupported/required → old grant=true → requestAccess 将状态改为 granted 并 activate 当前 tab。销毁后也可能晚到 activate。
- 复验：`apps/rxdb-devtools-extension/src/devtools/services/review-parallel-access-navigation.spec.ts`：deferred request，未导航正对照，unsupported 导航负例，销毁负例。只证明 service 状态/调用，不冒充真实 Chrome 原生授权 UI。
- 边界：Chrome 自身仍检查注入 host 权限，可能拒绝新页面；因此可见错态/多余 INIT，不足以认定特权执行成功。grant=false、contains 慢回、同 origin 导航、request reject 都应补对照。
- 最小修法候选：requestAccess 与 refresh 同用 revision + pattern identity，await 后/销毁后旧结果直接作废，只有当前导航能改状态与激活。不是添加延时重试或 `<all_urls>` 权限。

## 已核对的历史修复（不重新登记）

三端 editor loader 现有 try/catch + Promise 归一化，success/failure 均受 request/view 守卫；当轮 editor4 JUnit 无失败。background 同 port 换 tab 已先删旧 map。小程序探针自包含、页面 unload 迟到 demo 已释放；这些历史描述不能成为本轮新红结论。
