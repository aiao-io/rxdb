# R2-01：原 C 与 helper / 绑定 / 浏览器的责任边界

日期：2026-10-05；唯一评审对象 `code-editor`。此分工是证据归属，不删除原 C 的最低场景；未验浏览器/设备绝不改成“不适用”。其他对象只读追踪，无修改。

根路径：`/Users/jimmy/Documents/aiao/rxdb`。源码精确区间与摘要见本目录 `file-inspection.json`；运行证据出处见 `inherited-evidence.json`。

## 共享层实际拥有的能力

| 公开能力 | 生产锚点 | 可独立证明的范围 | 不能由它证明的范围 |
| --- | --- | --- | --- |
| `computeMinimalDocumentChange` | `packages/code-editor/src/document-sync.ts:54-69` | UTF-16 字符串的单个最小前后缀替换；相同内容返回 null；不修改输入，无 view 状态 | selection 映射、输入时序、IME、history、scroll、只读的实际用户输入 |
| `resolveCodeEditorLanguage` / `isSameResolvedLanguage` | `packages/code-editor/src/language-resolution.ts:31-50,71-81,101-109` | none/not-found/found 与 description identity；同描述的新容器不影响结果 | 谁发起 load、请求版本、何时 reconfigure、销毁后丢弃晚到结果 |
| `codeEditorLanguageNotFound` / `codeEditorLanguageLoadFailed` | `packages/code-editor/src/language-error.ts:28-70` | 冻结载荷、稳定 kind/language/message、原 cause | 三端输出/回调/emit 的事件次数；物理网络资源失效 |
| `buildCodeEditorContentAttributes` / `shouldAutoFocusCodeEditor` | `packages/code-editor/src/accessibility.ts:61-85` | 字典内容、空项不产生属性、新对象、禁用/只读的布尔判定 | 字典是否写到真实 contentDOM；键盘/Tab、屏幕阅读器是否读到；实际抢焦点 |
| 主题类型、语言描述/loader | `packages/code-editor/src/index.ts:11-20`；`packages/code-editor/src/languages.ts:7-31,58-69,72-232` | light/dark 类型；自定义结构契约；15个内置描述+上游元数据；动态 parser import | 主题/只读扩展组装属于绑定；消费者 bundler 的 initial/chunk 图与资源加载属于 C5 动态取证 |

字符串、解析、aria 和 error 构造是纯 helper；`LanguageDescription.load()` **不是纯函数**，上游会缓存加载 promise/support。共享层创建模块级语言描述、Map/Set，不创建 `EditorView`、不注册 DOM 监听、不拥有销毁 hook；“没有隐藏编辑器”不等于“整个语言模块没有状态”。Node runtime probe已由主控执行通过，记录见`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/code-editor/consumer-results.json`；仍不将Node执行当浏览器行为证明。

## 三端实际接线，非名字猜测

| 责任 | Angular | React | Vue |
| --- | --- | --- | --- |
| value 差量 / 外部回写不进 history | `packages/code-editor-angular/src/code-editor.ts:331-342,406-419` | `packages/code-editor-react/src/CodeEditor.tsx:227-236` | `packages/code-editor-vue/src/CodeEditor.vue:145-162` |
| 本地 change 与外部回写隔离 | `packages/code-editor-angular/src/code-editor.ts:132-138` | `packages/code-editor-react/src/CodeEditor.tsx:354-358` | `packages/code-editor-vue/src/CodeEditor.vue:109-115` |
| 请求号 + view identity 守卫 | `packages/code-editor-angular/src/code-editor.ts:470-516` | `packages/code-editor-react/src/CodeEditor.tsx:461-512` | `packages/code-editor-vue/src/CodeEditor.vue:207-259` |
| 真实只读/禁用扩展 | `packages/code-editor-angular/src/code-editor.ts:582-595`（另有 CVA 禁用合并） | `packages/code-editor-react/src/CodeEditor.tsx:404-411` | `packages/code-editor-vue/src/CodeEditor.vue:262-271` |
| aria facet 落点 | `packages/code-editor-angular/src/code-editor.ts:572-580` | `packages/code-editor-react/src/CodeEditor.tsx:416-421` | `packages/code-editor-vue/src/CodeEditor.vue:282-285` |
| view 创建/销毁 | `packages/code-editor-angular/src/code-editor.ts:301-305,386-391` | `packages/code-editor-react/src/CodeEditor.tsx:361-376` | `packages/code-editor-vue/src/CodeEditor.vue:118-143` |
| 结构化语言错误通道 | `aoLanguageError.emit` | `onLanguageError` | `emit('language-error', payload)` |

三端公共入口实际导出 `CodeEditor`、`CodeEditorSetup`、`CodeEditorTheme`，框架 props/handle 类型按原生范式表达，不强制同名。公共默认 language=sql、theme=light、setup=basic、indentUnit=两个空格；light/dark 是共享类型，扩展选择在三端。Angular CVA/value 优先级的已登记 **RV-071** 属绑定，不转嫁成 shared diff 算法缺陷、不在本任务重复登记。

## 原 C 最低场景原样保留，证据逐条划面

### C1：共享文档同步 — 部分

原最低要求：**外部连续更新、用户输入同时更新、空文档、Unicode、只读切换；无回写死循环或输入丢失**，核查动作另要求 selection/IME 保持。

- 共享包已验证：15 个差量边界用例 + 8 个性质用例（含固定种子4096对）、空文档、代理项、组合字符、CR/LF/NUL；坐标合法、回放精确、等内容无事务。
- 绑定已源码对照：`External.of(true)` 和 `Transaction.addToHistory.of(false)` 同时标注；不是 helper 自己抑制回调/undo。三端真实 CM + happy-dom 用例只能承接其现有具体断言。
- **仍未验**：真实用户输入与连续外部回写交错、composing 中外部更新、DOM selection/撤销/滚动、真实只读切换无输入丢失。主控跨绑定补证或裁定明确分流，不能据 helper 通过勾整个 C1。
- RV-071 是已确认的绑定输入优先级问题；修复就绪与共享包评审完成分开。

### C2：语言异步竞态 — 完整原 C 已有证据（限定测量输入）

原最低要求：**A→B 快速切换、A 最后返回、未知语言、模块加载失败；旧配置不能覆盖当前语言**。

- 共享 Node 证据：none/not-found/found 分开，名称/别名解析及 description identity；15个内置 loader、上游 Rust parser、错误载荷/rejection cause。
- 三端绑定真实 CM / happy-dom 证据：Angular `code-editor.spec.ts:371-390,957-980,995-1010`；React `CodeEditor.spec.tsx:385-427,574-640`；Vue `CodeEditor.reconfigure.spec.ts:229-242` 与 `CodeEditor.language.spec.ts:166-219`。分别实际断言 B 已装上后 A 迟到不覆盖，unknown 清空+not-found，loader rejection 清空+load-failed，旧 failure 不发错误事件。
- 本轮读取三端对应 JUnit：Angular76 / React34 / Vue68，全失败/skip为0；第一轮测量19个相关绑定输入与当前一致。这里核销的是异步选择/错误/竞态，**不是**实际离线发布包或浏览器物理 chunk 缺失；后者在 C5。

### C3：配置与跨框架语义 — 部分

原最低要求：**相同 options/input 在三端产生同文档/错误/事件；原生 prop 形式差异不掩盖能力缺失**。

- 已核销子面：共享主题类型、description/support、冻结错误、a11y 输入/返回；三端同 helper、相同默认值和三种原生错误通道的结构化 payload。
- 源码对照不是三端同一公开宿主输入序列的端到端事件矩阵。真实 value/readonly/disabled/focus/change 交错仍归绑定，需要主控明确测试序列和期望事件次数。
- valid/invalid tar consumer 只证明共享公开类型强度；不证明 Angular CVA 或 React/Vue props/emit 全行为对称。

### C4：可访问性与资源 — 部分

原最低要求：**键盘焦点、IME、屏幕阅读器属性、大文档、重复消费；共享层不创建隐藏全局编辑器**。

- helper12测试已验证字典与 autofocus predicate；全部共享源码/当前生成 JS 不创建 view；主控Node无DOM runtime与重复SQL load探针已通过。
- 三端 facet/创建/销毁归属已锚定；真实 contentDOM 属性和模拟DOM行为不能冒充辅助技术验收。
- **仍未验**：真实 Tab/键盘可达性、原生 IME、屏幕阅读器名称/disabled/readonly播报；大文档延迟/内存与重复 mount/destroy 资源曲线。明确浏览器/设备/辅助技术及文档字节数/轮数，由主控补证或分流裁定，不能写“不适用”。

### C5：打包与依赖 — 部分，主控补独立 consumer

原最低要求：**仅一种语言 bundle、pack 后导入、缺语言资源、Node 仅导入类型；不靠工作区 alias 过关**。

- 已有证据：实际tar22文件、manifest中7条入口字段引用无缺失、独立root resolve成功；受控源码没有生成文件。当前忽略的dist仅作source↔declaration/bundle静态对照，不声称重构建一致。
- 主控已执行`consumer-valid.mts`、`consumer-invalid.mts`、`runtime-smoke.mjs`及root import：有效编译0、负对照9个预期语义诊断/exit2、root与smoke0。第一轮false字段保持历史，第二轮结果单独记录在consumer-results.json；type-only emit/Node辅助probe仍未执行。
- **仍未验**：真实已pack消费者仅SQL的initial/chunk图及体积；物理缺语言模块/资源的正负对照。root import/SQL正常load不替代这些要求。

## 完成度规则

本任务能交付21/21完整源码/设计评审与全部原C的证据归属，当前完整原C仅 **C2**。C1/C3/C4/C5是部分执行，helper独立闭环不改写整个原C状态。完整对象候选交主控裁定：独立tar主探针结果已承接；再逐条接受或拒绝绑定/browser的分流；在必要未验仍未接受前，不写“全部C完成”或“发布就绪”。
