import hashlib
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

root=Path('/Users/jimmy/Documents/aiao/rxdb')
base=root/'requirements/reviews/evidence/2026-10-05/parallel/frontends'
validation=base.parent/'validation'
scope=json.loads((base/'scope.json').read_text())
inspection=json.loads((base/'file-inspection.json').read_text())

# 本脚本仅汇总已记录证据并写本组文档，不执行任何校验任务。
def ref(path,lines,symbol):
    return f'`{root/path}:{lines} {symbol}`'
def row(status,production,sequence,tests,gap):
    return dict(status=status,production=production,sequence=sequence,tests=tests,gap=gap)
A=lambda p,l,s:ref(p,l,s)
D={}
D['code-editor']=[
 row('部分核销：字符串差量已核销',A('packages/code-editor/src/document-sync.ts','54-69','computeMinimalDocumentChange'),'相同内容返回 null；公共前缀/后缀确定单一 UTF-16 替换段；三端用 External + addToHistory(false) dispatch。',A('packages/code-editor/src/__tests__/document-sync.spec.ts','5-62','边界回放')+'；'+A('packages/code-editor/src/__tests__/review-document-change-properties.spec.ts','13-43','4096 对固定种子回放；空串/代理项/组合字符'),'字符串回放与合法坐标可独立核销；真实 composing 中外部回写、DOM selection、撤销/滚动仍由绑定/browser 补证，不能算该单测已证明。'),
 row('已核销：解析/loader 与竞态子项',A('packages/code-editor/src/language-resolution.ts','71-109','resolveCodeEditorLanguage / isSameResolvedLanguage')+'；'+A('packages/code-editor/src/languages.ts','28-31,58-69,72-232','loader/元数据'),'none / not-found / found 分离；description identity 等价才跳过；各绑定请求号递增，A 后到不能盖 B；同步 throw 现已归一化成 rejection。',A('packages/code-editor/src/__tests__/index.spec.ts','192-205,246-294','真实 Rust/15 loader/parser/严格 JSON5 反例')+'；三端现有慢成功/慢失败/销毁断言与本轮绿色 JUnit 对照。','不复制 RV-056 红报告；未知语言不等于加载故障。按需代码分包体积由 C5 补证，不影响已核销的纯解析/竞态。'),
 row('已核销：共享契约及三端基础对照',A('packages/code-editor/src/index.ts','11-20','公开 exports / CodeEditorTheme')+'；'+A('packages/code-editor/src/language-error.ts','28-70','冻结错误联合/原 cause'),'主题 light/dark；默认 sql/basic/两空格；宿主同步不触发用户 change；三端 error 通道不同但 kind/language/message/cause 相同。','共享 language-error/resolution 测试有 not-found、非 Error rejection、none 正对照；三端实际实现逐项对照见下文。','Angular 独有 CVA / setExtensions / setLanguage 不伪装成共享能力；同绑表单的 FE-PENDING-001 归 Angular，不将其推成共享包失败。'),
 row('部分核销：纯 a11y helper / 不拥有 view 已核销',A('packages/code-editor/src/accessibility.ts','61-85','buildCodeEditorContentAttributes / shouldAutoFocusCodeEditor'),'属性只给真正 contentDOM textbox；清空名称不产空 aria；disabled/readonly 抑制初始化 autofocus。共享模块没有 EditorView 构造/隐藏全局实例。',A('packages/code-editor/src/__tests__/accessibility.spec.ts','5-53','四属性/清空/焦点正反对照')+'；Node 环境真实共享单测。','helper 行为与不创建 view 可独立核销；Tab 逃逸、屏幕阅读器、大文档性能及真实 IME 未核销，见 browser-required.md。'),
 row('部分核销：打包条目/root 解析已核销',A('packages/code-editor/package.json','24-58','sideEffects/exports/files/dependencies')+'；'+A('packages/code-editor/vite.config.mts','16-20,39-74','dts / external / lazy parser imports'),'语言声明顶层导出；parser 动态 import；external 清单与 dependencies 对照；pack 排除 spec。','主控 packed-consumer-entry-check.json：本包实际 pack、条目无缺失、新 consumer root resolve 成功；不是仅工作区 alias。','declarationCompilationExecuted=false、runtimeImportExecuted=false；独立 typed consumer、缺语言 chunk、仅 SQL bundle 实测体积仍需补证。未把可解析说成可运行。')]

D['code-editor-angular']=[
 row('部分核销；同绑优先级待证',A('packages/code-editor-angular/src/code-editor.ts','297-342,386-420','ngOnInit / ngOnChanges / writeValue / ngOnDestroy'),'实例创建 view；CVA 初始化 pendingValue 优先；value 后续差量事务；External 抑制回调，用户编辑同时调用 CVA onChange 和 aoChange。','本轮 76/76 通过；既有光标/undo 前几条经测试 helper dispatch，不能单独证明 OnChanges；新增真实 ngModel/FormControl/value 正对照 3 用例待主控。','FE-PENDING-001 未 confirm；真实 IME/DOM selection 未核销。通过 unit 不抵消未运行新 probe。'),
 row('已核销：语言竞态与局部配置',A('packages/code-editor-angular/src/code-editor.ts','331-383,470-517,554-559','OnChanges / setLanguage / syncLanguage'),'等价 description 跳过；真正切换递增 request；同步 throw 归一化；成功/失败均同时检查 request 与 view；主题/setup/userExtensions 各自 compartment。',A('packages/code-editor-angular/src/__tests__/code-editor.spec.ts','371-406,491-502,995-1019','快 B/慢 A、plaintext、销毁成功/失败')+'；'+A('packages/code-editor-angular/src/__tests__/review-language-sync-throw.spec.ts','13-55','同步异常/rejection 正反对照')+'；当轮 JUnit 绿色。','该 C 不等全应用/IME；RV-056 已修复，不重新登记。请求号是逻辑取消，不宣称已中止网络下载。'),
 row('部分核销：基础 API / contentDOM a11y',A('packages/code-editor-angular/src/code-editor.ts','173-188,209-265,272-295,568-595','disabled OR / inputs / outputs / handle / a11y'),'表单与 input 禁用取 OR；readonly/editable/aria 同次 dispatch；aoFocus/aoBlur 与 touched 在 view observers；共同 view/host/focus/blur 面一致。','共享 a11y 计算、三端实际源码对照；本轮 DOM fixture 对照绿色。','真实屏幕阅读器/Tab、全部输入组合未核销；setExtensions/setLanguage 为 Angular 额外面，原生事件形式允许不同。'),
 row('已核销：已读生命周期/注入子项',A('packages/code-editor-angular/src/code-editor.ts','81-112,297-329,386-391,507-514','OnPush / inject / browser gate / Destroy'),'SSR guard 先于构造；销毁先推进请求号并置空 view，再 destroy；晚成功与晚失败不 dispatch / emit。','既有真实 TestBed 销毁成功/失败用例本轮通过；不是 mock EditorView。','Angular CLI 只发现 examples，get_best_practices 调用失败已如实记录；真实 SSR 渲染/ShadowRoot、多 provider consumer 属单独未验证面，不将 guide 缺失当源码阻断。'),
 row('部分核销：strict / package entry',A('packages/code-editor-angular/tsconfig.json','1-26','strictTemplates / lib+spec references')+'；'+A('packages/code-editor-angular/src/code-editor.ts','406-420,611-619','unknown CVA 值校验'),'模板/表单入口不以 any 声称安全；null/undefined 归空，错误类型在边界拒绝。','主控69 lint/typecheck 绿色；76 个旧输入面测试绿色；实际发布 root 为 dist/packages/code-editor-angular，条目/root resolve 成功。','新 probe 与后续零警告复验待主控；独立 typed Angular consumer/真实 route mount-unmount/SSR 未完成。typecheck/pack 不是模板消费运行证明。')]
D['code-editor-react']=[
 row('部分核销：事务/所有权',A('packages/code-editor-react/src/CodeEditor.tsx','227-235,333-377,514-519','syncDocument / view effect / value effect'),'首次创建；用户 docChanged 才 onChange；宿主差量标 External + 不进 history；cleanup 先清 viewRef 再 destroy。',A('packages/code-editor-react/src/__tests__/CodeEditor.spec.tsx','117-209','外部追加/中间变化/undo/范围 selection')+'；本轮 34/34 绿色。','上述部分用例仅作索引，全文未读；真实 DOM selection/IME、输入同时受控回写、大文档滚动未核销。'),
 row('已核销：语言竞态/等价性',A('packages/code-editor-react/src/CodeEditor.tsx','308-321,461-512','appliedLanguageRef / stableLanguages / request+view'),'列表元素等价保留稳定引用；selected description 不变不装载；A→B 后 A 返回被 request+view 丢弃；同步 loader throw 已进入错误通道。',A('packages/code-editor-react/src/__tests__/CodeEditor.spec.tsx','385-427,622-662','迟到成功/失败、空列表/未知语言、callback identity')+'；本轮对应用例绿色。','逻辑取消不等物理取消；不复制历史 RV-056。本专题不等待其他 app。'),
 row('部分核销：props / DOM a11y / handle',A('packages/code-editor-react/src/CodeEditor.tsx','55-193,404-421,523-532','props / access / contentAttributes / host'),'共同默认值/错误载荷同语义；内部 textbox 属性经 compartment；宿主透传与内部名称分离；disabled 避免 autofocus。',A('packages/code-editor-react/src/__tests__/CodeEditor.spec.tsx','480-533','清空属性/disabled/焦点正反/imperative handle')+'；三端源码互照。','readonly 可选择/复制需 browser 验证；原生 FocusEvent 不要求与 Angular void 同类型；真实辅助技术和标签消费未核销。'),
 row('部分核销：普通卸载已核销，StrictMode 待证',A('packages/code-editor-react/src/CodeEditor.tsx','323-331,333-377,465-471','callback refs / cleanup / view identity'),'闭包用 ref 获取最新回调；cleanup 清 ref；applied 同时绑定 view，避免 effect replay 误认新 view 已装语言。','卸载 handle 归 null 与慢请求用例绿色；现有测试文件未发现 StrictMode 包装断言，不能用源码注释充当该动态证据。','需真实 StrictMode mount→cleanup→mount + 首次 loader 晚到/新 view 成功的有界对照；本轮不继续新增 probe。'),
 row('部分核销：类型与发布 metadata',A('packages/code-editor-react/src/CodeEditor.tsx','202-206,318-321,379-392','list compare / render state adjustment / imperative handle'),'render 中只在语言列表元素真变化时调整 stableLanguages；所有 view 副作用在 effect；ref 公共面明确 null。','主控69 lint/typecheck 绿色；34 个本轮用例绿色；实际 pack 条目、新 consumer root 可解析。','render replay/concurrent 时序及独立 React typed/runtime consumer 未核销；声明文件存在不是 consumer 编译通过。')]
D['code-editor-vue']=[
 row('部分核销：真实 CM 事务已核销',A('packages/code-editor-vue/src/CodeEditor.vue','81-162','mounted / updateListener / value watch / unmounted'),'用户编辑发 update:value+change；外部 watch 最小差量，不回发事件/不入 undo；卸载递增代次、清 ref、destroy。',A('packages/code-editor-vue/src/__tests__/CodeEditor.document-sync.spec.ts','21-101','真实 CodeMirror 光标/range/history/差量')+'；本轮该套件 5/5。','真实 IME/浏览器 selection 未核销；同目录整套 mock 的 CodeEditor.spec.ts 不替代这些 real-CM 断言。'),
 row('已核销：当前语言身份/错误竞态',A('packages/code-editor-vue/src/CodeEditor.vue','198-260','syncLanguage / updateLanguage / isCurrentLanguageRequest'),'watch 触发后按 description 比较；真正加载才增 request；同步 throw 转 rejection；晚到成功/错误均 request+view 守卫。',A('packages/code-editor-vue/src/__tests__/CodeEditor.language.spec.ts','166-230','missing/拒绝/none/过期拒绝/卸载')+'；本轮 9 个语言用例+同步 throw 对照绿色。','已读源码与错误测试；等价列表成功测试中段尚未逐行读，具体未读范围见 inspection。不把 mock spec 或旧红当当轮结论。'),
 row('部分核销：共同 API / 真 textbox 属性',A('packages/code-editor-vue/src/CodeEditor.vue','28-45,262-285,314-333','defaults / access / a11y / expose')+'；'+A('packages/code-editor-vue/src/code-editor.types.ts','126-175','value/emits/handle'),'非严格受控 value；错误/用户事件通道明确；label/labelledBy/describedBy 写 contentDOM；disabled 抑制初始 focus。',A('packages/code-editor-vue/src/__tests__/CodeEditor.a11y.spec.ts','41-87','真实 role/清空/disabled/焦点正反')+'；本轮 6/6。','可见 DOM 属性已核销；真实键盘/屏幕阅读器未核销，ShadowRoot consumer 未运行。'),
 row('已核销：组件卸载/逻辑取消子项',A('packages/code-editor-vue/src/CodeEditor.vue','138-143,145-172,258-260,314-324','watch / unmounted / current-request / expose'),'所有 watch 在 setup scope；卸载先推进 request、清 viewRef，再销毁；保留旧 expose 的 host getter 也跟 view 置空。','真实语言卸载拒绝用例 222-230 绿色；真实文档与 a11y 套件 teardown unmount。','loader 网络 Promise 不被 AbortController 物理取消；不是泄漏确认。页面 provider 与大规模实例尚属 app/宿主验证。'),
 row('部分核销：SFC 类型/发布条目',A('packages/code-editor-vue/src/code-editor.types.ts','136-177','typed emits/expose/theme')+'；'+A('packages/code-editor-vue/src/CodeEditor.vue','314-333','defineExpose / template'),'公开事件 tuple 与 expose null 语义对齐三端；模板只持有宿主，CM DOM 不靠字符串 HTML 注入。','主控69 lint/typecheck 绿色；68/68 当轮测试；实际 pack 条目/root resolve 成功。','独立 SFC consumer 的 vue-tsc 编译/runtime import、SSR hydration 未核销；pack root 可解析不补这两项。')]
D['rxdb-devtools']=[
 row('部分核销：已读身份/授权顺序',A('packages/rxdb-devtools/src/v2/endpoint.ts','249-377','receive / route / malformed / onRequest')+'；'+A('packages/rxdb-devtools/src/v2/authorization.ts','172-182','authorizeOperation'),'negotiation 所有权帧先排除；session open+身份 → capability → 本地 descriptor → mutationPolicy → 登记请求 → provider；不会从对端握手提权。','未运行/未读取当轮完整 conformance 报告；源码顺序已核查，不能据此宣称所有伪造/旧 session 都动态通过。','需要本轮 endpoint/authorization/session/wire 的拒绝与零 provider 调用断言；v1 全路径、transfer 路由全文仍未审。'),
 row('部分核销：当前环引用修复/序列化面',A('packages/rxdb-devtools/src/connector-mask.ts','89-129','WeakMap identity before recursion')+'；'+A('packages/rxdb-devtools/src/serializer.ts','61-218','maskEncryptedFields / safeSerialize / Error / Map / Set'),'先按 namespace/metadata mask；环对象先登记输出，serializer 按当前递归路径判环；BigInt/binary 版本信封；Error/cause 进入同路径。','确认现代码已含 RV-047 环引用修复；未读本轮完整 serializer/边界测试结果，不复制旧红。','metadata 缺省不保证字段 mask；深对象/超大事件、错误 message/stack 敏感值、snapshot 有界需补真实 provider 与主控测试；不宣布全脱敏通过。'),
 row('部分核销：有限 buffer/一次订阅结构',A('packages/rxdb-devtools/src/buffer.ts','36-60','EventBuffer')+'；'+A('packages/rxdb-devtools/src/sequence.ts','6-20','SequenceGenerator')+'；'+A('packages/rxdb-devtools/src/connector-subscribe-once.ts','26-99','subscribeOnce'),'正整数容量；满 FIFO 丢最旧；flush 清空；首 next/error/timeout 结算并清 timer；同步 next 用后置退订守卫。','已读实现；当轮突发、gap detection、慢消费者、sequence 重置/overflow 断言未补，不将 max count 说成 max bytes。','字节级反压、gap 的可见诊断、重连序列边界需验证；一个巨大事件仍不同于无限事件数量。'),
 row('部分核销：本地权限与路径子项',A('packages/rxdb-devtools/src/v2/authorization.ts','70-93,172-182','操作目录/三层授权')+'；'+A('packages/rxdb-devtools/src/provider/logical-path.ts','29-77','段校验/根拒绝')+'；'+A('packages/rxdb-devtools/src/provider/limits.ts','22-56','三方 min limit')+'；'+A('packages/rxdb-devtools/src/provider/read-only-settings.ts','30-38','只读零 host 动作'),'拒绝 .. 与反斜杠；操作根需末段；传输限额各方合法再取 min；settings export 恒拒绝，不先读 host。','不靠 UI disabled；实际 browser/native invoke、upload/snapshot/取消全文与本轮测试尚未核销。','必要：路径穿越零物理访问、大小/配额/取消时句柄关闭、失败批处理结果与 provider descriptor 一致。'),
 row('部分核销：初始化 gate / extension 接线',A('packages/rxdb-devtools/src/connector.ts','227-245,288-297','enabled/browser/opaque-origin gate')+'；'+A('apps/rxdb-devtools-extension/src/devtools/main.ts','26-45','宿主 token wiring'),'enabled=false/非 window 先返回；opaque origin 要显式 opt-in；面板 token 换宿主，不将 Chrome 权限 API 拖到共享 provider。','实际 main 三端 demo 明确 init connector；本轮不跑生产 build/打包 Electron/Tauri，未宣称攻击面全闭合。','普通同 origin 脚本是否可伪造 v2 命令须按协议威胁模型验证；不能把 source/session 当密码学身份。生产消费者 gating/隔离未完成。'),
 row('部分核销：connector detach 路径',A('packages/rxdb-devtools/src/connector.ts','259-280','disconnect')+'；'+A('packages/rxdb-devtools/src/v2/endpoint.ts','267-269,402-416','dispose / settle before response'),'告别先发再关 port；退订 RxDB/listeners/待查询；dispose endpoint + providers；清 helper/buffer/sequence；晚结果必须 settle 成功才回帧。','Chrome relay conformance 源入口未全文审；需要当轮真实 hosts + provider unregister/close 报告。','无完整对象候选：114 tracked 中只读指定路径；registry/openSession/transfer 实现仍需逐段审，不以一处 dispose 推全资源安全。')]

for fw in ['angular','react','vue']:
    name='dev-rxdb-'+fw
    boot={
      'angular':A('apps/dev-rxdb-angular/src/app/app.config.ts','49-65','router/provideRxDB')+'；'+A('apps/dev-rxdb-angular/src/app/app.routes.ts','16-21,54-170','connectLocalAdapter / lazy routes'),
      'react':A('apps/dev-rxdb-react/src/app/app.tsx','11,59-67','singleton / RxDBProvider')+'；'+A('apps/dev-rxdb-react/src/app/router.tsx','28-34,36-147','connectLocalAdapter / routes'),
      'vue':A('apps/dev-rxdb-vue/src/app/App.vue','13-14','setup / provideRxDB')+'；'+A('apps/dev-rxdb-vue/src/router/index.ts','14-19,22-163','connectLocalAdapter / routes')
    }[fw]
    setup=A(f'apps/dev-rxdb-{fw}/src/app/rxdb/setup_rxdb_sqlite-wasm.ts',{'angular':'44-103','react':'25-88','vue':'40-106'}[fw],'setup / plugins / init / test API / connector')
    editor={
      'angular':A('apps/dev-rxdb-angular/src/app/pages/code-editor/code-editor.page.ts','12-25','code signal/theme')+'；'+A('apps/dev-rxdb-angular/src/app/pages/code-editor/code-editor.page.html','1','value-only CodeEditor'),
      'react':A('apps/dev-rxdb-react/src/app/pages/code-editor.tsx','15-22','useState/onChange'),
      'vue':A('apps/dev-rxdb-vue/src/pages/CodeEditorPage.vue','18-28','ref/v-model:value')
    }[fw]
    D[name]=[
      row('部分核销：route/bootstrap 静态对照',boot,'search/working-tree 先 connect 再 lazy 页面；CodeEditor 真实包挂载；Angular 专有 failure-archive/replay 不要求另外两端复制。','三端路由文件全文已读；本轮只有 editor packages 动态通过，不冒充所有路由 E2E 已执行。','未逐页追踪所有实体/插件/backend 与 close；route 清点不是整个应用完成。'),
      row('部分核销：默认 sqlite-wasm 初始化',setup,'模块单例；先 plugins/adapter factory，再 init、test API 与 connector；OPFS 能力探测决定 Worker/SharedWorker，DB 名进入接线。','主控应用基础 test 结果尚待补；初始化实际源码已读，没重跑历史 storage/Node 红。','所有替代 backend、连接失败/刷新同库/provider destroy/worker 关闭需补；Angular e2e 8200 强制 IDB，React/Vue 能力探测，不能叫三端同档位。'),
      row('未核销：业务写入专项尚未读完',boot+'；'+setup,'已读 setup 的 search seed 串行创建，仅是启动测试数据，不是拖拽/批量添加/undo/working-tree 用户写入。','不能用 editor 单测或 seed 成功核销本 C；file-manager/tree/storage/working-tree 的实际 mutation/取消路径需后续逐页对照。','必要：批量部分失败、拖拽冲突、undo/redo 恢复数据、草稿跨路由；本轮不新增 scope 或业务探针。'),
      row('部分核销：editor 输入路径，其余页未核销',editor,'React onChange→state、Vue update:value→ref；Angular demo 是 value-only，内部保留编辑不回写 code signal；三者不是完全同一受控演示。','现有 editor E2E 只挂载/初值；Angular 另断言高亮颜色；无键入/IME/selection 证据。','JSON/snippet/文件剪贴板/ObjectURL/预览取消及页面 a11y 尚未逐页审；editor demo 未传 label，不把 role 可见当可访问名称已验。'),
      row('部分核销：demo test API 边界已识别',setup,'setup 调 installSearchDemoTestApi/getE2eDbName 与 DevTools；应用自身是 demo，不据此要求包发布生产用户自动暴露同样入口。','主控69 lint/typecheck 当轮绿色仅为配置门禁；没有 production artifact 全局对象/fixture 排除的独立检查。','审上游 install 函数 gating 与当前 app production bundle 中调试面；已读调用不等 gating 已验证，不把 private demo 与发布包混为一谈。'),
      row('部分核销：框架特有 boot/editor；复杂页面未核销',boot+'；'+editor,'Angular OnPush/zoneless；React 主入口 StrictMode+模块级 DB；Vue setup provide+route hooks；均按框架原生 provider 面对照。','包级 lifecycle 不替代应用路由销毁；Angular failure-archive/replay，React 闭包/StrictMode，Vue composable 参数切换没有当轮完整用户证据。','必要：路由快速离开重入、错误状态、provider 关闭/异步晚到；应用数量大，清点文件不足全对象结论。')]
    e2e=name+'-e2e'
    ep=A(f'apps/{e2e}/src/code-editor.spec.ts',{'angular':'18-49','react':'3-18','vue':'3-19'}[fw],'现有 editor 用户入口断言')
    cfg=A(f'apps/{e2e}/playwright.config.ts',{'angular':'102-113','react':'70-81','vue':'60-70'}[fw],'当前产物 webServer / Chromium')
    D[e2e]=[
      row('部分核销：editor route→测试映射',ep+'；'+boot,'goto /code-editor → textbox/初值；Angular 加关键字彩色 token；其他 route/spec 清单未逐条核对。','已读真实断言，不按 spec 名假设覆盖；code-editor 请求留主控串行执行。','全路由/业务/backend/模式映射仍必需；单 editor spec 不代表42/39个tracked已审。'),
      row('未核销：隔离/清库专项',cfg+(('；'+A('apps/dev-rxdb-angular-e2e/src/fixtures.ts','251-269','unexpected-failure auto archive')) if fw=='angular' else ''),'server 明确不复用；Angular failureArchive 在 unexpected failed/timedOut 后执行；fixture 中段尚未读完，不能宣称有界传输/清库通过。','editor 文件不创建 DB 数据；共享 RxDB test fixtures、DB 清理、失败 teardown 未全部审。','必要：每用例库名/跨 tab/Worker scope、与实际 UI 不共用错误转换；主控结果仅按执行用例收口。'),
      row('部分核销：已读断言判别力',ep,'visible host 不足，textbox+CREATE TABLE 能检出未挂载；Angular token 多色额外检出 highlight 装饰失效；React/Vue 静态初值更弱。','现有 editor 无 fill/type、composition、selection、readonly toggle、语言切换断言；不把测试名字/通过包装成这些行为。','其他业务异常/零副作用、条件等待、任意 sleep 尚待逐条审；新增测试动作由后续主控专题负责。'),
      row('部分核销：editor 三端差异已落账',ep+'；'+editor,'三端默认 SQL 文档一致；Angular value-only 与 React/Vue 双向状态不同；只有 Angular editor E2E 验高亮颜色。','源码/断言实际对照完成这条子项；不强行复制 Angular 专有回放/归档页面。','search-parity/working-tree/model/file 操作全矩阵未核销；跨端 shared imports 尚需追到真正 suite。'),
      row('未核销：worker/权限/加密专项',cfg+'；'+setup,'Angular 8200 IDB，React/Vue 默认能力选择；浏览器运行并不自动证明实际后端、加密或者测试 hook 安全。','无当轮完整 storage/encrypted/worker/OPFS 报告；不复制已修存储旧问题。','必要：实际 backend 明示、拒绝前零副作用、当前 fixture/test API gating；unsupported 不可当 passed。'),
      row('部分核销：产物/配置；a11y 不足',cfg,'webServer false 避免借用旧 server；Angular 静态 build，React/Vue vite preview；配置只启用 Chromium，Firefox/WebKit 注释不算覆盖。','main69 lint/typecheck 绿色；本子任务未运行 browser/server；trace 配置不是 trace 已产生。','search/working-tree a11y、focus/keyboard、console/network、当前 build SHA 与截图/trace需主控实际结果；IMEs 另列必需。'),
      row('未核销：框架专项用户链路',boot+'；'+ep,'只读到框架 bootstrap 与 editor spec；未把 package TestBed/RTL/Vue mount 证明升格成应用 E2E。','Angular failure-archive 专项中段、React 特有 render/权限/remote-cache、Vue composable 参数/选择/展开路径尚需具体用例证据。','须按路由、宿主、运行参数补本轮结果；无需等待外部宿主才核销已完成 editor 小专题。')]

D['dev-rxdb-miniprogram']=[
 row('部分核销：发布档位声明',A('apps/dev-rxdb-miniprogram/package.json','12-32,39-60','Taro scripts / React18 private demo')+'；'+A('apps/dev-rxdb-miniprogram/src/runtime-preflight.ts','81-85','currentDemoRuntime'),'只接 weapp/tt/alipay；其余 Taro build 脚本存在不代表 adapter 支持；private demo 与 React18/Taro 隔离。','主控69 lint/typecheck 绿色；实际三平台 build/代码包资源不在本子任务执行。','需 current build 的平台/大小/wasm SHA；没有所有 Taro 平台已支持的结论。'),
 row('部分核销：轻量预检先于开库',A('apps/dev-rxdb-miniprogram/src/runtime-preflight.ts','96-163','random/capability/references')+'；'+A('apps/dev-rxdb-miniprogram/src/rxdb-demo.ts','316-340','prepareRuntime before heavy imports'),'硬依赖缺失先 blocked/throw；polyfillable 明示；先 runtime.prepare，再重包/glue，再 adapter capability；安全随机来源不靠 Math.random。','源码已追；real host 缺能力/随机池耗尽/补给失败当轮未测；mock 能力 presence 不是熵质量。','必要：真实逻辑层 reject 先于 connect、weapp/tt/alipay runtime 来源/错误；由主控选择专用宿主验证。'),
 row('部分核销：旧页面资源释放路径',A('apps/dev-rxdb-miniprogram/src/rxdb-demo.ts','65-68,200-209,286-289,316-318','releaseActiveDemo / pendingDispose / closeAfterPendingWork')+'；'+A('apps/dev-rxdb-miniprogram/src/pages/index/index.tsx','151-213','start / unload / late demo release'),'启动等旧 dispose/reconnect/benchmark；unload 清 demoRef；迟到 open 在 unloaded 后释放，不继续自检。','现代码已包含旧 RV-051 释放修复，不复制 Node/卸载旧红；主控 app test/new lifecycle probe 待补。','并发 open 尚非完整动态验证；初始化失败中间资源、失败 disconnect、反复重进平台真实测试必需。'),
 row('部分核销：Todo repository/重连路径',A('apps/dev-rxdb-miniprogram/src/rxdb-demo.ts','138-158,241-275,307-313,365-374','CRUD / reopen / SQL probe'),'save/remove 后重查；重连验证通过 adapter SQL 独立读探针，非只读 UI 徽标；demo DB 名固定。','小程序 E2E suite 的真实 UI mutation 与 reLaunch 案例已读；没有本轮真实 DevTools执行结果。','reLaunch 不是应用进程/设备 crash；VFS 错误、完整重开、crash-safe 能力不得超额承诺。'),
 row('部分核销：测试缺口已更正，资源构建未审全',A('apps/dev-rxdb-miniprogram/package.json','39-80','精确依赖/Taro隔离')+'；'+A('apps/dev-rxdb-miniprogram/src/rxdb-demo.ts','324-328','glue/wasm引用'),'manifest 实际有 src/__tests__ 与 config/__tests__，原计划“未发现测试”只是旧导航不能当当前事实；WASM 引用需与 assets 插件产物对应。','本轮未读完 config/plugins/benchmark tests，不能凭 tracked 文件名认定通过。','必要：assets/lazy-chunk/realm 插件生产输出/尺寸与 config unit 结果；40 tracked 中只读指定内容，仍 partial。')]
D['dev-rxdb-miniprogram-e2e']=[
 row('部分核销：真实宿主前置与归属',A('apps/dev-rxdb-miniprogram-e2e/src/devtools-environment.ts','37-79,96-117','CLI/project/build/service-port fail-fast')+'；'+A('apps/dev-rxdb-miniprogram-e2e/src/fixtures.ts','16-27,61-78','owned / connect / launch'),'CLI/project/dist 缺失抛错非 skip；自 launch owned 才 close；接用户既有 ws 非 owned，不擅关 GUI。','本轮未启动 DevTools；不会以浏览器 mock 代替。请求已限定专用 project/USER_DATA_PATH。','必要：真实 CLI/基础库/平台及测试专用目录；当前环境可用性未测，不能根据源路径判断已安装。'),
 row('部分核销：自包含逻辑层探针设计',A('apps/dev-rxdb-miniprogram-e2e/src/runtime-probes.ts','27-75','readRandomSource/drawRandomValues explicit args')+'；'+A('apps/dev-rxdb-miniprogram-e2e/src/runtime-bootstrap.spec.ts','18-44','runtime source / SQLite version'),'toString 探针参数自包含，无 Node imports/闭包；UI 与随机实现来源两条读数；sqlite_version 证明实际 SQL，不只 presence。','已读源码，旧 Node 引导回调问题不重报；runtime self-check 徽标仍依赖被测程序，不叫独立 CRUD证明。','还须实际 automator 逻辑层运行与缺 glue/runtime 负例；Node/happy-dom单测不能核销。'),
 row('部分核销：随机耐久断言边界',A('apps/dev-rxdb-miniprogram-e2e/src/secure-random.spec.ts','5-28,38-82','pool / refill / overdraw')+'；'+A('apps/dev-rxdb-miniprogram-e2e/src/runtime-probes.ts','42-74','cross-evaluate registry'),'跨批次 Set 检重复/零；批间250ms明确让位；超池同 tick 必须耗尽拒绝，不用随机不同证明密码学安全。','设计有正/负对照，统计表象只能证明池行为；真实来源与耗尽当轮未运行。','必需实际桥接/补给失败、池来源证据；250ms 不是性能/补给 SLA，通过不能推广真机所有调度。'),
 row('部分核销：CRUD 与持久化测试设计',A('apps/dev-rxdb-miniprogram-e2e/src/todo-crud.spec.ts','13-54','真实 UI / reLaunch')+'；'+A('apps/dev-rxdb-miniprogram-e2e/src/launch-persistence.spec.ts','16-38','serial reset→pending→pass→reset'),'独立标题；UI add/remove 与数量；清探针后 pending→reLaunch passed→再清回 pending，避免恒真。','toggle 用例只检条目未消失，不检 completed 状态；reLaunch 仅页面重进，不等完整应用进程重启。','必须补 completed 状态、完整 close/launch、落盘/错误路径实际报告；不能把注释“跨启动”扩大成 crash recovery。'),
 row('部分核销：单 worker/归属；设备隔离缺口',A('apps/dev-rxdb-miniprogram-e2e/playwright.config.ts','25-38','one worker / no browser')+'；'+A('apps/dev-rxdb-miniprogram-e2e/src/fixtures.ts','61-78','owned teardown / reLaunch'),'一个 DevTools worker；reset 作用于固定 demo 库，需专用测试 project；non-owned session 不关闭。','8/15 tracked 已读完，README/demo-page/lifecycle spec/配置尚未全文读；无当前真机执行记录。','设备矩阵 weapp/tt/alipay、失败 teardown、重复两轮与测试目录清理未核销；不能擅接个人 GUI 清数据。')]
D['rxdb-devtools-extension']=[
 row('部分核销：已读四段路由/导航身份',A('apps/rxdb-devtools-extension/src/background/index.ts','19-28','sender id/frame gate')+'；'+A('apps/rxdb-devtools-extension/src/background/background-core.ts','142-214','INIT-owned tab / old-map release')+'；'+A('apps/rxdb-devtools-extension/src/content/bridge-core.ts','34-84','source/origin/direction'),'panel INIT 绑定 tab；content 上行必须自己扩展+主帧；同 port 换 tab 已删旧映射；导航推进 epoch；bridge 先校验再 adopt 私有 port。','现有 RV-048 map 修复可见，不报旧红；unit/真实错误 frame/session/document 结果等待主控。','端点才做 payload/session 严校验；relay 不凭 source 常量保证同 origin 脚本可信，document 导航与旧响应实际拒绝尚需证明。'),
 row('部分核销：发布权限/CSP；授权晚到待证',A('apps/rxdb-devtools-extension/manifest.config.ts','38-70','optional-only / desktop-dev')+'；'+A('apps/rxdb-devtools-extension/src/devtools/services/inspected-page-access.service.ts','26-34,66-83,100-121','scheme / requestAccess / revision refresh'),'发布只有 scripting + optional hosts；desktop-dev 单独 localhost 静态权限；unsupported scheme 明示；refresh revision 守卫，但 requestAccess await 后没有同守卫。','新增 FE-PENDING-002 deferred grant 正对照/导航/销毁三个用例交主控，未 confirm；不说成 Chrome 权限绕过。','production CSP/资源暴露/实际授权 UI 未核销；E2E 副本静态授权 variance 不能代替 optional grant。'),
 row('部分核销：port cleanup/退避，授权取消待证',A('apps/rxdb-devtools-extension/src/devtools/services/port.service.ts','55-86,120-124,148-203','subscribe / epoch / reconnect / disconnect')+'；'+A('apps/rxdb-devtools-extension/src/content/bridge.ts','27-45','adoptPort close old'),'重连1s指数到30s；销毁停 timer、清 listeners/disconnect；导航取消 activation 并推进 epoch；旧私有 port 先摘 handler 再 close。','requestAccess 晚到是否重新 activate 待 probe；完整队列/巨大帧/worker reload/断开 request 关联未执行。','PortService 本身没有 byte queue/请求表，反压/超时属于端点，不能仅看到 reconnect 就核销这些子项。'),
 row('部分核销：provider token 接线',A('apps/rxdb-devtools-extension/src/devtools/main.ts','26-45','environment initializer / transport / host / lazy endpoint file channel')+'；'+A('packages/rxdb-devtools/src/v2/authorization.ts','172-182','本地三层授权'),'bootstrap 先实例化端点；文件 factory 每次取当前 endpoint，避免新 session 沿用旧实例；真实 permission 必须在 provider 判定，不只 disabled button。','modules 面板能力 UI 全文件不属本轮已完成对象；只追已读接口边界，不将 unit disabled 当权限证明。','actual DB/files/settings provider、只读 mutation 拒绝、snapshot 脱敏与批失败需真实用户测试。'),
 row('部分核销：Chrome/Electron 变体边界',A('apps/rxdb-devtools-extension/manifest.config.ts','13-25,61-70','desktop-dev variant')+'；'+A('apps/rxdb-devtools-extension/src/devtools/services/inspected-page-access.service.ts','112-134','no permissions host variance'),'Electron 无运行时 permissions 的已声明差异；app scheme unsupported；默认发布不能为它增加 all_urls 静态权限。','Chrome fixture 真实四段但 DevTools 宿主补 API；本子任务未跑 Chrome/packaged Electron。','Electron/Tauri integration 与自定义生产 scheme 未核销；主控既有宿主结果必须注明适用 build，不用 chrome mock 推全宿主。'),
 row('部分核销：测试/产物 provenance',A('apps/rxdb-devtools-extension-e2e/tools/prepare.mjs','32-58','current build copy / test-only manifest variance')+'；'+A('apps/rxdb-devtools-extension-e2e/src/extension.fixture.ts','39-102','host shim / persistent Chromium')+'；'+A('apps/rxdb-devtools-extension/src/devtools/services/inspected-page-access.service.spec.ts','106-240','现有 unit 对照'),'unit Chrome stubs、conformance、unpacked E2E、packaged Electron 四档不能混称；新增 probe 后旧 lint 输入不覆盖新文件。','main69 lint/typecheck 绿只按旧输入面承接；unit 全套/新增 probe/extension E2E 已排验证请求，等待主控补结果。','38 tracked 只读11主体/配置与1测试，其他入口/测试/生产dist仍未全文审；不是完整对象候选。')]
D['rxdb-devtools-extension-e2e']=[
 row('已核销：准备/fixture设计；动态产物待证',A('apps/rxdb-devtools-extension-e2e/tools/prepare.mjs','32-58','rm out / cp builds / variance')+'；'+A('apps/rxdb-devtools-extension-e2e/src/extension.fixture.ts','82-102','persistent context/worker id'),'先清 staging，再复制真实两个 dist；缺 manifest/read失败显式抛；Chromium 临时 profile，真实 worker URL 取 id；teardown close。','9/9 tracked 全文读；resolved graph e2e depends prepare、prepare depends extension+devtools build；本轮尚未执行。','必须冷准备 SHA/manifest 与当前源码对应、browser版本/真实 profile 清理；复制成功不证明源 dist 不陈旧。'),
 row('部分核销：只证明正向协商设计',A('apps/rxdb-devtools-extension-e2e/src/relay.spec.ts','116-175','handshakeThroughRelay / session identity / ACK')+'；'+A('apps/rxdb-devtools-extension-e2e/src/extension.fixture.ts','39-79','mock devtools API only'),'开panel→reload→手工 emit onNavigated；要求 HELLO 经四段、offers 同 session、仅一个v2 ACK且无legacy ACK。','不按消息条数误判多 HELLO；身份判据有判别力，但当前文件没有错 tab/frame/session、页面伪造、旧 document 的反向 mutation 断言。','本轮 Chrome 执行待主控；正向 ACK 不核销身份攻击全矩阵，DevTools 真宿主是 variance。'),
 row('未核销：请求/资源压力专题',A('apps/rxdb-devtools-extension-e2e/src/extension.fixture.ts','89-102','context ownership')+'；'+A('apps/rxdb-devtools-extension-e2e/src/relay.spec.ts','134-199','只有两条 relay tests'),'context use 后 close 是已读归属；现套件没有并发 request/timeout/乱序/tab关闭/extension reload/巨大消息断言。','测试存在不等这些路径已测；不存在的断言明确列缺口，不写假通过。','需专门并发/取消/timeout/port重开与句柄计数，用 endpoint unit 不能替真实 reload。'),
 row('部分核销：none 零业务帧；实际 provider未验',A('apps/rxdb-devtools-extension-e2e/fixture/index.html','30-75','RxDB event substitute / throwing manager getters')+'；'+A('apps/rxdb-devtools-extension-e2e/src/relay.spec.ts','177-197','none before/after handshake'),'同tick init事件→握手→再发事件；四车道录制；none 下 EVENT/DB_INFO/BRANCHES 都零，避免“尚未连接”假阴性。','fixture 是最小事件 RxDB 替身、真实发布 connector；没有实际 DB/files/settings mutation、readonly拒绝/snapshot/脱敏可见结果断言。','本轮执行未验；none 特例不能推广 full+omit/readonly provider全权限。补真实 provider 用户路径。'),
 row('已核销：适用范围/未验清单（不等运行通过）',A('apps/rxdb-devtools-extension-e2e/playwright.config.ts','16-32','one worker / trace / fresh server')+'；'+A('apps/rxdb-devtools-extension-e2e/src/extension.fixture.ts','20-31,82-102','DevTools shim / real relay'),'两个variance：prepare 加 localhost 静态 host 权限；普通扩展panel shim devtools.*；其余四段真实；配置无Electron/Tauri矩阵。','源码全部9文件已读，设计结论可提交收口候选；主控 lint/typecheck通过，但 E2E runtime仍待请求。','trace设置不是当前trace；skip/browser失败/临时profile/产物SHA必须主控报告；不能称真实DevTools宿主或生产optional权限验收完成。')]

coverage={}
for n in ['code-editor','code-editor-angular','code-editor-react','code-editor-vue']:
    p=validation/'framework-editor-coverage'/n
    cs=json.loads((p/'coverage-summary.json').read_text())['total']
    junit=ET.parse(p/'junit.xml').getroot()
    coverage[n]={'tests':int(junit.attrib['tests']),'failures':int(junit.attrib['failures']),'errors':int(junit.attrib.get('errors',0)),'skipped':sum(int(x.attrib.get('skipped',0)) for x in junit.findall('testsuite')),'metrics':{k:cs[k] for k in ['statements','branches','functions','lines']},'summaryPath':str(p/'coverage-summary.json'),'junitPath':str(p/'junit.xml'),'newProbesIncluded':False}
pack=json.loads((validation/'packed-consumer-entry-check.json').read_text())
pack4={x['project']:x for x in pack['packages'] if x['project'].startswith('code-editor')}
mainGate={f:json.loads((validation/f).read_text()) for f in ['all-object-strict-lint-status.json','all-object-typecheck-status.json','framework-editor-coverage-status.json']}
inspection['evidenceSources']=[{'path':str(validation/f),'sha256':hashlib.sha256((validation/f).read_bytes()).hexdigest(),'readMode':'结构化主控结果，只按本文具体字段承接'} for f in ['packed-consumer-entry-check.json','all-object-strict-lint-status.json','all-object-typecheck-status.json','framework-editor-coverage-status.json']]
inspection['evidenceSources'] += [{'path':v[k],'sha256':hashlib.sha256(Path(v[k]).read_bytes()).hexdigest(),'readMode':'当轮四指标 total / JUnit suite 计数'} for v in coverage.values() for k in ['summaryPath','junitPath']]

mark='## 2026-10-05 frontends 并行评审收束'
filemap={r['path']:r for r in inspection['files']}
summaries=[]
changed=[]
for x in scope:
    n=x['object'];items=D[n]
    plan=root/x['plan'];record=root/x['record'];pt=plan.read_text()
    titles={m.group(1):m.group(2).strip() for m in re.finditer(r'^\|\s*(C\d+)\s*\|\s*([^|]+)\|',pt,re.M)}
    if len(titles)!=len(items):raise RuntimeError((n,len(titles),len(items)))
    tracked=list(x['sourceSha256']);seen=[filemap[p] for p in tracked if p in filemap]
    full=sum(r['readComplete'] for r in seen)
    unread=[p for p in tracked if p not in filemap]
    partial=[{'path':r['path'],'readRanges':r['displayedRanges']} for r in seen if not r['readComplete']]
    candidate=n in ['code-editor','rxdb-devtools-extension-e2e']
    status='🟡 完整范围源码/测试设计评审候选；运行未验面已明确留账' if candidate else '🟡 partial；不升格为全对象完成'
    summary={'object':n,'trackedFiles':len(tracked),'inspectedTrackedFiles':len(seen),'fullyDisplayedTrackedFiles':full,'unreadFiles':unread,'partiallyReadFiles':partial,'wholeObjectCandidate':candidate,'status':status,'criteria':[{'C':f'C{i+1}','title':titles[f'C{i+1}'],**item} for i,item in enumerate(items)]}
    summaries.append(summary)
    inspection['conclusions'][n]=summary
    evidence=base/'objects'/f'{n}.md';evidence.parent.mkdir(exist_ok=True)
    head=f'''{mark}\n\n- 唯一对象：`{n}`，日期 **2026-10-05**；{status}。\n- scope 是范围，不是阅读证明：{len(seen)}/{len(tracked)} 个 tracked 有实际展示行，{full} 个全文已展示；未读 {len(unread)} 个，其余为分段。精确路径/行段/当前 hash 在 `{base/'file-inspection.json'}`。不把约84文件阶段快照或本轮增加的分段读数说成939文件全部已读。\n- 本子任务没有执行 Nx test/build/e2e/coverage/server/browser，没有改业务/依赖/原测试、没有操作 Git 索引、没有派嵌套 agent。源码推导、主控动态结果、未验证项分开。\n- 历史 RV-056/057、存储/Node 引导红报告不是本轮状态；当前已修代码按当前符号审查。未修 bug 不自动阻止评审收口，未读与未验则必须明确处理。\n\n### 逐 C 证据、事件顺序、断言与必要待证\n\n'''
    table='| C / 专题 | 本轮结论 | 实际生产路径 / 符号行 | 事件时序 / 不变量 | 测试判别力 / 已用证据 | 必要未验与补证动作 |\n|---|---|---|---|---|---|\n'
    for i,item in enumerate(items):
        c=f'C{i+1}'
        cells=[c+' '+titles[c],item['status'],item['production'],item['sequence'],item['tests'],item['gap']]
        table+='| '+' | '.join(z.replace('|','\\|').replace('\n',' ') for z in cells)+' |\n'
    proofs='\n### 本轮门禁与适用边界\n\n'
    proofs+=f'- 主控69项目 strict lint、69项目 typecheck 的 status exitCode 均为0，head为 `{mainGate["all-object-typecheck-status.json"].get("headAtFinish")}`、cacheDisabled=true、重任务并发1、测量期间输入无变化。仅承接纳入名单和其测量输入；新加 probe 不在旧报告里就不声称其 lint/type 已过。状态文件：`{validation/"all-object-strict-lint-status.json"}`、`{validation/"all-object-typecheck-status.json"}`。\n'
    if n in coverage:
        v=coverage[n];m=v['metrics'];pp=pack4[n]
        proofs+=f'- editor 当轮：**{v["tests"]} tests / {v["failures"]} failed / {v["skipped"]} skipped**；四指标 statements={m["statements"]["pct"]}%、branches={m["branches"]["pct"]}%、functions={m["functions"]["pct"]}%、lines={m["lines"]["pct"]}%。JUnit `{v["junitPath"]}`；coverage `{v["summaryPath"]}`。不是使用旧 baseline，Vue mock 与 real-CM suite 的证明面分开。\n'
        proofs+='- framework-editor-coverage 总命令 exitCode=1 的唯一失败为 rxdb-angular（249 pass /16 fail，mock 未命中，主控归因）；**不属于本 editor 包**。本包 JUnit 零失败独立承接。\n'
        proofs+=f'- 实际 pack root：`{root/pp["resolvedPublishedPackageRoot"]}`；packedFileCount={pp["packedFileCount"]}，missingDeclaredEntries=[]，root 可解析；tarball SHA `{pp["tarballSha256"]}`。`{validation/"packed-consumer-entry-check.json"}` 明确 declarationCompilationExecuted=false、runtimeImportExecuted=false，不能称 typed/runtime consumer 已通过。\n'
    else:
        proofs+='- 普通 lint/typecheck 不证明浏览器、真实小程序、privileged provider 或全路由用户链路；相应 test/E2E 动态结果尚由主控统一追加，本轮不伪造执行次数/覆盖率。\n'
    if 'angular' in n or n=='rxdb-devtools-extension':
        proofs+='- Angular 工具已先调用 list_projects：只发现 examples/angular-todo（含 tmp baseline），不是这些 Nx project。get_best_practices 报 Unexpected response type；记录为工具限制，只读审查继续，不拿 examples frameworkVersion 冒充本项目适配指南。\n'
    proofs+=f'- 本组新增仅两份 bounded review-parallel spec，共6个用例（ngModel/FormControl/value 3，permission grant/导航/销毁3），尚待主控。新候选在 `{base/"findings.pending.md"}`，未确认、不写总 RV。\n'
    proofs+=f'- 验证请求数组 `{base/"validation-requests.json"}`；真实 IME/selection 补证协议 `{base/"browser-required.md"}`。未到的结果不阻止已充分的小 C 独立核销，也不把全应用的未审项掩掉。\n'
    criteria='\n### 完成条件逐项证据与候选判定\n\n| 原完成条件 | 当前状态 | 具体证据 / 余项 |\n|---|---|---|\n'
    criteria+=f'| 全部受控文件清点并实际检查 | {"候选满足：全文行展示已覆盖范围" if candidate else "未满足：仍 partial"} | scope {len(tracked)}；有实际行{len(seen)}，全文{full}；未读/分段逐文件见 inspection，不能用 manifest 替代。 |\n'
    criteria+='| 每个 C 有明确结论与补证动作 | 满足本轮记账；不表示每个C都通过 | 上表逐C有核销/部分/未核销及具体动作；完整动态核销仅按真实报告。 |\n'
    criteria+='| 不变量/权限由符号锚定，动态主张有当轮环境 | 已读专题有锚；未审专题不冒称证明 | 上表锚定调用者/被调用者与事件顺序；source-only、Node、happy-dom、真实host区分。 |\n'
    criteria+='| 执行/缓存/skip/失败/覆盖测量面登记 | 主控已有结果已承接，待验证仍显式 | 本轮门禁表和主控 status/JUnit；新probe、browser/host结果尚待，不假定通过。 |\n'
    criteria+='| 上下游/适用三框架/多宿主对照 | 已读接口有对照；完整host矩阵未核销 | common editor defaults/change/error/handle；Angular CVA额外面；Chrome静态授权+DevTools shim variance；小程序reLaunch不等进程重启。 |\n'
    criteria+='| 新问题去重/根因/最小修法/边界与复验 | 当前仅2候选待主控；无新confirm | FE-PENDING-001/002 记录公开触发与最小修法；不复制旧 RV，不将未验证变confirm；本轮不改业务。 |\n'
    criteria+='| 有证据的品味结论，评审/修复/发布分开 | 🟡；'+('可提交本对象范围评审收口候选' if candidate else '只能partial')+' | '+('全部文件与C设计结论已落盘；需主控接受明确未验面的收口边界，不能标所有浏览器/consumer专题通过。' if candidate else '必须先补未读生产/测试/配置；不因已有门禁/单bug修复宣布对象完成。')+' |\n'
    body=head+table+proofs+criteria
    evidence.write_text('# '+n+'：2026-10-05 逐 C 实审证据\n\n'+body)
    for p in [record]:
        text=p.read_text();text=text.split('\n'+mark)[0]
        p.write_text(text.rstrip()+'\n\n'+body)
    plan_note=head+table+f'\n完整当轮门禁、完成条件逐项证据：`{record}`；本对象独立证据副本：`{evidence}`。\n'
    text=pt.split('\n'+mark)[0]
    # 旧日期执行历史保留；专项表的当前状态改为本轮真实结论，避免旧RV红成为当前状态。
    def replace_state(m):
        line=m.group(0);c=re.match(r'\|\s*(C\d+)',line).group(1);parts=line.split('|')
        parts[-2]=' '+items[int(c[1:])-1]['status']+'（详本轮逐C表） '
        return '|'.join(parts)
    text=re.sub(r'^\|\s*C\d+\s*\|.*$',replace_state,text,flags=re.M)
    plan.write_text(text.rstrip()+'\n\n'+plan_note)
    changed += [str(plan),str(record),str(evidence)]

inspection['scopeTotals']={'trackedScopeFiles':sum(len(x['sourceSha256']) for x in scope),'actuallyDisplayedTrackedFiles':sum(x['inspectedTrackedFiles'] for x in summaries),'fullyDisplayedTrackedFiles':sum(x['fullyDisplayedTrackedFiles'] for x in summaries),'objects':len(scope),'allTrackedManifestIsReadProof':False,'mainEarlier84FileSnapshotIsNotAll939Files':True}
inspection['sourceFingerprintAudit']={x['object']:{'changedSinceScope':[p for p,h in x['sourceSha256'].items() if hashlib.sha256((root/p).read_bytes()).hexdigest()!=h],'note':'hash扫描只是输入清点，不记录为阅读'} for x in scope}
(base/'file-inspection.json').write_text(json.dumps(inspection,ensure_ascii=False,indent=2)+'\n')
(base/'c-closure.json').write_text(json.dumps({'date':'2026-10-05','objects':summaries,'editorEvidence':coverage,'wholeObjectCandidates':['code-editor','rxdb-devtools-extension-e2e'],'candidateIsNotAllCVerified':True},ensure_ascii=False,indent=2)+'\n')
(base/'browser-required.md').write_text('''# 必需但未验证的 browser / consumer 证据（2026-10-05）

此清单是收口交接，不扩本轮 scope、不新增 probe，不由本子任务启动 browser/server。

## Editor 三端真实输入 / selection

- 用当前 build、真实浏览器和原生输入法，记录 OS/输入法/浏览器版本。先 caret/range selection，再中文或日文 composition 中宿主 append/格式化/value 回写；记录 compositionstart/update/end、beforeinput/input、CM doc 与 DOM Selection、用户 change 次数。
- 必须有普通键入/纯外部写入正反对照；相同回写不 dispatch、外部不进 undo、用户编辑仍可 undo；只读/disabled 切换后不丢组合文本，不抢焦点。
- UTF-16 fixed-seed、view.state.selection、合成 composition 事件或 happy-dom 都不能被改称原生 IME/真实 DOM Selection 已通过；Playwright keyboard.insertText 也不等原生输入法。
- Tab/Shift+Tab 与 indentWithTab 开关、label/labelledBy/describedBy 清空、屏幕阅读器、ShadowRoot/SSR、长文档滚动/重复挂载的真实证据分开。现有 app editor E2E 仅初值/挂载，Angular 多一条颜色断言。

## 独立 consumer

- 主控已经实际 pack、检查declared entries并新consumer root解析23/23，editor4齐全；Angular publish root是 dist/packages/code-editor-angular。
- 尚未做 declaration compilation 或 runtime import。独立strict TS / Angular template / React props / Vue SFC consumer 编译与挂载，依赖必须来自tarball非工作区alias；只加载SQL的bundle、缺语言chunk失败/错误回调另验。

## Extension / mini-program

- Extension现两条E2E仅v2正向协商/none零帧；DevTools API shim和localhost静态host权限两个variance明示。不证明wrong frame/tab/session、实际provider mutation拒绝、optional授权UI、真实DevTools宿主或Electron/Tauri。
- 小程序DevTools仅专用project/USER_DATA_PATH运行；不要接个人GUI自动清库。reLaunch是页面重进，不等完整进程/真机crash重启；安全随机指纹只验池耐久，不证明密码学熵质量。

## 收口纪律

以上必要证据未到时相关C保持部分/未核销；已充分的纯函数/竞态/生命周期子项独立核销。对象评审候选不等所有C通过，更不等修复/发布就绪。晚到的两个bounded probe和app tests由主控补结果；本轮不空转等待。
''')
(base/'handoff.md').write_text('''# frontends 交付（2026-10-05）

15对象的各计划/结果已写当轮逐C生产符号、事件顺序、测试判别力、跨端/取消/生命周期与必要待证。详见c-closure.json和objects/。

- 独立核销：共享语言解析/真实loader与元数据、错误载荷/共同默认契约；三个绑定语言请求代次/陈旧成功与失败拒绝；Angular/Vue已读销毁子项；共享/三端真实contentDOM属性计算与正反对照。核销口径见逐C表，不扩大成IME/整个app。
- 全范围评审候选：code-editor（21/21文件全文行展示）、rxdb-devtools-extension-e2e（9/9文件全文行展示）。后者是suite设计/缺口评审候选，不是本轮E2E已运行通过。两者需主控按明确未验面接受收口，不直接修改总完成台账。
- 其余13对象partial；source入口已审不等全部tracked文件、全部业务路线或全部host验过。939是范围；实际文件/行段读数以file-inspection.json为准。
- 主控editor4真实JUnit：107/76/34/68 tests均0fail/0skip；四指标与coverage文件逐包写入结果。唯一rxdb-angular mock失败不归editor。69lint/69typecheck通过仅承接其测量输入。
- 主控实际pack23/23，editor4条目齐全/root可解析；不是typed/runtime consumer。Angular发布root与源root明确分开。
- 新候选仅FE-PENDING-001（ngModel/CVA与后到value优先级）、FE-PENDING-002（授权晚到导航/销毁状态）。主控未返复验时仍待证、不confirm、不写RV。两个spec共6例，正对照齐，不增业务/依赖/旧test。
- 不等整队列；主控统一补app tests、新probe与新文件lint/必要类型编译。browser-required.md列真实IME/DOM selection/consumer/privileged host必须补什么，不能以happy-dom、coverage或pack替代。
''')
changed += [str(base/'file-inspection.json'),str(base/'findings.pending.md'),str(base/'validation-requests.json'),str(base/'c-closure.json'),str(base/'browser-required.md'),str(base/'handoff.md'),str(base/'read-inspection.py'),str(base/'finalize-documents.py'),str(root/'packages/code-editor-angular/src/__tests__/review-parallel-form-value.spec.ts'),str(root/'apps/rxdb-devtools-extension/src/devtools/services/review-parallel-access-navigation.spec.ts')]
(base/'changed-files.json').write_text(json.dumps({'date':'2026-10-05','files':sorted(set(changed+[str(base/'changed-files.json')])),'notModified':['业务代码','依赖','原测试','其它对象','root README/总计划/总台账/RV','git index']},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'objectsWritten':len(summaries),'Citems':sum(len(D[x['object']]) for x in scope),'scopeTotals':inspection['scopeTotals'],'wholeObjectCandidates':['code-editor','rxdb-devtools-extension-e2e'],'changedFiles':len(set(changed))+1},ensure_ascii=False,indent=2))
