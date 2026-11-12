# 模型设计器路线图

状态见 [status-overview](status-overview.md)，本页不维护第二份状态。整个史诗在同一个分支、同一个 PR 里推进。

## 当前批次：真实账号登录复核

离线验收与本机自建实例上的真实环境验收已完成，记录见[验收台账](verification-report.md)。只剩 MODEL-US-002 #10 一项，其余故事随它关闭：

| 顺序 | 故事                                                                                      | 关闭条件                                                                      |
| ---- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1    | [MODEL-US-002](stories/platform/MODEL-US-002-trigger-session-gateway.md) 会话签发与部署   | 用真实 Supabase 账号登录后发送第一条消息，会话创建成功、回复从实例到达（#10） |
| 2    | [MODEL-US-102](stories/agent/MODEL-US-102-designer-durable-session.md) 设计器接入持久会话 | AC 已全部通过，随硬依赖 MODEL-US-002 关闭                                     |
| 3    | [MODEL-US-103](stories/agent/MODEL-US-103-manual-edit-readback.md) 手动修改回读           | AC 已全部通过，随 MODEL-US-102 关闭                                           |
| 4    | [MODEL-US-104](stories/agent/MODEL-US-104-clarifying-questions.md) 需求澄清提问           | AC 已全部通过，随 MODEL-US-102 关闭                                           |

部署到正式的自建实例时，按[应用 README](../README.md#部署) 的步骤配置并部署，再顺手复核一遍台账里的真实环境场景。

## 不排期目标

Worker 代理会话流、多标签页协作、后台任务唤醒智能体（如从现有数据库反向建模）见 [future-requirements](future-requirements.md)，具体场景出现后再立故事。
