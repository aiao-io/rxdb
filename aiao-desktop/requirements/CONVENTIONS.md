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

文件名与上表的 ID 一致，不使用字母后缀的子故事。大故事在正文内用 `## 交付阶段` 表分阶段（规则见根 [CONVENTIONS](../../requirements/CONVENTIONS.md) 的「大故事分阶段」）；计划、调研与验收记录放 `plans/`；辅助文件不带 story frontmatter，不计入状态统计。

## 状态定义

故事五态 `Backlog` / `In Progress` / `In Review` / `Done` / `Blocked` 与根一致，YAML 是唯一真相源。`Done` 表示当前承诺的 AC 都有同层证据：桌面行为的证据是正式构建上的浏览器冒烟或真实浏览器操作，源码检索与构建通过不能代替。只在 Chromium 上验证过的行为，不写成跨浏览器支持。本轮浏览器范围按[D-19](decisions.md#d-19只验收桌面-chrome)只验收桌面Chrome；自动化与真实浏览器证据分别标注。

Epic 使用 `Backlog` / `In Progress` / `Done`。Review 使用根规范的状态；Code scanning 使用 `Open` / `Resolved` / `Dismissed`，真相源为 GitHub。

决策（[decisions.md](decisions.md)）描述的是目标形态、实现还没交付时，条目开头标「状态：已接受，尚未实现（ADESK-US-XXX）」，交付并验收后删去这行，免得被当成现状。

## 验收证据的写法

- AC 里不写会随登记表或配置漂移的数量（应用数、Dock 入口数、用例数、检查项数）；写「启动台里的每个内置应用」这类以登记表为准的说法，数量由单测或冒烟断言，历史结果里的数量留在带提交的台账行里。
- AC 里不写「即时」「数秒」「没有 flake」这类没有口径的说法：时间要有时限和起算点，稳定性只写「N 轮未出现」，不写成不存在缺陷。
- 验收台账的新证据行写明执行时的提交（短 SHA）、日期、环境、命令与产物位置，不写「本分支」。
- 不收录一次性、不可复现的探针结论：要么落成仓库里的夹具或脚本，要么记入台账的「尚未证明」。
- 只能在本机跑的实测（真实 GPU、读屏、真实键盘）要有仓库内的脚本或操作清单，结论带日期和环境记入台账。
- 用脚本派发的合成事件（按键、指针）证明不了真实输入设备上的行为，台账里分开写。
- 新增的交互界面（文件面板、拖放等）在同一个故事里给出键盘等效操作，不留给 [ADESK-US-108](stories/desktop/ADESK-US-108-accessibility.md) 一次性补；US-108 验收的是整条路径。

## 测量口径

凡是写时间、体积、耗时比较的 AC 与台账行，按下面的口径记，缺一项就不算可复验的证据：

| 项           | 要写明的内容                                                                     |
| ------------ | -------------------------------------------------------------------------------- |
| 环境         | 机器、操作系统、Node 与浏览器版本、有无 GPU                                      |
| 基线         | 比较对象的提交 SHA 或产物标识；基线先于实现测出，不事后补                        |
| 启动条件     | 冷启动还是热启动；是否清空站点数据与缓存；是已有数据的库还是全新的库             |
| 网络与缓存   | 真实网络、限速还是外网全部拦截；Service Worker 与 HTTP 缓存状态                  |
| 采样与统计   | 采样次数（至少 3 次）、取中位数还是最大值；离群值怎么处理                        |
| 阈值与误差   | 阈值怎么来（基线、预算或用户可感知的上限）；允许的误差；超过即失败，不写「大概」 |
| 不比较的东西 | 不计入的部分（例如夹具自检的耗时），单列                                         |

体积只证明打包边界，不证明更快；「更快」要靠耗时的基线和对比来证明。外网被测试路由拦截，不等于用户断网后能重新加载整个站点；要承诺离线启动，另设验收。

## 文档各管什么

| 文档      | 只回答的问题                                               | 放什么、不放什么                                       |
| --------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| README    | 产品是什么、当前范围（已验收 / 已立项 / 已知限制）、往哪读 | 术语只定义概念，不夹带加载策略和实现进度               |
| Story     | 用户可见的结果、边界、AC 与证据入口                        | 实现类名放技术笔记；检查项数、耗时不写进 AC            |
| Decisions | 已接受的约束、原因、状态与被替代关系                       | 不放大段临时排障日志                                   |
| Plans     | 带日期的设计与实施记录                                     | 与 Story 或 Decisions 冲突时以后两者为准               |
| 验收台账  | 具体版本、环境、命令、结果与产物                           | 检查项数量、运行耗时、部署编号放这里；不放新的需求承诺 |
| 后续方向  | 可讨论的候选，每项写场景与解锁条件                         | 不能直接变成下一版的工作承诺                           |

Plans 与 Story 或 Decisions 冲突时，在同一次修改里改掉 Plans（或标为历史），不让过期方案继续指导实现。

## 工作流

1. 从 [story.template.md](stories/story.template.md) 创建故事，填写 frontmatter、范围、连续编号的 AC 与实现入口。
2. 产品内的硬依赖写 `dependsOn: [ADESK-US-101]`，平台能力写 `capabilities: [rxdb:US-301]`，没有依赖写空数组。平台故事的状态不能代替本产品的验收。`dependsOn` 管**关闭条件**（本故事 Done 要求被依赖的故事已 Done）；分阶段的故事在阶段表的「依赖」列写**启动时机**（例如依赖另一个故事的某个阶段），允许两个故事的阶段交错，两者不矛盾。
3. 改动可见行为时同步改冒烟（`apps/e2e/src/smoke.mjs`），故事的验收证据指向对应检查项。
4. 改故事后同步所属 Epic 的故事清单、状态总览和验收台账，并更新 `updated`；行为边界变了同步能力矩阵，顺序或依赖变了同步路线图（路线图只写顺序与依赖，不复制故事状态）。
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
