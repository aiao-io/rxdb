# R2-07：本对象的有界结论与未验边界

## 去重

已读取 `parallel/findings-registry.json` 的 working-tree 条目。RV-069 是 React provider/旧 patch owner 缺陷，不给 Angular 复制编号。本轮没有新增已确认问题，不写旧 RV、总台账或 index。

## 静态边界：生命周期未闭合，不提前给 P 级缺陷

`src/use-working-tree.ts:166-190` 每次创建独立 signal 与注入时固定的 commands；没有订阅/effect、DestroyRef、销毁清空或取消接线。上游 `rxdb.provider.ts:56-99` 区分 borrowed/owned DB，不能为了 wrapper 清理顺手销毁调用方的共享库。共享 commands 的 generation 只管同格请求代次，不管组件 destroy。

新增 lifecycle spec 中四例覆盖销毁中 resolve/reject、旧 commit 仍 refresh 旧库、外部保留 resource 时敏感 diff 留存；这些是现状/隔离刻画，不把绿测试当清理通过。尚未执行，**不是确认缺陷、不是实际通过**。是否应抑制晚到 patch/refresh 或清理 retained payload，交主控按原 C3/C4 契约裁定；不会无限向 core/其他框架扩挖。

## C5 原示例验证边界

README 的模板重复调用 `statusState()`；安全 `@let` 正例不能证明原模板 strictTemplates 通过。已提供 `consumer-readme-template.mts` 原模板探针及独立模板负例；未运行 ngc，不提前报模板错误，也不称其通过。

## 分流而非缩要求

真实数据 CAS/dirty/unreachable 安全、三端拒绝与敏感摘要、真实 route 挂载/卸载尚无本对象充分动态证据。闭环动作已固定在 validation-requests.json 和 closure.json：主控复用既有证据或最小补测并裁定，原 C1-C5 的必要验证仍 partial；每项评审结论与责任/核销条件已完成。依用户最新口径，对象评审 complete，验证未全通过、发布就绪 false。
