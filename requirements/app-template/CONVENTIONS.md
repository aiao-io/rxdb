# 应用级约定（Conventions）

本文件是应用需求目录的**增量约定**，只写与根 `requirements/` 不同的规则；命名、状态、写作规范与根完全一致，见根 `requirements/CONVENTIONS.md` 与 `requirements/README.md`，不重复定义。复制本文件到 `apps/<app>/requirements/CONVENTIONS.md` 后替换 `<APP>`。

## 文档类型与编号段

应用内四类带编号的文档沿用根的四类结构，id 前缀加上应用短前缀 `<APP>`（如 `MEDIA`）：

| 类型           | id 前缀          | 编号段 / 规则                                                                              | 目录                |
| -------------- | ---------------- | ------------------------------------------------------------------------------------------ | ------------------- |
| 用户故事 story | `<APP>-US-XXX`   | 按领域分段（见下）                                                                         | `stories/<domain>/` |
| 史诗 epic      | `<APP>-EPIC-XXX` | 递增，与 `epics/*.md` 文件名一致                                                           | `epics/`            |
| review 记录    | `RV-XXX`         | `RV-001` 起递增，不与 `US` / `CS` 混用                                                     | `reviews/`          |
| code-scanning  | `CS-XXX`         | 与 GitHub code scanning 告警 `number` 一一对应；工作集条目，关闭后归档进 README 并删除文件 | `code-scanning/`    |

`stories/` 子目录按应用自己的领域划分，每个领域分配一段 100 个编号（`001~099`、`101~199`……），新增故事按目录就近取未占用编号，不强制重排。Aiao Media 的划分是示例：`platform/` MEDIA-US-001~099、`generation/` MEDIA-US-101~199、`account/` MEDIA-US-201~299、`local-first/` MEDIA-US-301~399。

## 命名规范

- 用户故事：`<APP>-US-XXX-description.md`
- 史诗：`<APP>-EPIC-XXX.md`
- review：`RV-XXX-描述.md`
- code-scanning：`CS-XXX-*.md`（编号与 GitHub 告警 number 对应）

其余与根一致：不用字母后缀文件（大故事文件内分「交付阶段」）；辅助文件与所属 story 同目录、无 frontmatter、不进状态统计；计划与验收记录放 `plans/`，不参与状态统计。

## 状态定义

五态（`Backlog` / `In Progress` / `In Review` / `Done` / `Blocked`）与真相源规则与根一致：story 的 YAML `status` 是唯一真相源，`status-overview.md`、`roadmap.md`、`capability-matrix.md`、`verification-report.md` 与各 epic 文件都是派生视图。见根 `requirements/CONVENTIONS.md`「状态定义」。

## 工作流

1. 从 [story.template.md](stories/story.template.md) 复制出新 story，选正确领域目录、未占用编号。
2. 完整填写 frontmatter（id / title / status / priority / epic / created / updated / tags）、目标、AC 表、范围边界、实现文件。
3. 推进过程中持续更新 `status`、`priority`、`updated`、`References`。
4. 合并后：YAML `status: Done`，补 PR 链接。

## 提交与 PR 关联方式

story ID 是仓库内的需求编号，不是 GitHub issue 编号。**不要**写成 `Closes #<APP>-US-001`。

```text
feat(<app>): implement ...

Refs: <APP>-US-XXX
```

PR 描述加 `## Related Stories` 小节列出关联 story。

## 需求门禁

更新需求后运行应用自己的门禁（如 `pnpm nx run <app>:requirements-check`，脚本随应用代码落地），自动核对状态、关闭硬依赖、派生视图与本地链接；通过结构门禁不等于通过真实能力验收。

## 变更步骤

1. 修改对应 story 的范围、AC、YAML `updated` 与 `status`。
2. 更新所属 Epic 的目标勾选、`status-overview.md`、`roadmap.md` 与 `capability-matrix.md`（若产品能力变更）。
3. 检查本地链接并运行应用门禁；文档不能用上游故事的 ✅ 代替本应用实测。

## 模板位置

| 类型          | 模板                                                                               |
| ------------- | ---------------------------------------------------------------------------------- |
| story         | [stories/story.template.md](stories/story.template.md)                             |
| epic          | [epics/epic.template.md](epics/epic.template.md)                                   |
| review        | [reviews/review.template.md](reviews/review.template.md)                           |
| code-scanning | [code-scanning/code-scanning.template.md](code-scanning/code-scanning.template.md) |
