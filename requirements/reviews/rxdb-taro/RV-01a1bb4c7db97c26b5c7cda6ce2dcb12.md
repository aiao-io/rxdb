---
id: RV-01a1bb4c7db97c26b5c7cda6ce2dcb12
title: 'Taro realm 注入遇到注释或前置指令会使 use strict 失效'
project: rxdb-taro
branch: refs/heads/codex/full-review-main-20261108
range: project
base_ref: null
review_scopes: []
scope_id: 'project:rxdb-taro'
status: Fixed
severity: P2
source_view: commit
source_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
base_sha: null
found_branch: refs/heads/codex/full-review-main-20261108
found_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
found_range: project
created: 2026-11-08
updated: 2026-11-09
anchors:
  - 'packages/rxdb-taro/src/realm-plugin.ts#USE_STRICT_DIRECTIVE'
  - 'packages/rxdb-taro/src/realm-plugin.ts#afterDirective'
affected_projects: []
related_findings: []
pr: null
---

# RV-01a1bb4c7db97c26b5c7cda6ce2dcb12：Taro realm 注入遇到注释或前置指令会使 use strict 失效

## 问题与影响

抖音/支付宝产物 chunk 以合法版权 banner 注释开头，随后是 use strict 指令，并且使用了 realm 绑定时，插件识别不到指令，在整个代码最前插入 var/require 语句。原 use strict 随即不再属于指令序言，模块从严格模式变成非严格模式：普通函数的 this 从 undefined 变成全局对象，意外全局赋值、只读属性赋值等行为也会变化。另一个合法输入是前面存在其他字符串指令（如 use client）再跟 use strict，同样失效。抖音入口的严格模式拒绝门禁也被同一正则绕过。依赖 banner/指令组合才触发，定为 P2。

## 证据与根因

证据快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`。

- `packages/rxdb-taro/src/realm-plugin.ts:55` 的 USE_STRICT_DIRECTIVE 只跳过空白，要求 use strict 是最前面的字符串，既不跳过注释，也不遍历完整指令序言。
- 第 58–62 行 afterDirective 未匹配就直接 statements + code；第 92 行将此操作用于所有需要 realm 的非入口 chunk。前置语句把原严格指令变成普通表达式。
- 第 87 行的抖音入口检测复用同一正则，因此带 banner 的严格入口未按公开契约拒绝，随后注入还会静默破坏其严格模式。
- `packages/rxdb-taro/src/__tests__/realm-plugin.spec.ts` 验证了直接开头的 use strict、普通字符串和函数内指令，但没有注释/banner 或其他前置指令的用例。

本组 `repro-taro-realm-strict-banner.mjs` 直接导入冻结源码（Node 原生剥离 TS 类型），调用真实 generateBundle，再在独立 Node vm realm 中执行改写后的 CJS chunk。普通函数 this 是否为 undefined 的对照输出：

```json
{
  "bannerBeforeDirective": false,
  "directDirective": true,
  "priorDirective": false,
  "rejectedStrictAppWithBanner": false
}
```

未加 banner 的严格 chunk 保持严格；加 `/*! license */` 或在 use strict 前放另一条字符串指令后，被改写为非严格。此复现没有运行实际 Taro/真机构建，不扩大平台验证结论。

## 修复方向

按 JavaScript 词法规则跳过注释并识别完整指令序言，在其后注入；抖音入口检查也应基于同一解析结果。可使用已有解析设施读取语句，或实现受测试约束的精确序言扫描。补块注释、行注释、版权 banner、其他指令、单双引号和无分号换行的用例，同时保留函数体内 use strict 不影响顶层的反向测试。

## 处理记录

### EV-01a1bb4c7de27fa7877aea7e8f8a5482：发现

- 时间：2026-11-08T21:15:56+08:00
- 操作：review/full
- 执行者：ai；provider、model、version、session 均为 unknown
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`（仅写评审记录）
- 状态：未登记 → Open
- 结论：合法 banner/指令序言输入被 realm 注入改成非严格执行，入口拒绝门禁同源失效。
- 验证：在共享工作区执行 `node /Users/jimmy/Documents/aiao/rxdb/.git/ai-review/v1/runs/full-main-20261108/parallel-001/ui/repro-taro-realm-strict-banner.mjs`，退出 0，四项断言均成立；未执行 Taro 构建或真机验证。
- 剩余事项：修复序言识别和插入位置，补回归后 verify。

### EV-01a1c06465b572a681a3de9f85a3f001：修复

- 时间：2026-11-09T20:59:27+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G08）
- 输入快照：`1b5fb4e43f449bace1d6f67df78e55a129863f50`（提交视图）
- 输出快照：工作区树 `1bf4ea446ccf17e5d72ffca4b5b7cba1dc23baa7`（`ai-review snapshot --worktree`，基于 `bad25587`（外部自动提交，含各组 WIP））
- 状态：Open → Fixed
- 结论：成立，P2 维持。`USE_STRICT_DIRECTIVE` 只锚定开头空白后的 `use strict`：前面有版权 banner、行注释或别的指令时插入点落到指令之前，chunk 静默变成非严格；抖音入口的严格模式拒绝同样被绕过。复核另发现记录未列的一处：末条指令没写分号、靠换行结束时，旧实现把语句紧贴在字符串后面插入，得到 `"use strict"var …` 的语法错误。修法：新增内部模块 `directive-prologue.ts`，按 ECMAScript 词法跳过空白、行终结符（含 U+2028 / U+2029）、行 / 块注释与开头 hashbang，逐条读字符串指令，显式分号、文件末尾或「换行后接一条新语句」才算指令结束；拿不准（换行后接运算符、括号、`in` / `instanceof` 等可能续成表达式的记号）一律判不是指令，避免改掉表达式语义。插入点放在整段序言之后，末条指令无分号时先补分号；抖音入口改按序言里是否有逐字的 `use strict` 判定，转义写法不算。没有引入解析器依赖。
- 改动：新增 `packages/rxdb-taro/src/directive-prologue.ts`（`scanDirectivePrologue`，不从包入口导出）；`packages/rxdb-taro/src/realm-plugin.ts`（`afterDirective` 与抖音入口判定改用扫描结果）；回归 `packages/rxdb-taro/src/__tests__/realm-plugin.spec.ts` 新增「指令序言」一组 8 条（块注释 banner、行注释、前置 `use client`、指令间夹注释、无分号换行，均在 Node vm 里按 CommonJS 函数体执行断言仍是严格模式；非严格 chunk 与续成表达式的字符串插在最前；转义写法不是严格指令；抖音入口 banner / 前置指令后的 `use strict` 照样拒绝），新增 `packages/rxdb-taro/src/__tests__/directive-prologue.spec.ts` 16 条覆盖扫描器各分支。原有「函数体内 use strict 不影响顶层」等用例保留不变。
- 验证：修复前红：`npx vitest run --coverage.enabled=false src/__tests__/realm-plugin.spec.ts` 新增 8 条全部失败（4 条 chunk 变非严格，无分号用例得到 `"use strict"var __rxdbRealm=…`，转义用例插入点错误，抖音入口未拒绝）。修复后绿：rxdb-taro 全部 9 个文件 96 条通过；`npx tsc -p tsconfig.lib.json --noEmit` 无错误，改动文件 eslint（max-warnings 0）通过。`tsconfig.spec.json --noEmit` 对新文件报 TS6305（项目引用要求 `dist/directive-prologue.d.ts`，本轮禁止重建 dist）；改用仓库被忽略的 `tmp/` 下不带项目引用的临时配置对两个 spec 与两个源文件做类型检查，无错误，临时配置已删除。未跑真实 Taro / 真机构建。
- 剩余事项：主会话重建 rxdb-taro dist 后复跑 `tsc -p packages/rxdb-taro/tsconfig.spec.json --noEmit`（预期 TS6305 消失）。
