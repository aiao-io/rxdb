---
id: RV-01a1bb42cfeb70a3bb6a4a35093c4beb
title: '无限滚动在途尾页被重锚后丢失加载编号，三端永久停在 loading'
project: rxdb-vue
branch: refs/heads/codex/full-review-main-20261108
range: project
base_ref: null
review_scopes: []
scope_id: 'project:rxdb-vue'
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
  - 'packages/rxdb-vue/src/useInfiniteScroll.ts#commitPage'
  - 'packages/rxdb-angular/src/InfiniteScrollingList.ts#commitPage'
  - 'packages/rxdb-react/src/useInfiniteScroll.ts#openPage'
affected_projects:
  - rxdb-angular
  - rxdb-react
related_findings: []
pr: null
---

# RV-01a1bb42cfeb70a3bb6a4a35093c4beb：无限滚动在途尾页被重锚后丢失加载编号，三端永久停在 loading

## 问题与影响

第一页已满并保持 live 订阅，用户发起第二页、其首值尚未返回时，第一页因新增/删除/排序刷新而移动尾边界。实现会退订原第二页并用新游标重锚第二页，但重锚调用没有继承原加载编号。替代页即使已成功 next 并 complete，也不能将 isLoading 复位。列表有正确数据且 hasMore 为 true，却始终显示加载中，所有后续 loadMore 都被拦截，直到用户显式 refresh 或重挂。三端同构代码均存在；Vue 公共入口已确定性复现。需活查询刷新与异步分页交错，按竞态边界定为 P2。

## 证据与根因

证据快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`。

- Vue `packages/rxdb-vue/src/useInfiniteScroll.ts:239` 使用 `openPage(index + 1, tail, undefined)` 重锚；第 263 行 finishLoad 只允许非 undefined 的 loadId 结算，第 327 行 loadMore 将持续被 loading guard 拦截。
- React `packages/rxdb-react/src/useInfiniteScroll.ts:206` 同样用 undefined 重锚，第 138 行 isLatest() 要求非 undefined 编号，commitPage/complete 因此保持原 isLoading。替代订阅创建前会退订旧页，原编号没有后续结算机会。
- Angular `packages/rxdb-angular/src/InfiniteScrollingList.ts:305` 同样传 undefined；第 218 行 settleRequest() 要求 request 非 undefined 且等于 loadingRequest。旧页退订之后，替代页的 next/complete/error 都不会复位 loading。
- 已有 live boundary 用例在两页均已同步返回后才移动第一页边界；单独的“旧页重发时不应结束新页 loading”测试保持原尾条目不变。两种用例未组合“新页等待首值时尾边界移动”的时序。

本组 `repro-infinite-scroll-reanchor-loading.mjs` 使用现有 Vue 构建公共入口、真实 Vue 自定义 renderer 和 RxJS Subject，序列为：首页 [a,b] → 加载 after-b（挂起）→ 首页更新 [x,a] → 替代 after-a 返回 [b,c] 并 complete → 再次 loadMore。输出：

```json
{
  "anchors": [null, "b", "a"],
  "hasMore": true,
  "ids": ["x", "a", "b", "c"],
  "loading": true,
  "requestsAfterMore": 3,
  "requestsBeforeMore": 3
}
```

原 after-b 订阅已退订；after-a 完成后 loading 仍为 true，后续请求数不再增加。复现实际执行 Vue；Angular/React 影响由对应源码中的相同编号丢失路径确定，未声称运行了两端动态复现。

## 修复方向

把用户加载的完成责任与可被重锚替换的页订阅建立明确关联；替换尚在途的最新页时，把加载编号移交给替代页，或由上层协调取消/结算再开启替代加载。保持旧页正常重发不能提前结束最新页 loading 的契约。三端同时补有界 Subject 时序回归：成功、失败、无首值 complete，以及恢复后能继续 loadMore。

## 处理记录

### EV-01a1bb42d0157d0bbc40ccea43387afe：发现

- 时间：2026-11-08T21:05:26+08:00
- 操作：review/full
- 执行者：ai；provider、model、version、session 均为 unknown
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`（仅写评审记录）
- 状态：未登记 → Open
- 结论：重锚替换在途尾页时，最新用户加载编号被丢弃，三端缺少能复位 loading 的活订阅。
- 验证：在共享工作区执行 `node /Users/jimmy/Documents/aiao/rxdb/.git/ai-review/v1/runs/full-main-20261108/parallel-001/ui/repro-infinite-scroll-reanchor-loading.mjs`，退出 0，实际输出及断言如上。未启动重型构建或全套单测。
- 剩余事项：三端统一修复加载完成责任并补时序回归，再按 verify 复核。

### EV-01a1be40772b7c99860ce6b319746076：修复

- 时间：2026-11-09T11:00:58+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G08）
- 输入快照：`1b5fb4e43f449bace1d6f67df78e55a129863f50`（提交视图）
- 输出快照：工作区树 `d5fd4fd913ad3d439bb538504e32a6599ef5e0b8`（`ai-review snapshot --worktree`，基于 `1b5fb4e4`，含其他并行修复的未提交改动）
- 状态：Open → Fixed
- 结论：成立，P2 维持，三端都复现（不只是 Vue）。重锚统一传 `undefined` 编号，而原页已被退订，用户加载的结算责任就此丢失；复核中发现同一根因的第二条路径：上一页清空时丢弃尾页（`dropTrailing` / `#truncatePages`），若被丢的是在途的最新页，同样永远停在 `isLoading: true`。修法：页句柄记下「这页负责结算的用户加载编号」，重锚的替代页沿用被替换那页的编号；丢弃尾页时其中在途的最新加载由当前页代为结算。旧页正常重发（编号不是最新）仍不结束最新页 loading，原有用例不变。
- 改动：React `packages/rxdb-react/src/useInfiniteScroll.ts`（`PageHandle.loadId`、`isLatestLoad`、重锚传 `next.loadId`、丢弃尾页时 `settles`）；Vue `packages/rxdb-vue/src/useInfiniteScroll.ts`（`PageHandle.loadId`、`finishLatestLoad` 收 `undefined`、重锚与丢弃同上）；Angular `packages/rxdb-angular/src/InfiniteScrollingList.ts`（`PageHandle.request`、`#settleRequest`、重锚传 `next.request`、`#truncatePages` 结算被丢的最新请求）。三端各新增同一组四条回归「在途页被重锚或丢弃时的加载结算」：替代页返回后结束加载且还能继续翻页、替代页失败时结束加载并报错、替代页无首值 complete 时结束加载并收敛 `hasMore`、上一页清空丢弃在途下一页时结束加载。
- 验证：修复前红：rxdb-react `useInfiniteScroll.spec.ts` 4 条、rxdb-vue `useInfiniteScroll.spec.ts`（`--coverage.enabled=false`）4 条、rxdb-angular `InfiniteScrollingList.spec.ts` 4 条全部失败，均为 `isLoading` 停在 `true`。修复后绿：React 26 条、Vue 48 条、Angular 59 条通过；React 全部 node 单测 243 条通过；三端 `npx tsc -p tsconfig.lib.json --noEmit` / `tsconfig.spec.json --noEmit` 无错误，改动文件 eslint（max-warnings 0）通过。三端整包测试留到本组收尾统一跑。
- 剩余事项：无（三端已同时修复）；收尾复核。
