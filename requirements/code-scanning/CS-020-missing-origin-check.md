---
id: CS-020
number: 20
status: Resolved
rule: js/missing-origin-check
severity: warning
security_severity: medium
path: benchmarks/src/hooks/useTheme.ts
line: 36
created: 2026-08-16
updated: 2026-08-20
url: https://github.com/aiao-io/rxdb/security/code-scanning/20
---

# CS-020 Missing origin verification in postMessage handler

## 规则

- ID：`js/missing-origin-check`
- 名称：Missing origin verification in `postMessage` handler
- 描述：Missing origin verification in `postMessage` handler

## 位置

`benchmarks/src/hooks/useTheme.ts:36`

## 告警

Postmessage handler has no origin check.

## 修复方案

**已修 —— 告警指的那个监听器在当前分支上已经不在这个文件里了，且新位置带同源校验。**

基线 `1b09d39` 上 `benchmarks/src/hooks/useTheme.ts:36` 是一个裸的
`window.addEventListener('message', handleMessage)`，只看 `event.data.type`，完全不看 `event.origin` —— 告警属实。

commit `5f68b0b`（_fix(wujie): 主题兼容通道只认同源，CSS 改写改为线性扫描_）把这个监听器整体挪进了共享模块
`@modules/wujie` 的 `subscribeHostTheme`，并在那里补上同源校验：

- 校验点：[modules/wujie/src/host-theme.ts:145](../../modules/wujie/src/host-theme.ts#L145) —— `if (message.origin !== scopeOrigin) return;`
- 取不到自身 origin（sandboxed iframe / `data:` / `blob:` 文档，origin 为空串）时**根本不订阅**，
  不留「空 origin 放行」的口子，见同文件 138 行注释。
- [useTheme.ts](../../benchmarks/src/hooks/useTheme.ts) 现在只剩 `useEffect(() => subscribeHostTheme(...), [])`，本地已无 `addEventListener('message')`。

无需额外改动，下一次 CodeQL 扫到含 `5f68b0b` 的 commit 后会自动转 fixed。

## 解决记录

- [x] 修复并合并 → `status: Resolved`
- [ ] 或承认风险 → `status: Dismissed`
