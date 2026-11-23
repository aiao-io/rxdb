# 分支深度评审报告：`012-web-desktop-product` vs `origin/main`

- **评审日期**：2026-11-23
- **范围**：分支 `012-web-desktop-product`（HEAD `aa5ccd247`）相对 `origin/main` 的全部差异：1757 个文件（+339,354 / −603 行）、355 个提交
- **方法**：10 维度 finder 并行评审 → 跨发现去重 → 每条发现 3 个不同视角（正确性 / 实际影响 / 复现路径）的对抗验证者独立尝试反驳（≥2 票站住为确认，1 票为存疑）→ 完整性批判补查遗漏区域
- **规模**：140 个代理、3353 次工具调用、约 627 万 tokens、耗时 103 分钟
- **统计**：41 条原始发现 → **36 条确认**、2 条存疑、4 条被驳倒；批判补查追加 1 条确认

## 关键结论

1. **未发现 core RxDB 引擎的数据损坏级回归**，但 working-tree 插件有 1 条相对 main 的数据完整性回归（M11）。
2. **安全集群是本分支最大风险**：4 条 High 中 2 条是安全缺陷，另有 5 条 Medium 安全缺陷。它们互相放大——主应用无 CSP + 多处注入/沙箱逃逸路径 + GitHub 会话密钥与密文同库存放（L31），任意一条被利用即可泄漏 GitHub token 与全部本地数据。
3. **新包 `packages/orbit` 是质量最薄弱的核心交付**：2 条协议缺陷（H4、M9）+ 1 条握手安全缺陷（M5）+ 测试缺口（M10），且 Desktop SDK 契约文档与实现完全不符（L35）。
4. **CI/验收链路有系统性漏洞**：多套 verify/e2e 目标无人值守（M15、M18）、验收脚本收集了错误却不参与判定（M17）、错误过滤可吞掉真实回归（M16）。
5. **仓库卫生问题**：个人评审记录与 603KB 无许可第三方代码提交在仓库根目录（L33、L34）。

---

## 🔴 High（4 条）

### H1. Notes 正文无消毒 innerHTML 回填，构成存储型 XSS

- **位置**：[aiao-desktop/apps/web/src/app/apps/notes/notes.ts:472](aiao-desktop/apps/web/src/app/apps/notes/notes.ts#L472)（验证 3/3）
- **摘要**：Note.body 以原始 HTML 形式存库，展示时直接 `doc.innerHTML = note?.body`（notes.ts:472；discardChanges 里 340 行同样），而保存链路（notes.ts:480 `capture()` 读 innerHTML → NoteDocument.edit → persist 写库）全程没有任何消毒或白名单。contenteditable 编辑器接受任意富文本：从网页粘贴或把 HTML 文件拖入编辑区时，`<img onerror>`、`<svg onload>` 等事件处理器属性会随正文一起落库，每次重新打开该笔记（show() 注入 HTML 时）事件处理器立即执行，与桌面应用同源，可读写同一 SQLite 库里的全部数据（邮件、联系人、笔记）。这是集群内唯一一处把存库内容写进 innerHTML 的地方（grep 确认），与同一套代码里 noteSnippet 特意用惰性 DOMParser 取 textContent（notes-model.ts:68-73）形成对比，说明作者知道 HTML 正文有风险，但渲染路径漏了。
- **证据**：notes.ts:472 `doc.innerHTML = note?.body ?? '';`（show() 装载笔记）；notes.ts:480 `const body = doc.innerHTML;`（capture() 原样回存）；notes.html:237 编辑区为 contenteditable；notes.entities.ts:15 `body` 是普通 string 字段无约束；notes.ts:516-524 persist() 把 title/body 原样 update 进库；而列表侧 notes-model.ts:69 用 `new DOMParser().parseFromString(body, 'text/html')` 惰性解析，仅渲染路径未做同样处理。
- **失败场景**：用户从任意网页复制含 `<img src=x onerror=...>` 的富文本粘贴进笔记（或把恶意 .html 文件从 Finder 拖入编辑区），停顿 420ms 后自动保存落库；关闭笔记再重新打开，show() 执行 innerHTML 注入，img 加载失败立即触发 onerror，payload 在桌面应用同源下运行，可读取/删除本地库里所有应用数据，且每次打开该笔记都会重新执行。

### H2. saltline 游戏 iframe 无 sandbox，同源第三方压缩包可完全控制桌面

- **位置**：[aiao-desktop/apps/web/src/app/apps/saltline/saltline.ts:37](aiao-desktop/apps/web/src/app/apps/saltline/saltline.ts#L37)（验证 2/3）
- **摘要**：saltline 应用的 iframe 完全没有 sandbox 属性，而加载的 public/saltline.html 是随构建发布的压缩打包产物（无许可/出处标识），且入口被刻意设计为与桌面同源（saltline-entry.ts:3-5 注释「始终与桌面同源」）。同源 + 无 sandbox 意味着该捆绑包的任意脚本拥有 window.top 的完全访问权。桌面的 GitHub 会话（token）经 AES-GCM 密封存入桌面源 IndexedDB，但 AES 密钥（CryptoKey）也存放在同一个 IndexedDB（github-session-store.ts:107-131），同源脚本可读出密钥与密文直接解密 token，并可读写全部 RxDB 数据与 OPFS。全站无 CSP（见 M8），外发数据没有任何阻拦。
- **证据**：saltline.ts:37-45 模板中 iframe 仅有 [src]、(load)、allow="fullscreen; gamepad"，无 sandbox 属性；saltline-entry.ts:3-5 注释明确入口「始终与桌面同源」；public/saltline.html 为约 6000+ 行压缩代码（grep 输出显示无任何 license/copyright 标记）；github-session-store.ts 的 seal() 用 CryptoKey 加密、密钥对象存于同库 KEY_STORE。
- **失败场景**：游戏包本身含恶意代码、构建链被投毒、或该文件被替换（它随构建原样发布到产物根目录）：用户打开 saltline 应用时，游戏内脚本读取桌面源 IndexedDB 中的 AES 密钥与密封会话，解密出 GitHub token（repo/workflow/user:email 权限），连同笔记、邮件、文件等全部本地数据外发；或直接改写磁盘数据/触发桌面 API。

### H3. git status 重命名解析把 " -> " 标记留在 originalPath 里

- **位置**：[apps/aiao-vscode/src/workbench/git/git-status.ts:16](apps/aiao-vscode/src/workbench/git/git-status.ts#L16)（验证 3/3）
- **摘要**：parseGitStatus 解析暂存重命名时，用索引路径列表反推原路径只截掉了目标文件名部分，把 " -> " 分隔符留在了 originalPath 里（普通文件名 `old.txt -> new.txt` 会得到 originalPath=`old.txt ->` 而不是 `old.txt`）。单元测试（git-status.spec.ts:12-16）只覆盖了文件名本身含 " -> " 的病理情况并把错误行为固化为期望值，普通重命名路径完全没有测试覆盖。该字段被 unstage、staged diff 和 SCM 展示三处消费，导致重命名暂存后无法取消暂存、差异显示错误、提示文案错乱。
- **证据**：git-status.ts:11-16：entry.path 按 `endsWith(' ' + path)` 匹配索引路径后，`originalPath = entry.path.slice(0, -(candidates[0].length + 1))`；对真实 `git status --short` 输出 `R  old.txt -> new.txt`（本机 od 实测确认为单行）与 candidates[0]='new.txt'，得到 'old.txt ->'。消费方：git-runtime.ts:270 unstage 把 entry.originalPath 加进 pathspec 集合；git-runtime.ts:308 staged diff 的 basePath = entry?.originalPath ?? path；workbench-scm-resources.ts:90 title 渲染 `${originalPath} → ${path}`。实测 `git add` 对无匹配 pathspec 退出码 128（"fatal: pathspec ... did not match any files"）。
- **失败场景**：用户在文件树重命名 old.txt → new.txt（git-runtime.ts:203 的 rename 是纯文件系统移动），随后在 SCM 暂存该变更：git status --short 产生 `R  old.txt -> new.txt`。结果：(1) 点击该条目的「取消暂存」或「取消暂存所有更改」→ scratch 仓库里执行 `git add 'old.txt ->' 'new.txt'`，pathspec 无匹配 → git 退出 128 → 抛 GitWorkbenchError('git_failed')，重命名无法取消暂存；(2) 打开该文件「暂存差异」→ 按 'old.txt ->' 在 HEAD 中查不到 base → 整个文件被显示为新增，而非旧→新对比；(3) SCM 列表悬停提示显示 "old.txt ->  → new.txt"。

### H4. workspace.call 无宿主侧超时/取消：慢 Git 操作造成假 TIMEOUT、静默副作用与工作区能力卡死

- **位置**：[packages/orbit/src/desktop.ts:1562](packages/orbit/src/desktop.ts#L1562)（验证 3/3）
- **摘要**：serveDesktop 的 handle 对 workspace.call 直接 `return wire({ ok: true, value: await receiveWorkspace(frame.args as OrbitValue) })`，绕过了 withBudget 的宿主处理时限（DESKTOP_LIMITS.requestTimeoutMs=5000 文档声明「宿主处理一次请求的时限」），也完全丢弃 RPC 层传入的 rpc AbortSignal；客户端为该方法硬编码 65 秒超时。当宿主侧 host.workspace.call（pull/save/commit 等有副作用的 Git 操作）执行超过 65 秒时：客户端 RPC 超时并发送 cancel（rpc.ts:33-36），宿主控制器中止后应答被丢弃（rpc.ts:109），但 handler 不看 signal 仍在后台继续执行并产生副作用；期间 workspaceReceiver 的 executing 一直为 true，任何新请求（包括重试的第一个分片）都被「工作区传输无效或正忙」拒绝（workspace-transfer.ts:61-62），直到旧操作结束——若操作挂起（慢网络 pull、等待凭证），该窗口的 workspace 能力被永久卡死，只能重建实例。同时这些失败以原始 OrbitError(HANDLER_ERROR) 冒泡，破坏 getDesktop 文档承诺的「失败时抛 DesktopError（稳定错误码）」契约，也与 UPSTREAM.md「超时与取消贯穿请求」的协议不变式矛盾。
- **证据**：desktop.ts:1562-1563 `if (method === 'workspace.call') return wire({ ok: true, value: await receiveWorkspace(frame.args as OrbitValue) });`（不走 withBudget、不接收 rpc signal）；desktop.ts:1625 `timeout: method === 'workspace.call' ? 65000 : DESKTOP_LIMITS.callTimeoutMs`；workspace-transfer.ts:61-62 `if (!isRecord(frame) || ... || executing) throw new Error('工作区传输无效或正忙')`、79 `executing = true`（execute 完成前不清除）；rpc.ts:36 超时发 cancel、rpc.ts:109 `if (!this.closed && !controller.signal.aborted)` 丢弃迟到应答；对照 desktop.ts:106-108 的文档承诺与 UPSTREAM.md「超时与取消贯穿请求」。已用临时 spec 实测：executing 期间新分片被拒绝。
- **失败场景**：应用调用 desktop.workspace.call({ operation: 'pull', projectId })，网络慢导致 pull 耗时 >65 秒：客户端 RPC 超时，translate 把 TIMEOUT 映射为 DesktopError('TIMEOUT') 提示用户失败；宿主仍在后台完成 pull（副作用已发生，用户误以为未执行）。用户重试：重试的 offset=0 首分片命中 executing 闸门，requestDesktop 抛 OrbitError('HANDLER_ERROR','工作区传输无效或正忙')（非稳定错误码，应用无法按码分支），所有后续 workspace.call 持续失败直到 pull 结束；若 pull 永久挂起（如等待网络或凭证），该窗口的 workspace 能力永不恢复，只能关闭并重建窗口实例。

---

## 🟠 Medium（15 条）

### M5. Orbit 客户端握手不校验父窗口 origin，任意站点可接管子应用

- **位置**：[packages/orbit/src/client.ts:242](packages/orbit/src/client.ts#L242)（验证 3/3）
- **摘要**：connectOrbitClient 的 init 处理器只检查 event.source === window.parent，完全不校验 event.origin（client.ts:242-256），且 hello 消息带着握手令牌以 '*' 目标发给父窗口（client.ts:274）。更关键的是令牌 channel 取自应用自身 URL 参数 __aiao_orbit（client.ts:208-210）——攻击者嵌入 iframe 时自己设置该参数即可预知令牌，令牌不构成任何秘密。握手成功后攻击者持有所转移的 MessagePort，可向应用投递任意 props/event/RPC 消息并伪造宿主对应用请求的所有响应；宿主侧 runtime.ts:183-190 是严格校验 origin 的，客户端侧却完全不设防，协议声称的「只有桌面宿主能驱动应用」边界不成立。
- **证据**：client.ts:242-256 init 中 `if (event.source !== window.parent || !isRecord(event.data)) return;` 无 origin 校验；client.ts:274 `window.parent.postMessage({ protocol: PROTOCOL, type: 'hello', channel }, '*')`；client.ts:208-210 `const channel = url.searchParams.get(CHANNEL_PARAM)`；对比宿主 runtime.ts:187 `event.origin !== new URL(this.options.url).origin` 有严格校验。
- **失败场景**：恶意站点 https://evil.example 以 iframe 嵌入 https://vscode.aiao.io/app/?__aiao_orbit=abc（channel 由攻击者指定），子应用按协议向父窗口发 hello；攻击者用相同 channel 回复 init 并转移 MessagePort，握手完成。此后攻击者经端口持续投递 props（如 workspace 路径）与 event/RPC，驱动应用打开攻击者选择的工作区、伪造文件读取结果注入内容；结合诱导用户在「编辑器」里粘贴 GitHub PAT 并推送到攻击者控制的远端，PAT 以 Authorization 头落到攻击者服务器。

### M6. sandbox 同时含 allow-scripts 与 allow-same-origin，同源页面可自除沙箱

- **位置**：[aiao-desktop/apps/web/src/app/apps/safari/safari.html:187](aiao-desktop/apps/web/src/app/apps/safari/safari.html#L187)（验证 2/3）
- **摘要**：Safari 浏览器内嵌任意用户输入的地址（safari.ts:263-267 提交地址栏 → frame()），其 iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups"。allow-scripts+allow-same-origin 是浏览器明确警示的组合：同源内容可经 frameElement 移除自身 iframe 的 sandbox 属性从而完全解除沙箱。用户在 Safari 应用里访问任意桌面同源 URL（如桌面自身的 /saltline.html 或其他同源资产）即触发逃逸。Orbit 宿主框架同样使用该组合（packages/orbit/src/frame.ts:27），且默认 allowedOrigins 含 location.origin（runtime.ts:364），一旦有同源应用经 Orbit 装载同样可逃逸。
- **证据**：safari.html:181-188 iframe 带 sandbox="allow-scripts allow-same-origin allow-forms allow-popups"，src 为 sanitizer.bypassSecurityTrustResourceUrl(resolveUrl(用户输入))（safari.ts:416-419）；packages/orbit/src/frame.ts:27 `frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-downloads')`；runtime.ts:364 `options.allowedOrigins ?? [location.origin]`。
- **失败场景**：用户在 Safari 应用地址栏输入 https://<桌面源>/saltline.html（或桌面源下任何页面），该页面脚本执行 `frameElement.removeAttribute('sandbox')` 后获得对顶层桌面窗口的完整访问——读取 IndexedDB（含密封的 GitHub 会话与 AES 密钥）、OPFS 全部文件与本地数据并外发；同一机制适用于未来经 Orbit 装载的同源子应用。

### M7. Safari 维基导语对公开可编辑内容 bypassSecurityTrustHtml

- **位置**：[aiao-desktop/apps/web/src/app/apps/safari/safari.ts:450](aiao-desktop/apps/web/src/app/apps/safari/safari.ts#L450)（验证 2/3）
- **摘要**：Safari 的维基阅读模式把 Wikipedia parse API 返回的导语 HTML 经 sanitizer.bypassSecurityTrustHtml 注入（safari.html:243 的 [innerHTML]="page.lead"），完全绕过 Angular 消毒器。前置清理 cleanLead 是黑名单式：只删除 style/script/.mw-editsection/reference/sup.reference/.hatnote/.navbox/table/figure/.thumb 和 on* 属性，不处理 iframe/object/embed/form/svg/math/meta/link/base 等元素与 style 属性。Wikipedia 条目任何人都可编辑，且 MediaWiki 消毒器历史上存在过绕过，模板/扩展（如带原始 HTML 的特权模板）也可能产出 cleanLead 未覆盖的元素。注入执行于持有 GitHub 会话的桌面源。
- **证据**：safari.ts:448-451：`const lead = article.lead ? this.sanitizer.bypassSecurityTrustHtml(article.lead) : null`，lead 来自 safari-network.ts:53-70 的 cleanLead（黑名单），源是 https://en.wikipedia.org/w/api.php 的 parse 输出（safari-network.ts:77-79）；safari.html:243 `<div class="body" [innerHTML]="page.lead">`。
- **失败场景**：攻击者编辑某个维基条目（或利用 MediaWiki 消毒器绕过/可产原始 HTML 的模板），在导语中嵌入 cleanLead 未覆盖的载体（如带事件处理属性以外的脚本入口、iframe、SVG 外链等）：任何打开该条目的用户，其桌面源内即执行攻击者脚本，可解封 IndexedDB 中的 GitHub 会话 token 并外发。

### M8. 桌面主应用无任何 CSP，且可被任意站点 iframe 点击劫持

- **位置**：[aiao-desktop/apps/web/src/index.html:3](aiao-desktop/apps/web/src/index.html#L3)（验证 2/3）
- **摘要**：桌面主应用（Angular SPA）的 index.html 没有任何 CSP meta，生产 _headers 对 /* 只设置 COOP/COEP（_headers:8-10），唯一的 CSP 只加在 /github-oauth-return.html 上（_headers:14-16）。后果一：没有 frame-ancestors / X-Frame-Options，任何站点都可 iframe 整个桌面，对「抹掉磁盘」（desktop-erase）、GitHub 登录（其 userActivation.isActive 检查会被 iframe 内的点击满足）等敏感流程做点击劫持；后果二：上述两条注入类 finding 一旦成立，执行后无任何外发限制、无 script-src 兜底。
- **证据**：src/index.html:3-21 的 head 无 Content-Security-Policy meta；public/_headers:8-10 `/*` 仅 `Cross-Origin-Opener-Policy: same-origin` 与 `Cross-Origin-Embedder-Policy: require-corp`；_headers:14-16 表明 CSP 仅用于 oauth 返回页；ngsw-config.json 亦无相关头部。
- **失败场景**：攻击者页面全屏 iframe 桌面应用并覆盖半透明诱导层，用户误点「抹掉磁盘」按钮或「登录 GitHub」按钮：前者在桌面源内发起擦除（数据丢失），后者的点击满足 navigator.userActivation.isActive 从而弹出真实的 GitHub 授权弹窗；若未来任何注入成功，因无 CSP，脚本可直接 fetch 外发解密后的 GitHub token。

### M9. workspaceReceiver 单会话状态可被并发第二个发送方覆盖，导致其中一个传输假失败

- **位置**：[packages/orbit/src/workspace-transfer.ts:70](packages/orbit/src/workspace-transfer.ts#L70)（验证 2/3）
- **摘要**：接收方只有一份 active/input/output/cursor 会话状态，且 offset===0 的首分片无条件执行 `active = id; input = ''; output = ''`（70-74 行），不检查是否已有另一会话在途（executing 只挡执行阶段，不挡收集阶段）。serveDesktop 每个实例只建一个 receiver（desktop.ts:1546），而 getDesktop 每次调用都新建一个带独立串行队列的 workspaceSender（desktop.ts:1717-1719），队列之间互不协调。两个发送方并发时，后者的 offset=0 分片静默覆盖前者的 active/input，前者后续分片因 `id !== active`（75-76 行）被拒，整个逻辑调用以原始 HANDLER_ERROR 假失败结束。已用临时 spec 实测复现：两个 sender 并发共享一个 receiver，结果恰为 ['rejected','fulfilled']（大请求与小编排并发时大请求被杀死）。
- **证据**：workspace-transfer.ts:70-74 offset===0 无条件重置会话状态；75-76 `if (id !== active || offset !== input.length ...) throw new Error('工作区请求位置无效')`；61 行 executing 闸门只覆盖执行阶段；desktop.ts:1717-1719 每次 getDesktop 调用各自新建 workspaceSender（独立队列）。实测：vitest 临时 spec 中两个 sender 并发调用同一 receiver，Promise.allSettled 结果为 ['rejected','fulfilled']，断言两调用都应成功失败。
- **失败场景**：同一 Orbit 客户端的两个子系统（如编辑器插件与 Git 面板）各自调用 getDesktop(client) 并各自持有 desktop.workspace，随后并发发起 workspace.call：一个 20MB 的 save（多分片）与一个 status。status 的 offset=0 分片把 receiver 的 active 重置为自己的 id，save 的下一个分片因 id 不匹配被拒，整个 save 假失败（抛 HANDLER_ERROR 而非任何稳定错误码）；即使两个调用都按各自队列串行，跨 sender 的并发仍然必然使其中一个失败。

### M10. workspace 传输协议关键路径缺乏测试，恰好放过了上述两个缺陷（TDD 铁律未落实）

- **位置**：[packages/orbit/src/__tests__/workspace-transfer.spec.ts:5](packages/orbit/src/__tests__/workspace-transfer.spec.ts#L5)（验证 2/3）
- **摘要**：新增的 workspace-transfer.spec.ts 共 21 行只有两个用例（顺序化 happy path + 缺失前序分片拒绝），未覆盖：并发双发送方共享 receiver（正好掩盖了串扰缺陷）、executing 闸门/忙碌拒绝与执行挂起、execute 抛错、分片超限（part>PART、input>MAX、response>MAX）、响应长度恰为 PART 整数倍、代理对（surrogate pair）跨分片边界、重放旧 id、客户端中途断开后状态自愈；desktop.spec.ts 对 workspace.call 只有能力清单（230 行）与方法名清单（633 行）两处列表断言，默认拒绝矩阵 everyMethod（686-713 行）未包含 workspace.call，也没有经 serveDesktop/getDesktop 的分片流程集成测试（权限拒绝、instanceId 校验、host.workspace 缺失、传输中途 dispose、超时取消）。协议本身是 security-sensitive 边界且项目铁律要求「TDD：先写红测试」，两个真实缺陷（并发串扰、无取消导致的假超时与卡死）正是测试缺口放过的。
- **证据**：workspace-transfer.spec.ts:5-21 仅 2 个 it；desktop.spec.ts grep 结果：'workspace' 仅出现在 230 行（能力列表）与 633 行（方法名列表）；686-713 行的默认拒绝矩阵最后一项是 ['filesystem.save', ...]，不含 workspace.call；实测并发双 sender 测试在当前测试集中不存在且会失败。
- **失败场景**：若后续修改把 receiver 的 offset===0 重置逻辑删掉或把 executing 闸门移后，现有 83 个单测全部通过、无法发现回归；若 host.workspace.call 在分片传输中途抛错或超过 65 秒，应用侧拿到的错误形状（原始 Error vs DesktopError）没有任何测试断言保护，协议契约的破坏不会被 CI 捕获。

### M11. 损坏的 JSON patch 以裸 SyntaxError 逃出守卫，损坏闩与 commit_graph_corrupted 契约失效

- **位置**：[packages/rxdb-plugin-working-tree/src/commit/commit-integrity-rows.ts:37](packages/rxdb-plugin-working-tree/src/commit/commit-integrity-rows.ts#L37)（验证 3/3）
- **摘要**：新写的原始行读取 readPatch 对字符串形态的 patch/inversePatch 直接 JSON.parse，解析失败时抛出裸 SyntaxError。而 main 上的旧路径走仓储水合（rxdb/src/entity/entity-value.utils.ts:141-147，json 类型 JSON.parse 失败时 catch 后返回 null），坏 JSON 被归一成 null 参与指纹重算，得到的是 fingerprint_mismatch → CommitGraphCorruptedError。三个入口（commit/restore/switch-to）按 SC-013 契约要求损坏时报 commit_graph_corrupted，且 plugin.ts:188 的 latchBranchCorruption 只认 instanceof CommitGraphCorruptedError（『其余原样放过』）：新路径下 SyntaxError 使 latch 永不触发，分支 ref 不落 corrupted_read_only、corruptedAt 永远缺席，每次保存都重新遍历全图并抛出同一个无法归类的错误，FR-051 的持久诊断流程整个失效。新单测（commit-integrity-rows.spec.ts:47-56『JSON 内容损坏时拒绝校验』）甚至把 SyntaxError 行为固化成了期望。同类分歧还包括：水合对 uuid 做 toLowerCase/trim 归一，原始读取直接取落库原值，大小写异常的行会产生假指纹失配。
- **证据**：commit-integrity-rows.ts:36-37 `const readPatch = (value: unknown): Record<string, unknown> | null => (typeof value === 'string' ? JSON.parse(value) : value) as ...`；对比 main 水合路径 entity-value.utils.ts:141-147（`try { return JSON.parse(String(raw)); } catch { return null; }`）；插件 latch 判型 plugin.ts:188-195（latchBranchCorruption 只认 CommitGraphCorruptedError）；单测把 SyntaxError 写成期望：commit-integrity-rows.spec.ts:56 `rejects.toBeInstanceOf(SyntaxError)`。
- **失败场景**：存储层把某行 ChangeSet 的 patch 列损坏为 '{'（部分写/驱逐/外部改写——正是守卫存在的场景）。用户执行 commit()：readCommitIntegrityRows 抛 SyntaxError（带 JSON.parse 的报错文本），调用方写事务回滚；catch 链里 latchBranchCorruption 判 instance 失败直接放过；分支 ref 仍是 ok、无 corruptedAt。此后每一次 commit/restore/switch-to 都重新 O(N) 遍历全图并再次抛裸 SyntaxError，UI 只能展示通用错误而非『分支在 commit X 处损坏、已只读』，诊断记录永远缺席。main 上同样场景报 CommitGraphCorruptedError(fingerprint_mismatch) 并落 corrupted_read_only 标记。
- **注**：这是相对 main 的行为回归，建议优先于其他 Medium 修复。

### M12. 大小写敏感的冲突检查与大小写不敏感的数据库唯一索引不一致，命中即抛原始 SQLite 约束错误

- **位置**：[aiao-desktop/apps/web/src/app/disk/disk-path.ts:68](aiao-desktop/apps/web/src/app/disk/disk-path.ts#L68)（验证 3/3）
- **摘要**：DesktopFile 的 `desktop_file_parent_name` 唯一索引声明了 `normalized: true`，SQLite 侧每列按 `lower(COALESCE(CAST(col AS TEXT),''))` 参与比较（rxdb 的 shared-table-index 测试明确验证了这一点），即同级重名判定是大小写不敏感的。但磁盘层所有冲突检查都是精确匹配：`uniqueName` 用 `Set.has(name)`、`RxdbDiskStore` 的 `FileIndex.child` 用 Map 精确查找（write/move/ensureDirectory）、保存面板的 `saveConflict` 用 `node.name === name`，且单测后端 `MemoryDiskStore` 同样是大小写敏感的——与生产后端行为不一致。代码库自己知道索引是大小写不敏感的（`desktop-home-migration.ts:36` 用 `name.toLowerCase() === NEW_NAME` 预检改名），唯独磁盘写路径没有对齐。
- **证据**：disk/desktop-file.entity.ts:24-31 `indexes: [{ name: 'desktop_file_parent_name', properties: ['parentId','name'], unique: true, normalized: true }]`；packages/rxdb-adapter-sqlite-core/src/__tests__/shared-table-index.suite.ts:169-176 验证 normalized 列包成 lower(COALESCE(...))；disk/disk-path.ts:68-76 `uniqueName` 只用 `taken.has(name)` 精确比对；disk/rxdb-disk-store.ts:154 `index.child(parentId, name)`、:187 `if (await this.find(to)) throw EEXIST`、:275-277 `ensureDirectory` 的 `index.child` 均为精确匹配；components/file-panel-model.ts:91-96 `saveConflict` 用 `node.name === name`；对比 data/desktop-home-migration.ts:36 迁移代码使用 toLowerCase() 预检。
- **失败场景**：目录里有 `Report.txt`，用户把本机文件 `report.txt` 拖进该目录（或保存面板另存为 `report.txt`）：`uniqueName`/`saveConflict` 查不到冲突、不提示覆盖也不追加序号，`store.write` 走到 `repository.create({ name: 'report.txt' })` 撞上归一化唯一索引，抛出原始 `UNIQUE constraint failed: desktop_file.parent_id, desktop_file.name`——整个导入批次失败、toast 显示原始 SQL 错误而不是「名称已存在/重命名」；终端里 `echo hi > report.txt` 时同步写回反复失败（见 L23）；同名不同大小写的 `mv`/改名同样触发。

### M13. about 清单的 name/icon 误复制为 Finder，窗口身份错乱

- **位置**：[aiao-desktop/apps/web/src/app/app-manifests.ts:109](aiao-desktop/apps/web/src/app/app-manifests.ts#L109)（验证 3/3）
- **摘要**：about 清单的 `name: 'Finder'`、`icon: 'app-finder'` 是从 finder 条目复制粘贴的残留（app-manifests.ts:109-110）。窗口标题（desktop-window.ts:114 `this.title = signal(app.name)`）、窗口状态条图标（window-status.html:10）与 Help 菜单（desktop-menus.ts:455 `About ${name} Help`）都取自清单，而 about 组件实际渲染的是「关于本机」的 MacBook Pro 概览页。于是用户打开「关于本机」得到的是标题为 Finder、图标为 Finder 的窗口。assertManifests 只校验 name 非空（desktop-apps.ts:343），无法拦截这种语义错误。
- **证据**：app-manifests.ts:109 `name: 'Finder'`、:110 `icon: 'app-finder'`；desktop-window.ts:114 `this.title = signal(app.name)`；components/window-status.html:2 渲染 `{{ win.title() }}`、:10 `[appIcon]="win.app.icon"`；desktop-menus.ts:455 `${this.apps()[appId].name} Help`；对比 apps/about/about.ts:42-57 实际渲染内容为 MacBook Pro 概览。
- **失败场景**：用户点 Apple 菜单 → About This Mac（desktop-menus.ts:81 `wm.open('about')`）：窗口标题栏和窗口切换器显示「Finder」及 Finder 图标，Help 菜单显示「Finder Help」，而窗口内容是 MacBook Pro 硬件概览——应用身份与内容完全不符，且把 about 窗口与 Finder 窗口混淆。

### M14. GitHub 应用 diff 算法无上限：大文件差异导致主线程长时间冻结或 OOM

- **位置**：[aiao-desktop/apps/web/src/app/apps/github/github.ts:223](aiao-desktop/apps/web/src/app/apps/github/github.ts#L223)（验证 3/3）
- **摘要**：github.ts 的 diffLinesOf 实现了无任何行数/规模上限的 Myers 行差异算法：max = oldLines.length + newLines.length（第 219 行），外层循环 distance 从 0 到 max（第 223 行），且每一轮都把整张 frontier Map push 进 trace（第 224 行），时间与空间复杂度均为 O(D²)。工作台自身允许单个文本文件最大 2 MiB（git-protocol.ts:108 fileBytes），即约 10 万行级别的合法输入。该函数在三个入口被直接调用：变更视图的单文件 diff（第 566 行 diffHunks）、历史视图选中文件的 diff（第 394-396 行 historyLineHunks）、以及 historyStats（第 574-585 行）——后者对所选提交的每一个变更文件都完整跑一遍行 diff，并在 github.html 第 1077-1080 行渲染。没有任何截断或分批处理。
- **证据**：github.ts 第 219 行 `const max = oldLines.length + newLines.length;`；第 223 行 `for (let distance = 0; distance <= max; distance++)`；第 224 行 `trace.push(frontier)`（每轮保留整张 frontier Map，内存 O(D²)）；第 226 行内层对角循环 `for (let diagonal = -distance; diagonal <= distance; diagonal += 2)`（时间 O(D²)）。调用点：第 566 行 `diffHunks = computed(() => diffHunksOf(diffLinesOf(this.diff())))`、第 394-396 行 historyLineHunks、第 574-585 行 historyStats 对 historyChanges() 中每个 change 都调用 diffLinesOf。文件上限见 git-protocol.ts:108 `fileBytes: 2 * 1024 * 1024`。渲染见 github.html:1077-1080（historyStats）与 956、1174 行。
- **失败场景**：用户克隆一个包含大文本文件的正常仓库（例如一个约 2 MiB、行数约 10 万的生成文件或压缩过的 bundle，完全在 workbench 自己允许的文件大小上限内），修改其中大部分行并提交，然后在 History 标签页点击该提交：historyStats 会对每个变更文件跑完整 Myers，D 达到约 10^5 量级，需要约 10^10 次 Map 操作，主线程冻结数分钟甚至整个标签页 OOM 崩溃（桌面会话丢失）；即使在 Changes 视图选中该文件的 diff，同样触发冻结。较小的 100-200 KB 文件也会造成数秒到数十秒的卡顿。

### M15. e2e-firefox/e2e-webkit 与全部 verify-* 目标没有任何 CI 工作流消费，限制基线机制无人自动执行

- **位置**：[aiao-desktop/apps/e2e/project.json:26](aiao-desktop/apps/e2e/project.json#L26)（验证 2/3）
- **摘要**：project.json 定义了 e2e-firefox、e2e-webkit、verify-aiao-code、verify-keyboard、verify-saltline、verify-domains、compare-initial、benchmark-smoke、e2e-fixtures、e2e-aiao-code-files 共 10 个目标，但 .github/workflows 下没有任何文件引用它们：ci-template.yml 的 e2e 矩阵只按 target `e2e` 组条目（413-418 行），实际跑 aiao-desktop-e2e 的只有 chromium 冒烟（959-964 行）。后果：整套跨引擎机制——EPHEMERAL_CONTEXT_HAS_OPFS 的 WebKit 特判、持久 profile、limitations-webkit.json 的「过期限制算失败」判定——在 PR/main 上从不执行。WebKit/Firefox 的回归（例如 WebKit 下 OPFS 打不开、限制清单里登记的能力又坏了或又好了）只有某个人手跑 `pnpm nx run aiao-desktop-e2e:e2e-webkit` 才会发现，而能力矩阵里「有限支持」等结论会静默漂移。AGENTS.md 只把 verify-saltline/verify-keyboard 标注为「不进 CI」，firefox/webkit 冒烟并未声明不进 CI，却是同样的无人值守状态。
- **证据**：aiao-desktop/apps/e2e/project.json 第 26-59 行（e2e-firefox / e2e-webkit）、第 93-166 行（verify-aiao-code / verify-keyboard / verify-saltline / compare-initial / benchmark-smoke / verify-domains）均存在；`.github/workflows/ci-template.yml` 第 413-418 行 E2E_MATRIX 只含 `target: "e2e"`，第 947-964 行 Run E2E 只跑 `$PROJECT:$TARGET`；对整个 .github/workflows 目录 grep `e2e-firefox|e2e-webkit|verify-aiao-code|verify-keyboard|verify-saltline|verify-domains|compare-initial|benchmark-smoke` 零命中；aiao-desktop/AGENTS.md 第 64-67 行把这些目标列为手工命令。
- **失败场景**：某次改动破坏了 WebKit 持久 profile 下 OPFS 的初始化（或让 limitations-webkit.json 里登记的 clipboardReadAfterGrant 意外修好）。PR CI 全绿合入 main；能力矩阵继续宣称 WebKit 剪贴板读取「有限支持」。几周后有人手跑 e2e-webkit，才发现要么整组红、要么「限制已经过期」直接判失败——而问题早已在 main 上被多个提交叠着。

### M16. 控制台错误过滤未限定来源，同源资源加载失败被静默吞掉

- **位置**：[aiao-desktop/apps/e2e/src/harness/session.mjs:74](aiao-desktop/apps/e2e/src/harness/session.mjs#L74)（验证 3/3）
- **摘要**：createSession 的页面错误观察器对控制台 error 消息只按文本过滤：只要文本匹配 /Failed to load resource|ERR_FAILED|Cross-Origin Request Blocked|NetworkError when attempting to fetch resource|NS_BINDING_ABORTED|due to access control checks|Load failed/ 就直接丢弃，完全不看消息来源 URL 是否属于被拦截的外网。这套过滤本意是屏蔽「外网被 abort 产生的预期噪音」，但它同样命中桌面自身 origin 的资源加载失败（404 的资源、字体、图标、wasm、按需 chunk）以及应用自己 console.error 报出的「NetworkError when attempting to fetch resource」这类文本。runner.mjs 宣称「任何页面错误都判失败」的不变量因此出现一个洞：只要回归表现为同名错误文本、且没有别的检查项碰巧断言到该资源，检查组照样绿。对比之下，同一文件对未被忽略的错误会记录 message.location().url（75-76 行），说明过滤时完全可以、却没有按来源限定。
- **证据**：session.mjs 第 13-14 行定义 IGNORED_CONSOLE 正则；第 73-76 行：`if (message.type() !== 'error' || IGNORED_CONSOLE.test(message.text())) return;` —— 无条件按文本丢弃，未检查 location；对照 runner.mjs 第 78-79 行 `outcome.pageErrors.push(...session.errors); if (session.errors.length) outcome.problems.push(页面错误…)` 的「页面错误一律判失败」承诺。
- **失败场景**：一次构建配置错误使某个不常被断言的同源资源（例如某个 Dock 应用的图标 PNG、字体文件或未覆盖组件的 chunk）返回 404，Chromium 控制台报「Failed to load resource: the server responded with a status of 404」。该消息被 IGNORED_CONSOLE 命中直接丢弃，所有相关检查组照样通过，CI 全绿，而桌面上对应图标/字体已悄悄坏了。

### M17. verify-aiao-code 收集了应用控制台错误却从不参与判定，验收可带错误通过

- **位置**：[aiao-desktop/apps/e2e/src/verify-aiao-code.mjs:250](aiao-desktop/apps/e2e/src/verify-aiao-code.mjs#L250)（验证 2/3）
- **摘要**：Aiao Code 线上验收脚本把来自应用的 pageerror 与桌面错误都计入了判定（passed 要求 appPageErrors 为空），但应用侧的控制台错误只被推进 report.appConsoleErrors 存档，passed 的计算（250-254 行）完全不引用它。这意味着真实 https://vscode.aiao.io/ 在验收过程中 console.error 任何内容（失败的 API 调用、资源加载报错、渲染异常日志）都不会让验收失败——这正是该脚本要验收的对象本身。这与冒烟套件「任何页面错误都判失败」的自我要求不一致，也让「9 项检查全真即通过」形同放宽。
- **证据**：verify-aiao-code.mjs 第 108-113 行：`page.on('console', …)` 把非桌面来源的 error 全部 `report.appConsoleErrors.push(...)`；第 250-254 行：`const passed = !report.error && report.appPageErrors.length === 0 && Object.values(report.checks).length === 9 && Object.values(report.checks).every(Boolean);` —— appConsoleErrors 字段在判定中从未出现。
- **失败场景**：Aiao Code 发布前回归：应用主进程某次改动后在控制台持续打印错误（例如 `console.error('sync failed', e)` 或工作台内资源加载失败）。验收脚本跑完 9 项 UI 检查全部为真，报告 status=passed、退出码 0，控制台错误只静默留在报告 JSON 的 appConsoleErrors 数组里没人看，带病版本被宣布验收通过。

### M18. benchmarks 报告与 verify 目标未接入 CI，会随代码漂移且无真实性能测量

- **位置**：[apps/aiao-vscode/project.json:208](apps/aiao-vscode/project.json#L208)（验证 2/3）
- **摘要**：apps/aiao-vscode/benchmarks/ 下 20 个 browser-workbench-*.json 是 11 个 verify-* 脚本（verify-terminal / verify-runtimes / verify-scm / verify-docking 等）的通过/失败报告，但这些 verify-* 目标没有任何 CI workflow 运行：ci-template.yml 只跑 lint/typecheck/spec-typecheck/build/test/test-browser/coverage/e2e，pnpm test-all 同样不含 verify-*。仓库里的 status:passed 报告是手工运行的冻结快照（无时间戳、无 commit 绑定），代码改动后不再重新生成，作为产品能力证据会静默失真。此外 src/benchmark/*.spec.ts 全部是功能回归测试（断言 UI 行为，无任何计时/性能断言），目录名为 benchmark 却没有任何性能测量。
- **证据**：project.json:208-315 定义 verify-export/verify-offline/verify-docking/verify-commands/verify-save-preview/verify-scm/verify-terminal/verify-runtimes/verify-markdown-extension/verify-github-auth/verify-github-oauth 等 target；grep .github/workflows/*.yml 无任何 verify 引用；package.json:21 `test-all` = `nx affected -t lint typecheck test test-memory test-browser build audit-lazy-backend e2e`；ci-template.yml:730-737 的 test-browser lane 只跑 test-browser target（src/benchmark 的测试确实进 CI，但 verify 报告不进）。benchmarks/browser-workbench-terminal-vivari.json 记录 status:passed/11 checks，无生成时间与代码版本绑定。
- **失败场景**：某次重构破坏了 vivari 服务预览或终端 Ctrl+C 流程：CI 全绿（单测与 src/benchmark 未覆盖该链路），仓库里 browser-workbench-terminal-vivari.json 仍显示 passed——评审者、用户或发布流程以这些报告为产品能力证据时被误导；同时因没有任何计时测量，"benchmark" 目录无法回答任何性能问题。

### M19. 线上对账把内容不一致当终态，别名/自定义域名传播窗口内会误判发布失败

- **位置**：[aiao-desktop/scripts/deploy/live-check.mjs:72](aiao-desktop/scripts/deploy/live-check.mjs#L72)（验证 3/3）
- **摘要**：fetchWithRetry 只对网络错误与 5xx 重试（live-check.mjs:72 `if (response.status < 500 || attempt >= retries)`），而 mismatch()（live-check.mjs:91-93）把「200 但内容与本地不一致」直接作为不可重试的最终失败返回。deploy.mjs 的 verifyTargets（deploy.mjs:155-164）把任何一条失败计入 failures 并令 runDeploy 返回 ok:false、进程退出码 1。生产发布后，生产别名 `https://<项目>.pages.dev` 与自定义域名在边缘传播窗口内仍可能返回上一版部署的 index.html（200、响应头齐全、内容不同——每次构建的 Angular 哈希文件名不同，内容必然可区分），此时已经逐字节核对通过的本次上传会被整体判失败，总结信息还给出「回滚点」指引，诱导操作者对一次成功的发布做回滚或重发。脚本已经为「证书签发要几分钟」实现了 waitUntilReachable 轮询等待，却没有为「内容传播」提供同样的等待或重试，同一类问题被区别对待。
- **证据**：live-check.mjs:67-81 fetchWithRetry 的重试条件只覆盖 status>=500 与网络错误；live-check.mjs:91-93 mismatch 对 `!body.equals(local)` 立即返回失败字符串；live-check.spec.mjs:129-145 的测试也固化了「内容不一致不重试」的行为。deploy.mjs:253-260 verifyTargets 将 checkLive 的 failures 全部计入结果，runDeploy 返回 ok: failures.length===0。
- **失败场景**：对生产分支做一次改动后的发布：`wrangler pages deploy` 成功返回，部署地址（唯一 URL）逐文件核对通过；随后立即请求 `https://aiao-desktop.pages.dev/` 或自定义域名 `https://desktop.aiao.io/`，边缘节点在几秒到几十秒内仍回旧部署的 index.html（200 + COOP/COEP 头齐全），body 与本地产物不同 → 该地址记为失败且不重试 → 整体发布报「❌ 已上传，但线上核对没有通过」并以退出码 1 结束，CI 变红，而线上实际已正确更新。

---

## 🟡 Low（17 条）

| # | 问题 | 位置 | 票 |
|---|---|---|---|
| L20 | `.claude/launch.json` 硬编码作者本机绝对路径（`/Users/jimmy/Documents/aiao/rxdb/...`、`/tmp/pnpm-shim`、固定 nvm 版本），协作者启动该调试配置必失败 | [.claude/launch.json:93](.claude/launch.json#L93) | 3/3 |
| L21 | GitHub 应用导入归档接受 `.tar` 但解码器只支持 ZIP，选 .tar 必然报 invalid_archive；文件选择器无 accept 限制 | [github.ts:1347](aiao-desktop/apps/web/src/app/apps/github/github.ts#L1347) | 2/3 |
| L22 | 设置-声音面板 Mute 开关是单向绑定（`[appSwitch]`），点击只改开关视觉、不写 `system.muted`、不持久化；同级其他面板均为双向绑定 | [sound-pane.ts:32](aiao-desktop/apps/web/src/app/apps/settings/panes/sound-pane.ts#L32) | 3/3 |
| L23 | 磁盘→VM 同步写回失败无退避：每约 3.3 秒重试同一必然失败的写入并反复弹 toast，VM 与磁盘永久分叉（配额耗尽/大小写冲突时触发） | [disk-vm-sync.ts:149](aiao-desktop/apps/web/src/app/vm/disk-vm-sync.ts#L149) | 3/3 |
| L24 | `serve-static` 预览服务对畸形 URL（如 `/%zz`）无防护：decodeURIComponent 抛 URIError 直接终止整个 Node 进程（已实测复现）；createReadStream 也无 stream error 处理 | [serve-static.mjs:32](aiao-desktop/apps/web/tools/serve-static.mjs#L32) | 2/3 |
| L25 | deploy 门禁接线（build + audit-secrets 的 dependsOn）没有任何 spec 守护：移除密钥扫描后全部测试仍通过 | [aiao-desktop/project.json:163](aiao-desktop/project.json#L163) | 3/3 |
| L26 | wrangler 子进程没有超时：上传阶段网络停滞时发布无限期挂起（同文件其他网络步骤都有显式时限） | [deploy.mjs:267](aiao-desktop/scripts/deploy/deploy.mjs#L267) | 2/3 |
| L27 | `parseDeployOutput` 对非 JSON 行裸抛 SyntaxError——且发生在上传成功之后，操作者误以为发布失败（同文件 parseJsonArray 有错误包装，此处没有） | [deploy.mjs:102](aiao-desktop/scripts/deploy/deploy.mjs#L102) | 2/3 |
| L28 | inspect-live 硬编码 `desktop.aiao.io`，与 config.mjs「唯一登记处」约定及 deploy 的动态域名读取不一致，域名变更后永久误报 | [inspect-live.mjs:52](aiao-desktop/scripts/deploy/inspect-live.mjs#L52) | 2/3 |
| L29 | 浏览器 OAuth 用户取消授权（error=access_denied）落进裸 400 错误页，失败状态不回流工作台、弹窗不自动关闭（桌面流程有对应分支，浏览器流程缺失） | [redirect.ts:51](apps/aiao-vscode/deploy/functions/redirect.ts#L51) | 3/3 |
| L30 | 文件夹导入（目录句柄路径）缺少与文件选择路径一致的 `assertGitPath`/`assertNoPathCollisions` 校验，错误晚于全部目录 I/O | [folder-import.ts:59](apps/aiao-vscode/src/workbench/folder-import.ts#L59) | 2/3 |
| L31 | GitHub 会话「AES-GCM 密封」的密钥与密文存在同一个 IndexedDB（KEY_STORE 'aes' 记录），「密钥只存在内存」注释不实——加密只是混淆，威胁建模会误判 | [github-session-store.ts:112](apps/aiao-vscode/src/workbench/git/github/github-session-store.ts#L112) | 2/3 |
| L32 | vitest 别名指向 git 未跟踪的 `dist/testing.js`：干净检出/直接跑 vitest 解析失败，dist 与 src 分叉时备份套件静默跑旧代码假绿 | [vite.config.mts:15](packages/rxdb-adapter-sqlite-wasm/vite.config.mts#L15) | 2/3 |
| L33 | 仓库根目录提交了外部评审工具（Codex）的个人评审记录 `pr-202-review.md`，含本机路径与外部工作区信息 | [pr-202-review.md:7](pr-202-review.md#L7) | 3/3 |
| L34 | 仓库根目录提交 603KB 无许可第三方 macOS 克隆（`reference-macos-web-index.txt`），无来源/许可标记、无任何引用、未登记进 CONTENT-INVENTORY（2 条近重复发现合并） | [reference-macos-web-index.txt:1](reference-macos-web-index.txt#L1) | 2/3 + 3/3 |
| L35 | Desktop SDK 契约（contracts/desktop-sdk.md）自称「已实现」的入口（desktop.context、files.*、profile.*、apps.*、backup.*、transfer.* 等）在 `@aiao/orbit` 中经 grep 确认**全部不存在**，实际只有 15 个方法；契约无退役声明 | [desktop-sdk.md:24](specs/001-web-desktop-product/contracts/desktop-sdk.md#L24) | 2/3 |
| L36 | tasks.md 勾选完成的任务指向不存在的 `apps/web-desktop/` 路径（实现实际在 `aiao-desktop/apps/web`，且无 src/core 层级），完成状态无法核对 | [tasks.md:8](specs/001-web-desktop-product/tasks.md#L8) | 2/3 |

---

## ⚖️ 存疑（2 条，票数分裂）

1. **orbit 新导出类型 `DesktopWorkspaceOperation` 缺少 TSDoc** — [packages/orbit/src/desktop.ts:390](packages/orbit/src/desktop.ts#L390)。2 个验证者认为该导出与相邻导出的注释方式一致、且类型由 const 派生，非独立缺口。
2. **e2e 固定延时紧跟断言在慢 CI 上 flaky** — [aiao-desktop/apps/e2e/src/groups/shell.mjs:104](aiao-desktop/apps/e2e/src/groups/shell.mjs#L104)。Escape 后固定 650ms 断言启动台数量等一批「固定 sleep 后断言中间态」写法；1 票认为现有 3s 等待窗口足够。

## ❌ 被驳倒（4 条）

- orbit「超时契约」疑点：证实有 withBudget 保护。
- `pnpm-workspace.yaml` 新增 `minimumReleaseAgeExclude` 疑点：证实全局 `minimumReleaseAge: 0` 已使发布年龄门禁整体失效，该配置是无效条目而非缺陷。
- 另有 2 条证据不足（含完整性批判的 1 条补充）。

## 🔍 覆盖缺口（11 项，本次未评审）

完整性批判代理确认以下区域未被任何 finder 覆盖，如需补审可继续：

1. `aiao-desktop/apps/web/tools/`（serve-static.mjs、generate-pwa-icons.mjs）——serve-static 已被补查并确认 L24
2. `apps/aiao-vscode-e2e/`（全新 Playwright 工程 7 文件）
3. `aiao-desktop/requirements/`（491 文件 ADESK epics/stories/evidence）+ 根 `requirements/`
4. 根 `scripts/`（e2e-static-server.mjs、audit/）与 `website/scripts/demo-micro-app.test.mjs`
5. `.github/workflows/ci-template.yml` 与 `.github/actions/playwright-chromium/action.yml`
6. `patches/@vivari__core@1.3.0.patch`（修改第三方运行时 dist 的 pnpm patch）
7. 根供应链配置：pnpm-workspace.yaml、package.json、pnpm-lock.yaml、tsconfig.json、.gitignore、.prettierignore
8. `aiao-desktop/apps/web/src/styles.scss`（6865 行全局样式）、main.ts、vite-env.d.ts
9. `aiao-desktop/apps/e2e/src/` 杂项脚本（desktop-server.mjs、benchmark-smoke.mjs、compare-initial.mjs）
10. `apps/dev-rxdb-*` 改动与 `aiao-desktop/apps/web/` 的 tsconfig*/vitest/eslint 配置文件
11. 文档类：aiao-desktop/AGENTS.md、CONTENT-INVENTORY.md、README.md、根 README.md

---

## 修复优先级建议

1. **安全集群先修（H1、H2、M5、M6、M7、M8、L31）**：这一组互相放大——无 CSP + 多处注入/沙箱逃逸路径 + 会话密钥与密文同库，任意一条被利用即泄漏 GitHub token 与全部本地数据。最小修复：notes 渲染消毒、saltline/safari iframe 加 sandbox 并去掉 allow-same-origin、orbit 客户端校验 origin、加 CSP（含 frame-ancestors）。
2. **orbit 协议两缺陷（H4、M9）+ 补测试（M10）**：协议是安全敏感边界，TDD 铁律被违反且恰好放过两个真实缺陷（并发串扰已实测复现）。
3. **M11 是相对 main 的数据完整性回归**，优先于其他 Medium。
4. **CI/验收接线（M15、M16、M17、M18）**：把 firefox/webkit 与 verify-* 接入 CI 或明确声明手工；收紧控制台错误过滤与验收判定。
5. **仓库卫生**：删除 `pr-202-review.md` 与 `reference-macos-web-index.txt`（或补来源与许可并移入恰当位置）；修正 `.claude/launch.json` 的本机路径（L20）。
6. **文档与现实对齐（L35、L36）**：Desktop SDK 契约加退役声明或删除，tasks.md 修正路径。

---

*本报告由多代理深度评审工作流生成（10 维度 finder + 3 视角对抗验证 + 完整性批判），每条确认发现均附验证票数与复现证据。如需将个别发现录入 `requirements/reviews/` 正式记账体系（RV 编号、按根因归类），可另行处理。*
