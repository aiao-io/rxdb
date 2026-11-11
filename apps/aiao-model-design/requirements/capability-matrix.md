# 模型设计器能力矩阵

本表区分源码可见的现有接线与应用故事的验收状态。执行证据见 [verification-report](verification-report.md)。

| 能力                         | 当前入口与边界                                                                                                                                   | 应用验收                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 本地模型、画布与表格编辑     | [designer.component.ts](../src/app/model-designer/designer.component.ts)、[database.ts](../src/app/database.ts)；sqlite-wasm + IndexedDB 本地库 | 从 aiao-enterprise 迁入的既有能力，不在本史诗范围                         |
| 代码与 SQL 预览、版本管理    | [code-generator.service.ts](../src/app/model-designer/services/code-generator.service.ts)、[sql/](../src/app/model-designer/sql/index.ts)        | 既有能力；远程 schema 对比、SQL 执行与发包需宿主注入适配器                |
| AI 分支的合并与丢弃          | [ai-branch.service.ts](../src/app/model-designer/services/ai-branch.service.ts)；平台 [US-301](../../../requirements/stories/collaboration/US-301-version-control.md) | 既有能力，接入持久会话后由 MODEL-US-102 验收                              |
| 登录                         | [auth.ts](../server/edge/auth.ts)；Supabase 账号，HttpOnly cookie                                                                                 | 既有能力，会话签发复用它（MODEL-US-002）                                  |
| AI 建模（旧链路）            | [ai.ts](../server/ai.ts)：Worker 调 DeepSeek，生成接口返回整块 JSON，对话接口在文本里夹带变更块；120 秒超时                                      | 将由 MODEL-US-002 / MODEL-US-102 删除                                     |
| 应用级需求与门禁             | [MODEL-US-001](stories/platform/MODEL-US-001-application-requirements.md)                                                                        | 进行中                                                                    |
| 持久建模智能体               | [MODEL-US-101](stories/agent/MODEL-US-101-modeling-tools-agent.md)、[MODEL-US-102](stories/agent/MODEL-US-102-designer-durable-session.md)       | 待实现                                                                    |
| 手动修改回读、澄清提问       | [MODEL-US-103](stories/agent/MODEL-US-103-manual-edit-readback.md)、[MODEL-US-104](stories/agent/MODEL-US-104-clarifying-questions.md)           | 待实现                                                                    |

不支持声明：本轮不包含多标签页同时驱动同一会话、实例内网化代理、嵌套属性的 AI 生成。
