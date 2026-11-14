# 同站项目与已有登录状态

日期：2026-11-14 08:38～08:39，Asia/Shanghai。环境：本机 macOS/Darwin 27.2.0、Chrome 157.0.8103.52 普通标签页，现有浏览器配置；由工具操作真实浏览器 UI，不是物理键盘实测。对应 US-004 AC#4、#5。

桌面是当时线上 `desktop.aiao.io`，Pages 最新部署 `d650c06f-2ad5-4c8c-9345-a5b8a30be1e9`，Cloudflare 记录 Source `bcfaa45`。本轮工具与记录工作区为 `0dcdabca + workspace`；没有发布本地构建。Aiao Code 为当时线上版本，没有把未知应用部署 SHA 写成桌面 SHA。

## 可重复的操作

1. 在 Chrome 新标签页直接打开 `https://vscode.aiao.io/`。
2. 查看 GitHub 帐户按钮的可访问说明。实际已经显示“已登录”；本轮没有登录、OAuth 授权或修改账户设置。
3. 从应用程序菜单新建 Vanilla 项目，名称 `ADESK domain check 2026-11-14`。
4. 确认直接访问的工作区标题、文件树和编辑器均显示该项目；文件树含 `src/label.ts`、`src/main.ts`、`workbench.project.json`。
5. 新标签页打开 `https://desktop.aiao.io/?boot=0`，从 Dock 打开 Aiao Code。
6. 确认 iframe 内工作区标题和文件树为同一个 `ADESK domain check 2026-11-14`；GitHub 帐户说明显示与直接访问相同的已登录账户（账户名在此脱敏）。
7. 在工作区菜单切回原项目 `我的项目`，确认原来的 `Counter.tsx`、`main.tsx` 文件树；关闭本轮新开的两个标签页，原标签页恢复。

## 实际结果

| AC        | 观察                                                                 | 结论                                     |
| --------- | -------------------------------------------------------------------- | ---------------------------------------- |
| US-004 #4 | 直接访问创建的唯一验收项目，在桌面 iframe 中出现，标题和文件树一致。 | 通过。                                   |
| US-004 #5 | 两处均显示同一已有 GitHub 登录状态，没有在 iframe 发起登录。         | 通过，仅限此 Chrome 配置与当前同站组合。 |

验收项目保留在本机 Aiao Code 的项目列表，未删除用户数据。没有修改原项目的源码，也没有发送 GitHub 消息、创建远程仓库或推送提交。此记录不证明 Firefox/Safari 的存储分区或登录行为，也不代替 US-004 #3 的桌面自身 Origin 隔离验收。
