# 应用级约定（Conventions）

沿用根 [CONVENTIONS](../../../requirements/CONVENTIONS.md) 与[需求管理说明](../../../requirements/README.md)，本文件只定义 Admin 应用增量。目录结构来自 [app-template](../../../requirements/app-template/README.md)。

## 文档类型与编号段

| 类型          | ID 与文件名                            | 目录                |
| ------------- | -------------------------------------- | ------------------- |
| 用户故事      | `ADMIN-US-XXX-description.md`          | `stories/<domain>/` |
| 史诗          | `ADMIN-EPIC-XXX.md`                    | `epics/`            |
| Review        | `RV-XXX-描述.md`                       | `reviews/`          |
| Code scanning | `CS-XXX-描述.md`，编号对应 GitHub 告警 | `code-scanning/`    |

| 领域        | 编号段            | 范围                     |
| ----------- | ----------------- | ------------------------ |
| `platform/` | ADMIN-US-001～099 | 应用治理、配置与工程基线 |
| `domain/`   | ADMIN-US-101～199 | 样例业务、页面与导航扩展 |

新增领域再分配编号段，不预建无故事的目录；复制与发行未进入当前范围。

## 命名规范

文件名与上表的 ID 保持一致，不使用字母后缀子故事。大故事在正文内分交付阶段，计划与验收记录放 `plans/`，辅助文件不带 story frontmatter、不计入状态统计。

## 状态定义

故事五态 `Backlog` / `In Progress` / `In Review` / `Done` / `Blocked` 与根相同，YAML 是唯一真相源。`Done` 表示已合并且当前承诺 AC 均有同层证据；本地实现完成、待评审使用 `In Review`。

Epic 使用 `Backlog` / `In Progress` / `Done`。Review 使用 `Open` / `Resolved`；Code scanning 使用 `Open` / `Resolved` / `Dismissed`，其真相源为 GitHub。

## 工作流

1. 从 [story.template.md](stories/story.template.md) 创建故事，填写 frontmatter、范围、连续编号的 AC 与实现入口。
2. 应用硬依赖写 `dependsOn: [ADMIN-US-001]`，平台能力写 `capabilities: [rxdb:US-526]`。没有依赖使用空数组。平台状态不能代替应用验收。
3. 修改故事后同步 Epic、状态总览、路线图、能力矩阵和验收台账，更新 `updated`。
4. 运行应用结构门禁与相关代码验证；本地通过后可进入 `In Review`，合并后补 PR 引用再标 `Done`。

门禁支持当前使用的扁平 YAML 值与行内数组。新增候选 AC 或继承 AC 等格式时，先补齐门禁支持与回归夹具，再登记，避免文档约定超出实际校验。

## 提交与 PR 关联方式

```text
feat(rxdb-admin-template-react): implement application template configuration

Refs: ADMIN-US-002
```

PR 描述使用 `## Related Stories` 列出故事；story ID 不是 GitHub issue 编号，不写 `Closes #ADMIN-US-001`。涉及公共包的改动与应用功能同一 PR 评审和合入，沿用根合并治理。

## 需求门禁

在仓库根目录运行：

```bash
pnpm nx run rxdb-admin-template-react:requirements-test
pnpm nx run rxdb-admin-template-react:requirements-check
```

脚本入口为 [check-requirements.mjs](../scripts/check-requirements.mjs)，校验故事字段、ID 与文件名、AC、依赖环与关闭条件、平台引用、派生视图和本地链接。代码校验命令见 [应用 README](../README.md#启动与验证)。

应用 `test` 目标以前置任务执行这两道门禁，随现有 affected 测试进入常规验证。

## 模板位置

| 类型          | 模板                                                                 |
| ------------- | -------------------------------------------------------------------- |
| Story         | [story.template.md](stories/story.template.md)                       |
| Epic          | [epic.template.md](epics/epic.template.md)                           |
| Review        | [review.template.md](reviews/review.template.md)                     |
| Code scanning | [code-scanning.template.md](code-scanning/code-scanning.template.md) |
