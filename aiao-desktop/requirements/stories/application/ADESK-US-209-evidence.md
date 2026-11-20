# ADESK-US-209 验收证据

## 验收结论

2026-11-21，GitHub 应用与 OPFS Git 工作区的阶段 A、B、C 均完成。应用入口、本地 Git 工作区、持久化、并发写入、OAuth 边界、GitHub API 远端操作和键盘路径通过本地单测、类型检查、lint、正式构建和受控 Chromium 冒烟。

## 单元测试与静态检查

- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:test --output-style=static` 通过。
- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:typecheck --output-style=static` 通过。
- `NX_NO_CLOUD=true pnpm nx run aiao-desktop-web:lint --output-style=static` 通过。
- web 覆盖率为 statements 94.89%、branches 88.97%、functions 95.81%、lines 96.86%。
- Git Worker、Git Runtime、归档、索引、差异、状态解析、GitHub API、OAuth、会话存储和仓库合并边界均由 `aiao-desktop-web:test` 覆盖。

## 正式 Chromium 冒烟

执行命令如下。

```bash
NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e \
  --args="--group=github-app --parallel=1 --report=../../requirements/evidence/2026-11-21/github-app-green.json" \
  --output-style=static
```

报告文件为 [github-app-green.json](../../evidence/2026-11-21/github-app-green.json)。

- `passed: true`
- `clean: true`
- 27 项检查全部为 `true`
- `problems`、`failedKeys`、`missingKeys`、`pageErrors` 均为空
- 环境为 Apple M1 Max、macOS Darwin 27.2.0、Node v26.12.0、Chromium 158.0.8127.18 无头模式
- 外网请求由测试夹具拦截，OAuth 使用受控回调和 token 交换夹具

## 验收覆盖

- 应用从启动台、Applications 和聚焦搜索打开
- 空态、仓库工具栏、Changes / History、文件列表、编辑器和差异面板
- OPFS 本地仓库创建、编辑保存、暂存、取消暂存、丢弃、提交、历史和分支切换
- 刷新恢复、仓库导出和导入往返
- 仓库搜索、远端分支选择、公开仓库打开和私有仓库认证边界
- OAuth 取消、授权窗口关闭、成功授权和交换失败
- PAT 无效与成功路径
- 远端拉取、推送、分支冲突和网络失败
- 键盘操作和 Worker 失败单元测试覆盖

## 证据边界

本报告证明受控桌面 Chromium 和受控 GitHub API 网络环境下的功能闭环。它不包含真实 GitHub 账号授权、生产远端仓库写入、跨设备同步或 US-108 的 VoiceOver 人工播报。US-108 继续保持 `In Review`，按用户要求延期验收。
