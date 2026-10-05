# R2-01：独立实际 tar consumer 验证协议

日期：2026-10-05。执行者：主控；本任务只准备探针，不执行编译、runtime、build、test 或打包。

## 独立性前提

- 将本目录的三个指定探针与各自配置复制到主控的仓库外、离线实际 tar 安装目录。`@aiao/code-editor` 必须来自实际 tar 的 `dist`，不使用工作区软链、源文件 import、`paths`、`baseUrl` 或继承仓库 tsconfig。
- 记录实际 tar SHA、已安装 manifest/公开入口 SHA、源输入 SHA、探针 SHA、Node/TypeScript/包管理器及 CodeMirror 依赖版本。构建来源由主控核实；不能把当前忽略的 `dist` 自动视为新构建。
- `consumer-valid.mts` 额外以 `import type` 消费 `@codemirror/language` 的 `LanguageDescription`，核查公开 `SUPPORT_LANGUAGES` 的标称类型没有退回结构类型。该包必须在独立 consumer 可正常解析；不能为消除 TS2307 加仓库 alias。
- 配置均为独立 `NodeNext` / strict / `skipLibCheck=false` / `verbatimModuleSyntax=true`，`types=[]` 防止工作区 ambient types 偷渡。`DOM` lib 仅供 CodeMirror 声明完整检查，**不证明浏览器执行**。
- 以下命令是主控执行步骤，不是本任务已执行日志。consumer 是证据探针，不是新增 Nx target。

## 1. 强类型正对照

```bash
pnpm exec tsc -p consumer-valid.tsconfig.json
```

期望 exitCode=0。直接消费公开包入口的所有九个公开类型：`CodeEditorAccessibilityState`、`CodeEditorExtension`、`CodeEditorLanguageDescription`、`CodeEditorLanguageError`、`CodeEditorLanguageErrorKind`、`CodeEditorLanguageSupport`、`CodeEditorTheme`、`DocumentChangeSpec`、`ResolvedCodeEditorLanguage`。

真实函数返回值分别赋给 `DocumentChangeSpec | null`、`ResolvedCodeEditorLanguage`、`CodeEditorLanguageError`、`Record<string,string>`、`boolean`、`CodeEditorLanguageDescription | null` 和 `Promise<CodeEditorLanguageSupport>`。`found / not-found / none` 三分支可穷尽读取；自定义 loader 与内置 SQL loader 均按真实公开签名消费。没有 `any`、类型断言绕过或忽略指令。

## 2. 类型负对照

```bash
pnpm exec tsc -p consumer-invalid.tsconfig.json
```

期望非零退出，且以下 **9 个错例各有对应语义诊断**：

| 符号                          | 必须拒绝的类型                          |
| ----------------------------- | --------------------------------------- |
| `wrongTheme`                  | `'sepia'` 不属于主题联合                |
| `wrongErrorKind`              | `'network-error'` 不属于错误类别        |
| `wrongError.language`         | 数字不能作语言名                        |
| `wrongChange.from`            | 字符串不能作文档坐标                    |
| `missingDescription`          | `found` 分支不能缺 `description`        |
| `wrongAccessibility.disabled` | 字符串不能作禁用布尔值                  |
| `wrongLoader.load`            | Promise 的 support.extension 不能是数字 |
| `wrongDocumentInput`          | 计算差量的 current 不能是数字           |
| `wrongLanguageInput`          | 候选必须是 description，不能是字符串    |

不使用 `ts-expect-error` 或 `ts-ignore`。典型诊断是 TS2322 / TS2345；具体以实际 TypeScript 输出为准。只有模块无法解析、ambient 声明缺失、compiler 崩溃或参数错误时不算“类型负对照通过”。它是刻意不通过的独立文件，不能与 valid 一起作为成功编译目标。

## 3. Runtime 正对照

```bash
node runtime-smoke.mjs
```

期望 exitCode=0 且输出 `probe=R2-01-runtime-smoke`、`passed=true`。内部使用 Node assert 真正断言：

- 不提供 `window/document`；包名 root 实际可执行，不是仅 `import.meta.resolve`。
- 相同/空文本无变更；五对空文档、UTF-16、中文换行、组合字符、重复字符的差量坐标合法且精确回放。
- aria 字典、空属性清理、逐调用新对象；只读/禁用的 autofocus 布尔判定。
- 语言列表冻结、大小写解析、none/not-found/found、描述 identity 等价。
- 两类 error payload 冻结且保留原 `cause`。
- `SQL.load()` 取得真实 parser 并解析 `SELECT * FROM users;` 无错误节点，重复 load 返回同一 support。

输出同时明确 `browserBehaviorValidated=false`。它**不证明**框架事件、IME、DOM selection、辅助技术、物理缺资源或浏览器 chunk 网络加载。

## 4. 原 C5 的 Node 仅导入类型

附加 `type-only-consumer.mts` 与独立 emit 配置：

```bash
pnpm exec tsc -p type-only-consumer.tsconfig.json
node --input-type=module -e "const m = await import('./type-only-output/type-only-consumer.mjs'); if (m.marker !== 'R2-01-type-only-no-runtime-import') throw new Error('marker mismatch');"
```

先读 emitted `.mjs`：必须没有 `@aiao/code-editor` / CodeMirror 的运行时 import；然后 Node 导入 marker 成功。仅 valid 编译不能替代这个测量面。

## 5. 保留未验，不扩新 bug

- `runtime-smoke` 不是物理语言资源缺失负对照。主控对 fresh 独立副本控制 SQL 模块解析失败，记录真实 rejection；正常副本相同 SQL load 成功作正对照。不要修改工作区依赖或将资源缺失归为 helper 错误。
- 原“仅一种语言 bundle”从 `import { SQL } from '@aiao/code-editor'` 的消费入口测 initial/chunk module graph、raw/gzip 体积。顶层 `@codemirror/language-data` 元数据与 parser 的动态导入分开登记，零自有 chunk 不是故障。未运行就保留 C5 部分执行。
- 日志统一由主控写到 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/validation/`，再将明确结果链接回本对象 `closure.json`。不将第一轮 pack/root resolve 的结果填成第二轮 typed/runtime 通过。

## 已执行结果（主控，非本任务）

截至2026-10-05T10:57:55.292703+08:00，本协议三份用户指定探针已在独立实际tar目录执行：valid0、invalid2/9个预期类型诊断、root import0、runtime-smoke0。fixture SHA逐一一致。主控actual配置ES2024/NodeNext/strict/skipLibCheck=false；本目录ES2022/verbatim配置是备用可复验配置，不假称actual使用过。证据：`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/code-editor/consumer-results.json`。

type-only辅助emit/runtime仍未执行；主控继续补SQL bundle模块图与物理缺语言模块负对照。本任务不等待其余对象。
