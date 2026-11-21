# 应用级约定（Conventions）

沿用根 [CONVENTIONS](../../requirements/CONVENTIONS.md) 与[需求管理说明](../../requirements/README.md)，本文件只定义模型设计器的增量规则。目录结构来自 [app-template](../../requirements/app-template/README.md)。本目录是产品根 `aiao-model-design/` 的需求目录：按[治理办法](../../requirements/application-governance.md)的多应用结构，web、api、agent 三个应用与私有包共用 `MODEL` 前缀；只属于一个子应用的行为，在故事的范围或实现文件里标明归属。

## 文档类型与编号段

| 类型          | ID 与文件名                            | 目录                                                               |
| ------------- | -------------------------------------- | ------------------------------------------------------------------ |
| 用户故事      | `MODEL-US-XXX-description.md`          | `stories/<domain>/`                                                |
| 史诗          | `MODEL-EPIC-XXX.md`                    | `epics/`                                                           |
| Review        | `RV-<uuid>.md`，沿用根规范             | 仓库根 `requirements/reviews/<projectKey>/`；`reviews/` 只放旧记录 |
| Code scanning | `CS-XXX-描述.md`，编号对应 GitHub 告警 | `code-scanning/`                                                   |

| 领域        | 编号段            | 范围                                 |
| ----------- | ----------------- | ------------------------------------ |
| `platform/` | MODEL-US-001～099 | 应用治理、会话签发、部署与工程基线   |
| `agent/`    | MODEL-US-101～199 | 建模智能体、工具、会话接入与人机协作 |

新增领域时再分配编号段，不预建没有故事的目录。

## 命名规范

文件名与上表的 ID 一致，不使用字母后缀的子故事。大故事在正文内分交付阶段；计划、调研与验收记录放 `plans/`；辅助文件不带 story frontmatter，不计入状态统计。

## 状态定义

故事五态 `Backlog` / `In Progress` / `In Review` / `Done` / `Blocked` 与根一致，YAML 是唯一真相源。`Done` 表示已合并，且当前承诺的 AC 都有同层证据。需要真实 Trigger.dev 实例或真实模型才能关闭的 AC，在拿到真实环境证据前保持 ⚠️ 或 ⬜，所属故事不能标 `Done`。

Epic 使用 `Backlog` / `In Progress` / `Done`。Review 使用根规范的状态；Code scanning 使用 `Open` / `Resolved` / `Dismissed`，真相源为 GitHub。

## 工作流

1. 从 [story.template.md](stories/story.template.md) 创建故事，填写 frontmatter、范围、连续编号的 AC 与实现入口。
2. 应用内的硬依赖写 `dependsOn: [MODEL-US-101]`，平台能力写 `capabilities: [rxdb:US-301]`，没有依赖写空数组。平台故事的状态不能代替本应用的验收。
3. 改故事后同步 Epic、状态总览、路线图、能力矩阵和验收台账，并更新 `updated`。
4. 运行应用结构门禁与相关代码验证。状态在实现 PR 里直接改，合并即生效。

门禁只认扁平 YAML 值与行内数组。要引入候选 AC、继承 AC 等新格式时，先补齐门禁支持与回归夹具，再登记。

## 提交与 PR 关联方式

```text
feat(aiao-model-design): run the modeling agent on trigger.dev

Refs: MODEL-US-101
```

PR 描述用 `## Related Stories` 列出故事。story ID 不是 GitHub issue 编号，不要写 `Closes #MODEL-US-101`。涉及公共包的改动与应用功能在同一个 PR 里评审、合入，沿用根合并治理。

## 需求门禁

在仓库根目录运行：

```bash
pnpm nx run aiao-model-design:requirements-test
pnpm nx run aiao-model-design:requirements-check
```

脚本入口为 [check-requirements.mjs](../scripts/check-requirements.mjs)。它只绑定应用前缀 `MODEL`，校验逻辑与 Admin 应用共用 [app-requirements.mjs](../../scripts/audit/app-requirements.mjs)：故事字段、ID 与文件名、AC、依赖环与关闭条件、平台引用、派生视图和本地链接。应用 `test` 目标把这两道门禁作为前置任务，随 affected 测试进入常规验证。

## 模板位置

| 类型          | 模板                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| Story         | [story.template.md](stories/story.template.md)                             |
| Epic          | [epic.template.md](epics/epic.template.md)                                 |
| Review        | 仓库根 [review.template.md](../../requirements/reviews/review.template.md) |
| Code scanning | [code-scanning.template.md](code-scanning/code-scanning.template.md)       |
