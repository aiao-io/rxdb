# GitHub Desktop 界面对照与终端联动

上海时间 2026-11-23。参照本机官方 GitHub Desktop 3.6.11 和[同版源码](https://github.com/desktop/desktop/tree/release-3.6.11)。使用独立的官方应用配置与 Chromium 浏览器配置。同一份 `Release Notes` 夹具包含 `main`、`docs` 两个分支和两次提交；最新提交修改 `README.md` 并新增 `docs/checklist.md`。不使用真实仓库或账号。

| 界面               | 官方观察与本次调整                                                                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 窗口和工具栏       | 实机标题栏为 32px，工具栏为 50px。浏览器版保留 Aiao 窗口的关闭、最小化、缩放行为，按此尺寸排列在左上；刷新图标放在文字左边。                                                                                               |
| 同步按钮           | 第三个按钮按当前分支选择 Fetch / Pull / Push / Publish branch。Pull、Push 或 Publish branch 作为主操作时，下拉保留 Fetch；Fetch 只查询远端状态，不改工作文件。                                                             |
| 仓库、工作树、分支 | 960 × 660 窗口下，官方面板宽分别为 250、365、365px，从工具栏下沿铺到窗底。浏览器版采用相同默认宽度与全高布局；仓库列表使用 Filter 和 Add；工作树行显示当前分支。                                                           |
| History            | 左侧提交行没有省略号，右键或 Shift+F10 打开菜单。右侧显示提交正文、作者、SHA、文件清单和 Diff。夹具中默认选中 `README.md`，统一 Diff 先删除 `Version 0.9` 再新增 `Version 1.0`，区块标题包含 Git 的上下文行。              |
| 双向联动           | 仓库菜单在同一仓库的卷内路径打开终端。终端修改、暂存、提交和切分支后更新当前 GitHub Desktop 窗口；从界面切分支后终端 `git status` 读取到同一分支。终端写入同一文件时，过期的窗口草稿不会在刷新时丢失，也不会覆盖终端版本。 |

History 的右键与 Shift+F10 复用桌面菜单：焦点进入菜单，方向键移动，Esc 关闭并把焦点还给提交行。用 `github.historyContextMenu` 冒烟覆盖。`github.diffModes` 验证统一视图先删后增、分栏视图配对删增行；等量替换会突出行内变化，如 `0.9` 和 `1.0`。

仍有差异：浏览器窗口控件和终端不是系统原生控件与 Shell；本地工作树列表不管理 linked worktree；本地仓库仍显示 `Refresh status`，而不是 `Publish repository`；分支、PR 与提交菜单没有官方的完整操作集；Diff 不提供官方编辑器的语言语法高亮。

同步按钮参照同版源码的 `push-pull-button.tsx`。浏览器通过 GitHub API 同步快照，远端状态由 Fetch 更新，不显示精确提交差计数，也不提供 Force push。

```sh
pnpm nx run aiao-desktop-e2e:e2e --group=github-app,disk-terminal --report=/tmp/aiao-github-desktop-parity.json
pnpm nx run aiao-desktop:verify
```
