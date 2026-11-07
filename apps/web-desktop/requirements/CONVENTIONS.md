# Web Desktop 应用级约定

沿用根 [CONVENTIONS](../../../requirements/CONVENTIONS.md) 和 [应用需求管理办法](../../../requirements/app-template/README.md)，这里只记录应用增量。

## 编号

| 目录                | 编号段              | 内容                   |
| ------------------- | ------------------- | ---------------------- |
| stories/shell       | DESKTOP-US-001～099 | 桌面外壳和模式         |
| stories/window      | DESKTOP-US-101～199 | 窗口和多任务           |
| stories/application | DESKTOP-US-201～299 | 应用目录和生命周期     |
| stories/runtime     | DESKTOP-US-301～399 | 仓内运行内核与框架适配 |
| stories/integration | DESKTOP-US-401～499 | 授权与桌面服务         |
| stories/workspace   | DESKTOP-US-501～599 | 本地会话与工作连续性   |
| stories/files       | DESKTOP-US-601～699 | 虚拟文件与内置编辑器   |
| stories/quality     | DESKTOP-US-701～799 | 验收与交付             |

故事文件为 DESKTOP-US-XXX-description.md，Epic 为 DESKTOP-EPIC-XXX.md。数字 AC 在单个故事内从 1 连续编号。大故事在原文件分交付阶段，不使用字母后缀故事。

## 状态与依赖

五态和验收证据规则完全沿用根约定。status 只在 story YAML 维护。dependsOn 是应用内部硬依赖，不允许悬空和成环；capabilities 使用 rxdb:US-XXX 引用平台能力，不复制平台状态。milestone 为 M0、M1 或 M2，是范围分组，不是承诺日期。High、Medium、Low 表示组内优先级，不替代依赖顺序。

运行内核相关故事已进入实现，状态以 YAML 为准。实际代码路径、测试符号、构建版本和真实环境证据必须补入故事；不可把计划路径、模拟测试或文档检查当产品验收证据。

## 变更与门禁

修改故事后同步所属 Epic、status-overview、roadmap、capability-matrix 及受影响规格。提交使用 Refs: DESKTOP-US-XXX，不把故事编号写成 GitHub issue 的 Closes。

应用脚手架落地时必须注册 Nx requirements-check 目标，检查 YAML、唯一 ID、AC 连号、硬依赖和闭环、派生视图、相对链接与标题锚点；桌面应用尚未注册该目标，Orbit 内核已有独立 Nx 项目；不虚构已存在的产品门禁任务。需求文档使用 Nx format 检查，当前结构核验的范围与结果见分层验收台账。

实现与回归任务全部通过 pnpm nx 运行。代码遵守 TS strict、ESLint 零警告、TSDoc、TDD 和根覆盖率阈值；运行内核新增的 90% 产品门槛见 DESKTOP-US-702，不能靠文字改变根覆盖率脚本的既有分层。
