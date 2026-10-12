# Research: US-602 A1

- 包扫描范围包括 rxdb-test；API 基线排除它是独立裁剪，保持不变。
- RxDB.connect 首次引导会同步 init；use 的普通插件晚装合法，仓储贡献必须早于 init，系统贡献晚装直接拒绝。
- RxDBAdapterLocalBase 的 transaction 两个重载目前无 TSDoc；实体 save 不持有 executor，会重新入队。
- PGlite 已有 memory 后端与严格事务测试；history 为已发布插件，适合离线样例。
- 中心事实源优于 manifest 自定义字段：情景本来跨包，避免拆成两处人工来源。
- TypeScript AST 的局部扫描可读取现有 plugin.ts 的 inject 字面量（无属性即无前置）；不启动全仓 Program。
- 生成物提交 + --check 能通过夹具证明可重复与漂移；消费目标必须声明输入，发布标签也参与哈希。
- Spec Kit 除 before_specify 的分支钩子外，其余 Git hooks 均 optional，本次跳过；用户授权完整 A1 实现与自动验证。
