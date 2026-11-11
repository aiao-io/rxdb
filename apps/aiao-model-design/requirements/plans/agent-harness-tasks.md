# 持久建模智能体实施清单

对应 [MODEL-EPIC-001](../epics/MODEL-EPIC-001.md)。全部切片在同一分支、同一 PR 推进；每个切片先写失败的测试，再实现。

## 切片

| 切片 | 故事         | 内容                                                                                      |
| ---- | ------------ | ----------------------------------------------------------------------------------------- |
| 1    | MODEL-US-001 | 共享门禁脚本、应用门禁与夹具、需求目录                                                    |
| 2    | MODEL-US-101 | `shared/model-ops`：快照类型、操作日志、校验、应用、差异、概要                            |
| 3    | MODEL-US-101 | 智能体定义解析、模型解析、一工具一文件、`chat.agent` 装配、离线测试                       |
| 4    | MODEL-US-002 | Worker 会话配置与签发、删除旧接口、`trigger.config.ts` 与 Nx 目标、部署说明               |
| 5    | MODEL-US-102 | 会话状态实体、快照构建、ops 写入器、`Chat` + `TriggerChatTransport`、面板改造、删除旧链路 |
| 6    | MODEL-US-103 | 回读基线、快照差异随消息发送、`prepareMessages` 注入                                      |
| 7    | MODEL-US-104 | 提问工具、选项卡片、回填续轮                                                              |
| 8    | 全部         | 派生视图与验收台账、格式化、门禁与全量验证                                                |

## 验证命令

在仓库根目录，先切 Node 26 并固定 Nx 工作区根：

```bash
export PATH="$(ls -d $HOME/.nvm/versions/node/v26.* | sort -V | tail -1)/bin:$PATH"
export NX_WORKSPACE_ROOT_PATH="$PWD" NX_DAEMON=false
pnpm nx run aiao-model-design:requirements-test
pnpm nx run aiao-model-design:requirements-check
pnpm nx run aiao-model-design:test-node
pnpm nx run aiao-model-design:typecheck
pnpm nx run aiao-model-design:test
pnpm nx lint aiao-model-design --max-warnings=0
pnpm nx run aiao-model-design:build-server
```
