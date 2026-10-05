# R2-03：rxdb-plugin-tree-react 待主控确认问题

本次有界实读未新增待确认缺陷，未分配 RV 编号。

- 四个 wrapper 的方法名/default/输入输出泛型、context 所有权均有源码锚点；没有 flat fallback。
- 新 lifecycle spec 和正/反 consumer 尚未动态执行，不能把预期通过/失败写成确认问题。
- 注册期「缺 Tree 插件」与 hook effect「静态树方法缺失」是不同场景；mock 只能证明后一层，不替代真实注册测试。
- RV-069 的 working-tree/provider、RV-070 的 replay/seek 不属于本对象；第一轮 RV-066/067/068 已分流清理，不重登。
- 剩余验证直接记入 validation-requests.json 与 closure.json，由主控执行、复验去重和最终裁定未验证分流。
