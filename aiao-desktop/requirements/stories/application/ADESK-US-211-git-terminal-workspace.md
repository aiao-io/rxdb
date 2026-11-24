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

**作为** 在 Aiao Desktop 开发项目的用户，**我想要** 在终端用 `code .` 打开并编辑当前目录，**以便** 保存到桌面原文件；如果目录是 Git 仓库，也能在 GitHub Desktop 和终端查看同一份差异、历史和暂存状态。

## 范围边界

桌面 Chrome 上，终端的本地目录指 Macintosh HD 卷内目录。菜单沿用 File → Add Local Repository，仓库操作提供 Open in Aiao Code 和 Open in Terminal。桌面 Finder 内的目录按原位置打开。用户从操作系统选取或拖入 Git 目录时，界面明确导入到浏览器工作区，保留可支持的 `.git`、分支、暂存区和工作区。尚未挂载到卷内的克隆仓库第一次在终端打开时写入 `~/Documents/GitHub/`，仓库标识与历史不变，不覆盖同名目标。远端沿用 US-209 的 GitHub HTTPS 与 OAuth / PAT 范围。用户可在离线时配置 `origin`。系统选取的目录导入到 `~/Documents/GitHub/<目录名>`，后续编辑保存在桌面卷内。远端同步从已提交的工作树创建 GitHub API 提交，远端 SHA 由 GitHub 生成。

`code .` 面向桌面用户主目录内的文件夹。Git 根复用原仓库；普通目录和 Git 子目录按指定路径原位编辑，不自动初始化仓库。`open -a "Aiao Code" .` 也绑定指定目录。打开失败时不会换成最近项目。

向 Aiao 内置 GitHub Desktop 窗口拖入单个未登记目录时，打开 **Add Local Repository** 并预填路径或系统目录名。取消不导入、不登记；已登记的卷内仓库（包括其子目录）直接切换到已有仓库。普通卷内目录须显式选择 **Create Repository Here** 才原位初始化。系统目录确认后导入卷内，不改本机原目录；一次拖入多个系统目录仍逐一导入并报告结果。该入口不调用系统安装的 GitHub Desktop 应用。

在内置 GitHub Desktop 中打开仓库、Finder 或 Aiao Code 不显示 `Opened …` 提示；导入结果和错误仍会显示。

## 交付阶段

| 阶段 | 交付物                       | 验收    |
| ---- | ---------------------------- | ------- |
| A    | 桌面终端、目录识别、仓库入口 | AC1–AC3 |
| B    | 远端配置与同步               | AC4–AC5 |
| C    | 跨源编辑、并发写入、重开     | AC6–AC9 |

## 验收标准

| #   | 前置条件与操作                                                                                          | 预期结果                                                                                               | 状态 |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 在终端进入新目录，执行 `git init`、`add`、`commit -m`、`branch`、`checkout` 和 `status`                 | 子目录也能找到仓库。成功和失败通过退出码区分，重开可看到相同 HEAD 和分支                               | ✅   |
| 2   | 用 Add Local Repository、拖入桌面 Finder 目录或 `open -a "GitHub Desktop" .` 打开已初始化目录，再次打开 | 显示原仓库的 HEAD、暂存与未暂存差异，列表只有一个对应条目。普通目录提示可初始化                        | ✅   |
| 3   | 从系统选取或拖入有历史的目录，或拖入多个目录                                                            | 逐仓库显示导入结果和桌面位置。坏元数据、超限、取消和同名目标不会覆盖已有数据；键盘可用菜单完成同一操作 | ✅   |
| 4   | 从 Repository → Repository Settings… 添加或更换 `origin`，从终端读回，再移除远端并重开                  | 两端读取同一持久化配置；取消不改配置，错误留在对话框，换仓库地址后不复用旧远端基线                     | ✅   |
| 5   | 对受支持的 GitHub 分支执行 fetch、pull、push，模拟无权限、断网和远端领先                                | fetch 保留工作区和本地整合基线；成功 pull 后看到远端改动；成功 push 可在远端读回；冲突保留本地内容     | ✅   |
| 6   | 在仓库根运行 `code .`，或从仓库选择 Open in Aiao Code，编辑并保存文本和二进制文件                       | 进入所选仓库。GitHub Desktop 和终端能看到相同字节与未提交差异。覆盖一个大于 Orbit 单消息限制的项目     | ✅   |
| 7   | 两个窗口从同一版本编辑，先后保存；关闭编辑器后重开，并单独访问 Aiao Code                                | 过期保存被拒绝且可找回草稿；重开原仓库恢复成功版本。独立启动使用编辑器自己的项目                       | ✅   |
| 8   | 用未授权实例、已关闭窗口、其他项目 ID 或越界路径请求文件                                                | 拒绝请求。跨源窗口只接收当前项目的受控数据；OPFS 句柄和 GitHub 凭据留在桌面端                          | ✅   |
| 9   | Aiao Code 已有最近项目；在终端进入普通目录，用 `code .` 打开，编辑后保存，再关闭重开                    | 只打开指定目录，改动写回桌面原文件，不建 `.git`。路径无效时报告错误，不启动最近项目                    | ✅   |

## 技术笔记

`navigator.storage.getDirectory()` 打开调用方的存储桶。桌面通过已校验来源的 Orbit 会话给编辑器一个窗口绑定的 `projectId`。打开时按版本分块传输工作区快照。编辑器保存时传回变更的文件、删除路径和 `expectedRevision`。宿主收到完整请求后在仓库锁内检查版本并写入，版本落后时编辑器保留草稿。Git 元数据、OPFS 句柄和桌面 GitHub 凭据都由宿主管理。独立访问 Aiao Code 使用原有后端。见 [File System Standard](https://fs.spec.whatwg.org/#api) 和 [GitHub Desktop 的本地仓库交互](https://docs.github.com/en/desktop/adding-and-cloning-repositories/adding-a-repository-from-your-local-computer-to-github-desktop)。

普通目录复用同一工作区协议，由桌面在磁盘锁内按内容版本检查并写回。窗口的目录绑定保留在桌面端，不把路径传给编辑器。显式绑定的窗口须成功读取该工作区才能报告就绪。

## 实现文件

- [共享仓库服务](../../../apps/web/src/app/services/github-workspace.ts)
- [普通目录工作区](../../../apps/web/src/app/services/desktop-folder-workspace.ts)
- [GitHub Desktop](../../../apps/web/src/app/apps/github/github.ts)
- [终端虚拟机](../../../apps/web/src/app/vm/virtual-machine.ts)
- [Orbit 桌面协议](../../../../packages/orbit/src/desktop.ts)
- [Aiao Code 工作台入口](../../../../apps/aiao-vscode/src/app/app.component.ts)

## 验收证据

`2026-11-23`，桌面与 Aiao Code 的正式构建通过 Chromium 验收。系统 Git 目录导入保留原提交 SHA 和暂存区，远端夹具读回已发布分支的文件。两个跨源编辑窗口验证了版本冲突和 1,100,000 字节二进制文件往返。[逐项证据与复验命令](../../evidence/2026-11-23/git-workspace.md)

另用同一份临时仓库对照官方 GitHub Desktop 3.6.11，补验三个全高下拉、History 详情，以及终端修改、暂存、提交、切分支后的界面更新。[界面对照、联动与复验命令](../../evidence/2026-11-23/github-desktop-parity.md)

`2026-11-23` 补验 `code .`：`pnpm nx run aiao-desktop-e2e:e2e-aiao-code-files` 使用两个应用的本地正式构建，保留不同来源。在已有最近项目的情况下，从终端打开带空格的普通目录，在实际编辑器中编辑并保存；磁盘、`cat` 与重开读到同一内容，没有生成 `.git`。另从 Git 根打开，在保存后核对 `git diff` 和 GitHub Desktop 的改动列表。[冒烟检查 `terminalFolderRoundTrip` / `terminalRepositoryRoundTrip`](../../../apps/e2e/src/groups/aiao-code-files.mjs)。未做线上部署。

拖放确认补验：参照 [GitHub Desktop 3.6.11 的拖放处理](https://github.com/desktop/desktop/blob/release-3.6.11/app/src/ui/app.tsx#L1240)。[`github.droppedRepository`](../../../apps/e2e/src/groups/github-app.mjs) 覆盖确认前不切换、取消、同名拒绝、混合批量导入、Finder 去重及原位建仓后终端读回文件；[`a11y.github.addLocalRepositoryDialog`](../../../apps/e2e/src/groups/a11y.mjs) 覆盖对话框名称和键盘焦点。复验：`pnpm nx run aiao-desktop-e2e:e2e --group=github-app,a11y`。

[`github.localRepositoryCreated`、`github.droppedRepository` 和 `github.remotePush`](../../../apps/e2e/src/groups/github-app.mjs) 验证打开 Finder、Aiao Code、本地仓库和已登记的远端仓库时不显示 `Opened …`。

远端设置参照 [GitHub Desktop 3.6.11 的 Repository Settings](https://github.com/desktop/desktop/blob/release-3.6.11/app/src/ui/repository-settings/repository-settings.tsx)。本产品只提供 `Remote` 设置，支持添加、替换和移除 GitHub HTTPS `origin`。[`github.repositorySettings`](../../../apps/e2e/src/groups/github-app.mjs) 检查保存、取消、地址校验和终端读回；[`a11y.github.repositorySettingsDialog`](../../../apps/e2e/src/groups/a11y.mjs) 检查纯键盘打开、Tab 循环、Esc 和无障碍规则。

## References

- [ADESK-US-209 GitHub 应用与 OPFS Git 工作区](ADESK-US-209-github-opfs-workbench.md)
- [ADESK-EPIC-004 GitHub 开发工作台](../../epics/ADESK-EPIC-004.md)
