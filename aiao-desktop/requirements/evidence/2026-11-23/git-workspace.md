# US-211 共享 Git 仓库验收

上海时间 2026-11-23。构建基线为 `c106a8c93` 加本次工作区改动，运行环境为 macOS x64（Darwin 24.6.0）、Node 26.13.0、Apple Git 2.39.5 和 Playwright 无头 Chromium 159.0.8154.6。三组冒烟使用独立浏览器上下文。桌面和 Aiao Code 各自托管正式构建，由浏览器保持不同 origin。桌面 `index.html` 的 SHA-256 为 `15748bd53946be61b643a2b3b9390a8753592a1befa402c2d0f0c584500e26cb`，编辑器为 `8631835e57648913b474e64f6c218952d7c59e1209a25ae4d7dcbf09db68bf1a`。

| AC  | 操作与观察                                                                                                                                                                                                                                                                                                                                                                                        | 记录                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 从终端建仓、暂存、提交、建分支和切换。检查 Shell 的错误退出码、管道、重定向、不同终端标签共用暂存区及重开后的历史。子目录查找另有命令单测。                                                                                                                                                                                                                                                       | [终端报告](disk-terminal.json)、[命令测试](../../../apps/web/src/app/vm/workspace-git.spec.ts)                                                                                                    |
| 2–3 | 用系统 Git 建立包含原始提交、暂存版本和工作版本的目录。用浏览器拖入它和一个普通目录，分别检查导入位置与错误。终端读回原 SHA、分支 `topic`、`MM tracked.txt` 及两组差异。重复系统导入提示同名。再从桌面 Finder 拖入及键入卷内路径，指向同一仓库。File → Add Local Repository 提供键盘焦点，选择器取消保留当前状态。单测覆盖坏归档、中断重试与导入前的大小检查。                                    | [拖放及键盘报告](github-app.json)、[目录绑定测试](../../../apps/web/src/app/services/github-volume-binding.spec.ts)、[导入上限测试](../../../apps/web/src/app/services/git/git-directory.spec.ts) |
| 4   | 从仓库菜单添加 `origin`，终端 `git remote -v` 可见。另一个系统导入的仓库保留先前设置的 `origin`，终端移除后，再从 Finder 打开能重新添加。单测覆盖重复、无效地址、缺少远端与配置写入失败。                                                                                                                                                                                                         | [跨应用报告](aiao-code-files.json)、[拖放报告](github-app.json)、[仓库服务测试](../../../apps/web/src/app/services/github-workspace.spec.ts)                                                      |
| 5   | API 夹具返回新的远端文件后执行 pull。UI 将提交推送到 `main`，终端将另一个工作树的已提交版本发布到 `topic`。独立从夹具的 branch → commit → tree → blob 读回文本和二进制字节，核对发布 `topic` 后的 `main`、本地暂存与工作区。覆盖远端领先、私库权限与断网。单测另验 fetch 保留整合基线、空远端默认分支首推、已有同名分支先拉取、切回已发布分支沿用各自的远端基线，以及更换 `origin` 后清除旧基线。 | [远端报告](github-app.json)、[请求与冲突测试](../../../apps/web/src/app/services/github-repository.spec.ts)                                                                                       |
| 6–7 | 在终端创建 `bridge`，从 GitHub Desktop 打开两个跨源 Aiao Code 窗口。一个窗口保存文本及 1,100,000 字节二进制文件，另一个窗口的过期保存失败，草稿仍可读。桌面读回二进制 SHA-256，终端读回文本，GitHub Desktop 显示文件改动。`open -a "Aiao Code" .` 重开后读到保存版本。另页独立打开编辑器验证原有项目入口。                                                                                        | [双窗口报告](aiao-code-files.json)、[操作及字节断言](../../../apps/e2e/src/groups/aiao-code-files.mjs)                                                                                            |
| 8   | 从真实编辑窗口向仓库外和 `.git/config` 保存均收到 `INVALID_ARGUMENT`。桌面宿主测试单独验证能力授权、窗口关闭与不同 `projectId` 的拒绝，传输测试验证分片顺序和完整性。                                                                                                                                                                                                                             | [浏览器报告](aiao-code-files.json)、[宿主授权测试](../../../apps/web/src/app/services/app-context.spec.ts)、[Orbit 分片测试](../../../../packages/orbit/src/__tests__/workspace-transfer.spec.ts) |

GitHub HTTPS、OAuth、PAT 和远端写入使用受控 API 夹具。本地历史通过系统 Git 生成的仓库校验。远端由 GitHub API 从已提交的文件快照生成提交，并返回远端 SHA。此次验收对象为两个应用的本地正式产物。

复验过程中一次并发运行在等待提交按钮时超时，单组复跑通过。暂存操作的断言现在等待复选框的辅助名称与 Git 暂存状态一致。上表链接到同一份桌面构建的最终报告。

## 复验

在工作区根执行。正式构建由对应冒烟目标的依赖生成。`--report` 路径为浏览器报告输出位置。

```sh
pnpm nx run aiao-desktop-e2e:e2e --group=disk-terminal --report=/tmp/us211-disk-terminal.json
pnpm nx run aiao-desktop-e2e:e2e --group=github-app --report=/tmp/us211-github-app.json
pnpm nx run aiao-desktop-e2e:e2e-aiao-code-files --report=/tmp/us211-code-files.json
pnpm nx run aiao-desktop-web:test -- --coverage.reportsDirectory=/tmp/us211-coverage --maxWorkers=3
pnpm nx run-many -t test -p orbit aiao-vscode --parallel=1
pnpm nx run-many -t lint,typecheck -p orbit aiao-vscode aiao-desktop-web aiao-desktop-e2e --parallel=1
pnpm nx run aiao-desktop:requirements-check
```

桌面端 1,938 项单测通过，行覆盖率 95.84%（7,364 / 7,683）。Orbit 168 项、Aiao Code 1,299 项单测通过。相关项目的 lint 和 typecheck 通过。
