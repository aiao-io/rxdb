# PKG-pglite 本地风险台账

日期：2026-10-05。仅本包；新风险用 PKG-PGLITE-* 本地主控编号，不改根 RV 台账。

## 去重

- RV059：Supabase bulk delete URL，非本包。
- RV060：Supabase metadata 关系上下文，非本包。
- RV061：SQLite QueryCache namespace，已确认链路只为 SQLite；PG 同症状须独立证据，不能报跨后端污染猜测。
- RV079：本包空/删除锚点 count -1，已有确认，不重复 wrapper/engine，不重跑。
- RV027/029/034/041/045/058：旧结果明确已修，不借历史红复报；当前源码仍逐文件审查。

## 新风险

待逐文件评审。

### PKG-PGLITE-001（候选，C2/C4）：重连后的 changeErrors$ 已永久完成

锚点：`src/RxDBAdapterPGlite.ts:107,149,367–369,399–418,854–873`。同一适配器的connect明确允许closed→bootstrap，但disconnect完成Subject，host/readonly Observable仍引用旧Subject。当前原change-queue/mock-residual测试只证首连错误发布。待最小复验：首次失败可收、disconnect/reconnect后同失败处理仍执行但错误无发布。暂不宣称真实host/Worker全部受影响，不与RV079重复。
