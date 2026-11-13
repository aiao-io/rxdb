---
id: ADESK-US-004
title: 绑定自定义域名与同站托管
status: Backlog
priority: Medium
epic: ADESK-EPIC-001
created: 2026-11-13
updated: 2026-11-13
tags: [platform, deploy, cloudflare, domain]
dependsOn: [ADESK-US-003]
capabilities: []
---

# 用户故事：绑定自定义域名与同站托管

## 作为/我想要/以便

**作为** 使用线上 Aiao Desktop 的人
**我想要** 桌面有一个 aiao.io 下的正式地址，并和 vscode.aiao.io 同站
**以便** 桌面里的 Aiao Code 与直接访问是同一份项目与登录状态，地址也更像正式产品。

## 范围边界

### In Scope

- 在 Cloudflare Pages 面板把自定义域名（建议 `desktop.aiao.io`）绑定到 `aiao-desktop` 项目并让 DNS 指向 Pages；域名注册与 DNS 解析由运营在面板完成，发布命令的 CLI 不能绑域名（[D-16](../../decisions.md#d-16发布到-cloudflare-pages一键发布命令)）。
- 绑定后第一次发布起，`pnpm nx run aiao-desktop:deploy` 的线上核对自动纳入自定义域名（D-16 承诺的行为，目前没有域名可核对）。
- 同站效果的浏览器级验收：桌面里的 Aiao Code 与直接访问 vscode.aiao.io 共用存储分区与 GitHub 登录状态；现在两者是两份项目，只按浏览器规则推断过，没有对比实测。登录动作在直接访问的标签页里完成：桌面里的 Aiao Code 在 sandbox 下不能弹 OAuth 窗口（[ADESK-US-203](../application/ADESK-US-203-aiao-code.md)、[D-12](../../decisions.md#d-12集成应用的接入契约)），所以验收的是「桌面里读到已有的登录状态」，不是「在桌面里登录」。

### Out of Scope

- 域名注册、DNS 解析与证书签发本身（Cloudflare 面板操作，不进仓库、不进 CI）。
- 服务端、账号体系或需要密钥的第三方接入（[D-03](../../decisions.md#d-03只有前端不带任何密钥)）。
- 把 Pages 项目迁移到 Workers、多语言站点等网站化改造。
- 外网内容（壁纸、地图瓦片、天气、Safari 阅读模式、网站图标、网页字体）的来源与隐私说明：见 [ADESK-US-007](ADESK-US-007-external-content-disclosure.md)，不等域名绑定。

## 验收标准

| #   | 前置条件                                                                         | 操作                                                                         | 预期结果                                                                   | 状态 |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---- |
| 1   | Cloudflare 账号已登录，DNS 已指向 Pages                                          | 在 Pages 面板绑定 `desktop.aiao.io` 并等证书签发                             | `https://desktop.aiao.io` 打开桌面，入口页与 `aiao-desktop.pages.dev` 一致 | ⬜   |
| 2   | 域名已绑定                                                                       | 跑 `pnpm nx run aiao-desktop:deploy`                                         | 命令把自定义域名加入线上核对并逐文件通过；域名核对失败时报出具体文件       | ⬜   |
| 3   | 发布完成，真实网络；已在直接访问 vscode.aiao.io 的标签页登录 GitHub 并新建了项目 | 在桌面里打开 Aiao Code                                                       | 看到同一份项目和已登录的状态（同一存储分区）                               | ⬜   |
| 4   | 同上                                                                             | 跑 `aiao-desktop-e2e:verify-aiao-code --desktop-url=https://desktop.aiao.io` | 全部检查项通过，桌面与 Aiao Code 没有页面错误                              | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：第 1、3 条是对真实 Cloudflare 面板与线上地址的浏览器验收；第 2 条由 `aiao-desktop:deploy-test` 与对线上账号的实跑覆盖；第 4 条沿用 `aiao-desktop-e2e:verify-aiao-code`。

## 技术笔记

- [deploy.mjs](../../../scripts/deploy/deploy.mjs) 已支持对自定义域名逐文件核对（D-16），绑定域名不需要改发布代码；发布命令会等地址连得上（新建子域名的证书要几分钟才签发）。
- 存储分区按浏览器同站规则：`desktop.aiao.io` 与 `vscode.aiao.io` 同站后自然共享；与 aiao.io 之外的站点仍是两份。

## 实现文件

- `scripts/deploy/deploy.mjs` — 自定义域名核对（绑定后若暴露缺口在此修复）。
- `aiao-desktop/apps/e2e/src/verify-aiao-code.mjs` — 同站验收入口。

## References

- [ADESK-US-003 一键发布到 Cloudflare Pages](ADESK-US-003-cloudflare-pages-deploy.md)
- [ADESK-US-007 外网内容来源与隐私说明](ADESK-US-007-external-content-disclosure.md)
- [D-16 发布到 Cloudflare Pages，一键发布命令](../../decisions.md#d-16发布到-cloudflare-pages一键发布命令)
