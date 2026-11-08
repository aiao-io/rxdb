# AI Review 规则与记录

代码评审使用仓库的 `ai-code-review` skill，命名和状态沿用 [CONVENTIONS.md](../CONVENTIONS.md)。
新代码问题统一写仓库根 `requirements/reviews/<projectKey>/RV-<uuid>.md`，应用项目也按真实 Nx 名称归档。
本目录保存模板与已经存在的应用内问题；旧记录继续按原 ID 处理，显式迁移时保留来源，不维护两份可编辑副本。

只为有证据的问题建记录，没有发现就不生成空报告。发现、修复、复核、异议分别记录实际模型/维护者、快照、结论和验证结果。
修复为 Fixed，复核有效为 Resolved；异议为 Disputed，证明不成立为 Dismissed，维护者明确接受风险为 Accepted。完整含义以根约定为准。
关闭后保留修复和不修结论，不执行修复后删除；不同分支状态独立，不同模型处理同一问题时追加原记录。

[review.template.md](review.template.md) 提供记录结构；应用创建或更新模板时与仓库根 `requirements/reviews/review.template.md` 同步。
