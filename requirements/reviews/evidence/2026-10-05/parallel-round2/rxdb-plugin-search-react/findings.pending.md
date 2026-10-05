# rxdb-plugin-search-react：第二轮待主控归类项

日期 2026-10-05；读取 HEAD `465f9078e9844af2cbef9936c7321a5576333a01`。本文件只记录此对象的两处有界候选，**不分配 RV、不改生产、原 tests、README、依赖或其他对象**。不再扩新大 bug。

## 1. options-presence：与公开 core comparator 的判据不一致（需复验）

- 归属：C2，候选严重度 P3（行为一致性；尚不声称用户数据损坏/搜索错误）。
- 源锚点：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-react/src/use-search.ts:54–65`；core 公开判据 `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search/src/core/options-equality.ts:53–60`。
- 已读静态事实：React memo 依赖只有 debounce/pageSize/snippetLength/collectionsKey；从 undefined 到 {} 这四项均不变。core `searchOptionsEqual(undefined, {})` 明确 false，另外两端的重建使用该比较。
- 影响限于已展示的 options 存在性/重建一致性；普通默认搜索结果是否改变没有主张。不能由源码推理伪称已运行失败。
- 最小探针：`/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-react/src/__tests__/review-round2-lifecycle.spec.ts:175–187`；undefined→{}→undefined 按 core 判据应重建，并断言实际 search 次数/入参。该断言**未由本任务运行**，主控新 unit 可直接复验。
- 去重：现有 parallel/findings-registry 和 RV 搜索没有对应 presence/comparator 条目；RV-062 根因为取消 pending 等待者，不是此候选。
- 最小修法方向（非本次实施）：统一 comparator/snapshot 的存在性约束，保留 initialQuery 初次播种与四稳定回调，不靠新 fallback 或 per-keystroke rebuild。
- 核销条件：主控实测 assertion、确认原公开判据是否仍是所需合同；确认缺陷则登记/分流，合同不要求则写清撤销理由。不能删红断言假绿。

## 2. 本包 README 的同族名称/共用判据说法过期（文档候选）

- 归属：C3/C2，候选严重度 P3；静态文字对照，无新 runtime bug 主张。
- `/Users/jimmy/Documents/aiao/rxdb/packages/rxdb-plugin-search-react/README.md:70` 写 Angular `injectSearch`，实际 Angular root `src/index.ts:15` 导出的是 `useSearch`，不导出该旧名。
- 同 README `:68` 写三端直接共用 `searchOptionsEqual`；React 实际 `use-search.ts:54–65` 使用 memo 字段快照，且存在上一条差别。不能将文字复述成实现证据。
- 最小改法方向：责任人仅修本包 README 的真实公开名称与判据说明，必要时与上一条修复同步。本任务按唯一写范围不改 README、不改 Angular。

## 已确认上游问题：仅引用 RV-062

`/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/RV-062-parallel-search-cancel.md` 及 findings-registry 记 confirmed-open：clear/destroy 丢弃 pendingQuery 后其 loadMore 等待者不结算。本任务不重复登记、不跑旧 core 红 probe、不要求改 core。新增 clear/unmount case 仅覆盖**已执行**分页的结算/AbortSignal，不能反证该特定重入 pending 窗口已修复。

## 独立 tar 的暂时编译阻断：只登记测量归属，不扩 bug

主控裸 strict consumer 的 valid/invalid 都有 utils public.d.ts 的 NodeJS/ms 声明错误；invalid 同时出现本 fixture 7 处预期真实类型错误，root import 已通过。保留失败日志，补显式 Node + @types/ms 环境对照，不加 ambient any、不改 source mapping、不改 utils 或本包依赖。该阻断不是本对象新 RV；跟随 `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/evidence/2026-10-05/parallel-round2/rxdb-plugin-search-react/validation-requests.json` 的既有 consumer 请求收束。
