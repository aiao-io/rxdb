---
id: ADESK-EPIC-006
status: Backlog
startDate: TBD
targetDate: TBD
owner: jimmy
---

# 远程应用仿真与调度

## 愿景

Aiao Desktop 作为本地控制面和仿真显示面，让用户在当前桌面里操作授权的远程机器。远程机器执行真实应用、文件和网络操作，再把结构化状态、过程和结果返回本地窗口，使用户可以在本地使用远程环境中的 Claude 工具、Finder 和网络能力。

## 为什么单列一个 Epic

[ADESK-EPIC-003](ADESK-EPIC-003.md) 解决集成 Web 应用在当前浏览器桌面中的登记、加载和窗口宿主。远程应用还需要远程目标注册、连接会话、操作调度、结果回传、远程权限、断线恢复和远程数据来源边界，属于跨机器的运行模型，单独管理验收和风险。

## 目标

- [ ] 建立授权远程目标、能力声明和可恢复连接会话（[ADESK-US-210](../stories/application/ADESK-US-210-remote-app-simulation-and-scheduling.md)）。
- [ ] 把本地用户操作交给远程真实应用执行，并把状态、进度、结果和失败反馈到本地仿真窗口（[ADESK-US-210](../stories/application/ADESK-US-210-remote-app-simulation-and-scheduling.md)）。
- [ ] 验证 Claude 工具、远程 Finder 和远程网络浏览三个代表性场景（[ADESK-US-210](../stories/application/ADESK-US-210-remote-app-simulation-and-scheduling.md)）。
- [ ] 支持任务排队、目标选择、取消、重连、结果追踪和敏感操作授权（[ADESK-US-210](../stories/application/ADESK-US-210-remote-app-simulation-and-scheduling.md)）。

## 故事

> 本清单只列范围，**不带状态**。状态见 [status-overview](../status-overview.md)（真相源是各 story 的 YAML `status`）。

- [ADESK-US-210 远程应用仿真与调度](../stories/application/ADESK-US-210-remote-app-simulation-and-scheduling.md) (High)

## 非目标

- 当前浏览器版或 PWA 自动获得远程执行能力。
- 把任意公网地址或未知机器变成无需授权的远程代理。
- 像素级复制整台远程操作系统桌面，以及音频、摄像头、USB 和操作系统级设备转发。
- 把远程应用数据自动写入本地虚拟磁盘、桌面备份或本地应用数据库。
- 为远程机器提供 root、管理员或超出应用授权范围的隐式权限。
