---
id: RV-01a1bb4c7db97c26b5c7cda6ce2dcb12
title: 'Taro realm 注入遇到注释或前置指令会使 use strict 失效'
project: rxdb-taro
branch: refs/heads/codex/full-review-main-20261108
range: project
base_ref: null
review_scopes: []
scope_id: 'project:rxdb-taro'
status: Open
severity: P2
source_view: commit
source_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
base_sha: null
found_branch: refs/heads/codex/full-review-main-20261108
found_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
found_range: project
created: 2026-11-08
updated: 2026-11-08
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
