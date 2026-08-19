---
id: CS-005
number: 5
status: Resolved
rule: js/polynomial-redos
severity: warning
security_severity: high
path: packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts
line: 106
created: 2026-08-16
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/5
---

# CS-005 Polynomial regular expression used on uncontrolled data

## 规则

- ID：`js/polynomial-redos`
- 名称：Polynomial regular expression used on uncontrolled data
- 描述：Polynomial regular expression used on uncontrolled data

## 位置

`packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts:106`

## 告警

This regular expression that depends on library input may run slow on strings starting with 'sqlite3-opfs-async-proxy-' and with many repetitions of 'sqlite3-opfs-async-proxy-'.

## 修复方案

**修 —— 属于发布包 `@aiao/rxdb-adapter-sqlite-core`，URL 来自 sqlite3 内部与 bundler 输出。**

`/sqlite3-opfs-async-proxy(?:-[^/]+)?\.js$/` 没有起点锚，在重复前缀的路径上（`'sqlite3-opfs-async-proxy-'.repeat(20000)`）每个起点都要用 `[^/]+` 扫到段尾才失败，实测 **14751ms** —— 本批最慢的一条。

改为只对 basename 做两端锚死的全串匹配 `/^sqlite3-opfs-async-proxy(?:-[^/]+)?\.js$/`，起点唯一。兜底分支用 `split('#')[0].split('?')[0]` 手动剥 query / hash，等价于原来的 `(?:$|[?#])` 收尾。

行为有一处收紧：basename 必须**以** proxy 名开头，而不是仅仅以它结尾 —— 这正是原意，原有 8 条识别用例（含带 hash 后缀、URL 对象、非法 host 兜底）全部保持绿。

- 实现：[sqlite-oo1-load.utils.ts](../../packages/rxdb-adapter-sqlite-core/src/sqlite-oo1-load.utils.ts)
- 测试：[sqlite-oo1-load.utils.spec.ts](../../packages/rxdb-adapter-sqlite-core/src/__tests__/sqlite-oo1-load.utils.spec.ts) —— 新增 2 条 ReDoS 用例，覆盖可解析 / 不可解析两条分支

## 解决记录

- [x] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
