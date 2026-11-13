# 产品级约定（Conventions）

沿用根 [CONVENTIONS](../../requirements/CONVENTIONS.md) 与[需求管理说明](../../requirements/README.md)，本文件只定义 Aiao Desktop 的增量规则。目录结构来自 [app-template](../../requirements/app-template/README.md)。本目录是产品根 `aiao-desktop/` 的需求目录：按[治理办法](../../requirements/application-governance.md)的多应用结构，web 与 e2e 两个应用共用 `ADESK` 前缀；只属于一个子应用的行为，在故事的范围或实现文件里标明归属。

## 文档类型与编号段

| 类型          | ID 与文件名                            | 目录                                                               |
| ------------- | -------------------------------------- | ------------------------------------------------------------------ |
| 用户故事      | `ADESK-US-XXX-description.md`          | `stories/<domain>/`                                                |
| 史诗          | `ADESK-EPIC-XXX.md`                    | `epics/`                                                           |
| Review        | `RV-<uuid>.md`，沿用根规范             | 仓库根 `requirements/reviews/<projectKey>/`；`reviews/` 只放旧记录 |
| Code scanning | `CS-XXX-描述.md`，编号对应 GitHub 告警 | `code-scanning/`                                                   |

| 领域           | 编号段            | 范围                                   |
| -------------- | ----------------- | -------------------------------------- |
| `platform/`    | ADESK-US-001～099 | 产品治理、工程结构、构建、门禁与交付   |
| `desktop/`     | ADESK-US-101～199 | 桌面外壳、窗口与内置应用               |
| `application/` | ADESK-US-201～299 | 应用体系、集成应用（微前端）与宿主服务 |

新增领域时再分配编号段，不预建没有故事的目录。

## 命名规范

文件名与上表的 ID 一致，不使用字母后缀的子故事。大故事在正文内分交付阶段；计划、调研与验收记录放 `plans/`；辅助文件不带 story frontmatter，不计入状态统计。

## 状态定义

故事五态 `Backlog` / `In Progress` / `In Review` / `Done` / `Blocked` 与根一致，YAML 是唯一真相源。`Done` 表示当前承诺的 AC 都有同层证据：桌面行为的证据是正式构建上的浏览器冒烟或真实浏览器操作，源码检索与构建通过不能代替。只在 Chromium 上验证过的行为，不写成跨浏览器支持。

Epic 使用 `Backlog` / `In Progress` / `Done`。Review 使用根规范的状态；Code scanning 使用 `Open` / `Resolved` / `Dismissed`，真相源为 GitHub。

## 工作流

1. 从 [story.template.md](stories/story.template.md) 创建故事，填写 frontmatter、范围、连续编号的 AC 与实现入口。
2. 产品内的硬依赖写 `dependsOn: [ADESK-US-101]`，平台能力写 `capabilities: [rxdb:US-301]`，没有依赖写空数组。平台故事的状态不能代替本产品的验收。
3. 改动可见行为时同步改冒烟（`apps/e2e/src/smoke.mjs`），故事的验收证据指向对应检查项。
4. 改故事后同步 Epic、状态总览、路线图、能力矩阵和验收台账，并更新 `updated`。
5. 运行产品门禁与相关代码验证。状态在实现 PR 里直接改，合并即生效。

门禁只认扁平 YAML 值与行内数组。要引入候选 AC、继承 AC 等新格式时，先补齐门禁支持与回归夹具，再登记。

## 提交与 PR 关联方式

```text
feat(aiao): add window snapping to the desktop

Refs: ADESK-US-101
```

PR 描述用 `## Related Stories` 列出故事。story ID 不是 GitHub issue 编号，不要写 `Closes #ADESK-US-101`。以后若有产品私有包，它的改动与应用功能在同一个 PR 里评审、合入，沿用根合并治理。

## 需求门禁

在仓库根目录运行：

```bash
pnpm nx run aiao-desktop:requirements-test
pnpm nx run aiao-desktop:requirements-check
```

脚本入口为 [check-requirements.mjs](../scripts/check-requirements.mjs)。它只绑定产品前缀 `ADESK`，校验逻辑在仓库共用的 [app-requirements.mjs](../../scripts/audit/app-requirements.mjs)：故事字段、ID 与文件名、AC、依赖环与关闭条件、平台引用、派生视图和本地链接。产品根的 `test` 目标把这两道门禁与密钥扫描的测试作为前置任务，随 affected 测试进入 CI。

## 模板位置

| 类型          | 模板                                                                       |
| ------------- | -------------------------------------------------------------------------- |
| Story         | [story.template.md](stories/story.template.md)                             |
| Epic          | [epic.template.md](epics/epic.template.md)                                 |
| Review        | 仓库根 [review.template.md](../../requirements/reviews/review.template.md) |
| Code scanning | [code-scanning.template.md](code-scanning/code-scanning.template.md)       |
