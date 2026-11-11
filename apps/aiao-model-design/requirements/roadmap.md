# 模型设计器路线图

状态见 [status-overview](status-overview.md)，本页不维护第二份状态。整个史诗在同一个分支、同一个 PR 里推进。

## 当前批次：真实环境验收

代码与离线验收已完成，剩下的都要在真实环境执行：

| 顺序 | 故事                                                                                      | 关闭条件                                                        |
| ---- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1    | [MODEL-US-002](stories/platform/MODEL-US-002-trigger-session-gateway.md) 会话签发与部署   | 部署智能体到自建实例，真实浏览器登录后创建会话并收到回复（#10） |
| 2    | [MODEL-US-101](stories/agent/MODEL-US-101-modeling-tools-agent.md) 建模工具与智能体定义   | 真实 DeepSeek 建电商订单模型，关系成对、整体校验无问题（#11）   |
| 3    | [MODEL-US-102](stories/agent/MODEL-US-102-designer-durable-session.md) 设计器接入持久会话 | 刷新后从游标续流（#3）；真实浏览器生成并合并（#10）             |
| 4    | [MODEL-US-104](stories/agent/MODEL-US-104-clarifying-questions.md) 需求澄清提问           | 浏览器里确认选项卡片的显示与禁用（#1、#4）                      |
| 5    | [MODEL-US-103](stories/agent/MODEL-US-103-manual-edit-readback.md) 手动修改回读           | AC 已全部通过，随 MODEL-US-102 一起关闭                         |

前置：自建 Trigger.dev 实例地址、项目 ref、Worker 用的 `TRIGGER_SECRET_KEY`，以及实例环境变量里的 `DEEPSEEK_API_KEY`。步骤见[应用 README](../README.md#部署)，记录写进[验收台账](verification-report.md)。

## 不排期目标

Worker 代理会话流、多标签页协作、后台任务唤醒智能体（如从现有数据库反向建模）见 [future-requirements](future-requirements.md)，具体场景出现后再立故事。
