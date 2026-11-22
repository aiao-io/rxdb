---
id: ADESK-US-211
title: 终端、GitHub Desktop 与 Aiao Code 共用仓库
status: Done
priority: High
epic: ADESK-EPIC-004
created: 2026-11-22
updated: 2026-11-23
tags: [application, terminal, git, github, orbit, opfs]
dependsOn: [ADESK-US-203, ADESK-US-206, ADESK-US-209]
capabilities: []
---

# 用户故事：终端、GitHub Desktop 与 Aiao Code 共用仓库

## 作为/我想要/以便

**作为** 在 Aiao Desktop 开发项目的用户，**我想要** 在终端初始化仓库，把目录拖入 GitHub Desktop，再用 Aiao Code 打开当前仓库，**以便** 在三个入口继续编辑、查看差异和提交，保留同一份历史和暂存状态。

## 范围边界

桌面 Chrome 上，终端的本地目录指 Macintosh HD 卷内目录。菜单沿用 File → Add Local Repository，仓库操作提供 Open in Aiao Code。桌面 Finder 内的目录按原位置打开。用户从操作系统选取或拖入 Git 目录时，界面明确导入到浏览器工作区，保留可支持的 `.git`、分支、暂存区和工作区。远端沿用 US-209 的 GitHub HTTPS 与 OAuth / PAT 范围。用户可在离线时配置 `origin`。系统选取的目录导入到 `~/Documents/GitHub/<目录名>`，后续编辑保存在桌面卷内。远端同步从已提交的工作树创建 GitHub API 提交，远端 SHA 由 GitHub 生成。

## 交付阶段

| 阶段 | 交付物                       | 验收    |
| ---- | ---------------------------- | ------- |
| A    | 桌面终端、目录识别、仓库入口 | AC1–AC3 |
| B    | 远端配置与同步               | AC4–AC5 |
| C    | 跨源编辑、并发写入、重开     | AC6–AC8 |

## 验收标准

| #   | 前置条件与操作                                                                                          | 预期结果                                                                                               | 状态 |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 在终端进入新目录，执行 `git init`、`add`、`commit -m`、`branch`、`checkout` 和 `status`                 | 子目录也能找到仓库。成功和失败通过退出码区分，重开可看到相同 HEAD 和分支                               | ✅   |
| 2   | 用 Add Local Repository、拖入桌面 Finder 目录或 `open -a "GitHub Desktop" .` 打开已初始化目录，再次打开 | 显示原仓库的 HEAD、暂存与未暂存差异，列表只有一个对应条目。普通目录提示可初始化                        | ✅   |
| 3   | 从系统选取或拖入有历史的目录，或拖入多个目录                                                            | 逐仓库显示导入结果和桌面位置。坏元数据、超限、取消和同名目标不会覆盖已有数据；键盘可用菜单完成同一操作 | ✅   |
| 4   | 在仓库界面添加远端，从终端执行 `git remote -v`，再移除 `origin` 并重开                                  | 两端显示相同的持久化远端。重复添加、无效地址和缺少远端给出可操作的反馈                                 | ✅   |
| 5   | 对受支持的 GitHub 分支执行 fetch、pull、push，模拟无权限、断网和远端领先                                | fetch 保留工作区和本地整合基线；成功 pull 后看到远端改动；成功 push 可在远端读回；冲突保留本地内容     | ✅   |
| 6   | 从仓库选择 Open in Aiao Code，编辑并保存文本和二进制文件                                                | 进入所选仓库。GitHub Desktop 和终端能看到相同字节与未提交差异。覆盖一个大于 Orbit 单消息限制的项目     | ✅   |
| 7   | 两个窗口从同一版本编辑，先后保存；关闭编辑器后重开，并单独访问 Aiao Code                                | 过期保存被拒绝且可找回草稿；重开原仓库恢复成功版本。独立启动使用编辑器自己的项目                       | ✅   |
| 8   | 用未授权实例、已关闭窗口、其他项目 ID 或越界路径请求文件                                                | 拒绝请求。跨源窗口只接收当前项目的受控数据；OPFS 句柄和 GitHub 凭据留在桌面端                          | ✅   |

## 技术笔记

`navigator.storage.getDirectory()` 打开调用方的存储桶。桌面通过已校验来源的 Orbit 会话给编辑器一个窗口绑定的 `projectId`。打开时按版本分块传输工作区快照。编辑器保存时传回变更的文件、删除路径和 `expectedRevision`。宿主收到完整请求后在仓库锁内检查版本并写入，版本落后时编辑器保留草稿。Git 元数据、OPFS 句柄和桌面 GitHub 凭据都由宿主管理。独立访问 Aiao Code 使用原有后端。见 [File System Standard](https://fs.spec.whatwg.org/#api) 和 [GitHub Desktop 的本地仓库交互](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-a-repository-from-your-local-computer-to-github-desktop)。

## 实现文件

- [共享仓库服务](../../../apps/web/src/app/services/github-workspace.ts)
- [GitHub Desktop](../../../apps/web/src/app/apps/github/github.ts)
- [终端虚拟机](../../../apps/web/src/app/vm/virtual-machine.ts)
- [Orbit 桌面协议](../../../../packages/orbit/src/desktop.ts)
- [Aiao Code 工作台入口](../../../../apps/aiao-vscode/src/app/app.component.ts)

## 验收证据

2026-11-23，桌面与 Aiao Code 的正式构建通过 Chromium 验收。系统 Git 目录导入保留原提交 SHA 和暂存区，远端夹具读回已发布分支的文件。两个跨源编辑窗口验证了版本冲突和 1,100,000 字节二进制文件往返。[逐项证据与复验命令](../../evidence/2026-11-23/git-workspace.md)

## References

- [ADESK-US-209 GitHub 应用与 OPFS Git 工作区](ADESK-US-209-github-opfs-workbench.md)
- [ADESK-EPIC-004 GitHub 开发工作台](../../epics/ADESK-EPIC-004.md)
