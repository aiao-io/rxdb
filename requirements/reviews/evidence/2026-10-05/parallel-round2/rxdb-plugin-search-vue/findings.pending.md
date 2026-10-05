# rxdb-plugin-search-vue：第二轮有界收尾

记录时间：2026-10-05T10:59:42.063579+08:00；阅读 HEAD：`465f9078e9844af2cbef9936c7321a5576333a01`。用户任务 R2-06 / scope 标签 R2-07；对象唯一，没有改 scope。

## 新增问题

**无新增确认缺陷，也没有新建 RV。** 新的运行探针与正负 consumer 尚未由本代理执行，不能把预期失败写成已确认问题。源码阅读/测试定义/历史测量分别见本目录 `c-evidence.json` 与 `validation-observations.json`。

## 已登记问题：只引用 RV-062

- `/Users/jimmy/Documents/aiao/rxdb/requirements/reviews/RV-062-parallel-search-cancel.md`：P2，registry 为 confirmed-open。
- 根因在 core `search-handle.ts` 的 pending waiter 取消结算，而不是 Vue scope 清理。Vue `clear` / `onScopeDispose` 分别透传 clear / destroy；不承诺上游任意 pending loadMore 已结算。
- 本轮新增分页探针检查“已经运行中的分页”在 source 重建后迟到结算，**不重复构造/登记 RV-062 的成功订阅重入 pending waiter 场景**。
- 没有改旧 RV、core、原 tests、台账或 README。

## 静态文档观察（不扩 scope）

本包 README 第 40 行 Angular 导航旧称 `injectSearch`，本轮只读其实际根入口是 `useSearch`；三端实际根 API 对照按导出内容，不按这段旧名称或 skill 约定猜测。这里不新增业务缺陷编号，也不修改 README。

## 补证而非缺陷

当前 real-handle spec 与旧运行指纹不同；新增组件探针没有运行；主控读取时离线消费者安装仍非零。严格 tar d.ts、runtime root import 和 SFC 模板正负场景未获得最终证据。这些是完整 C/closure 的必要动作，不是假绿，也不是已经确认的产品错误。

## 最终环境对照追加（2026-10-05T11:09:34.173740+08:00）

主控确认显式 Node + @types/ms 后 strict valid=0、negative 仅消费类型拒绝、root import=0。保留裸上游失败，不作为 Vue 本包新增确认缺陷，不改消费者来绕过类型。current unit/coverage/lint 由主控继续；本代理立即完成交接，不再等待或扩查。
