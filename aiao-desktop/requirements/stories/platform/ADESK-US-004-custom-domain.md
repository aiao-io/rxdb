---
id: ADESK-US-004
title: 绑定自定义域名与同站托管
status: Done
priority: Medium
epic: ADESK-EPIC-001
created: 2026-11-13
updated: 2026-11-14
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
- 绑定后第一次发布起，`pnpm nx run aiao-desktop:deploy` 的线上核对自动纳入自定义域名（D-16 承诺的行为，2026-11-14已确认域名绑定，本次发布后的两个生产入口及独有部署全部文件已核对）。核对粒度与生产地址相同，只核对入口页（入口页引用带哈希的脚本文件名，指向旧部署时一定不一致）；逐文件比字节只对本次部署独有的地址做（[ADESK-US-003](ADESK-US-003-cloudflare-pages-deploy.md)）。
- **桌面本站数据的边界**：换到自定义域名是换了桌面自己的 Origin。桌面的本地库、OPFS 里的文件体、系统设置与游戏的 localStorage 都按来源隔离，不会自动出现在新地址；生产地址 `aiao-desktop.pages.dev` 照常保留，旧地址上的数据原样留在旧地址。本故事不迁移数据：新地址首次打开是一份全新的桌面（写入内置内容）。没有导出 / 导入路径之前，旧地址不下线、不重定向到新地址（重定向会让旧地址上的数据变得不可达）。这是依据浏览器存储规则作出的判断，AC#3 在真实域名上验收它。
- 同站效果的浏览器级验收，**三个结论分开验收**，不能用「同一存储分区」代替：①桌面本站数据（见上，不共享、不迁移）；②桌面里的 Aiao Code 看到的项目与直接访问 vscode.aiao.io 是同一份；③桌面里的 Aiao Code 读到直接访问时已有的 GitHub 登录状态。2026-11-14已在同一真实Chrome配置里对比②③，记录见本轮验收。登录动作在直接访问的标签页里完成：桌面里的 Aiao Code 在 sandbox 下不能弹 OAuth 窗口（[ADESK-US-203](../application/ADESK-US-203-aiao-code.md)、[D-12](../../decisions.md#d-12集成应用的接入契约)），所以验收的是「桌面里读到已有的登录状态」，不是「在桌面里登录」。

### Out of Scope

- 域名注册、DNS 解析与证书签发本身（Cloudflare 面板操作，不进仓库、不进 CI）。
- 把 `aiao-desktop.pages.dev` 上的本地数据迁到新域名：没有导出 / 导入能力之前不做，候选见 [future-requirements](../../future-requirements.md) 的「本地数据保障」；旧地址的保留期限由运营决定，在有迁移路径之前不下线、不重定向。
- 服务端、账号体系或需要密钥的第三方接入（[D-03](../../decisions.md#d-03只有前端不带任何密钥)）。
- 把 Pages 项目迁移到 Workers、多语言站点等网站化改造。
- 外网内容（壁纸、地图瓦片、天气、Safari 阅读模式、网站图标、网页字体）的来源与隐私说明：见 [ADESK-US-007](ADESK-US-007-external-content-disclosure.md)，不等域名绑定。

## 验收标准

| #   | 前置条件                                                                         | 操作                                                                         | 预期结果                                                                                             | 状态 |
| --- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---- |
| 1   | Cloudflare 账号已登录，DNS 已指向 Pages                                          | 在 Pages 面板绑定 `desktop.aiao.io` 并等证书签发                             | `https://desktop.aiao.io` 打开桌面，入口页与 `aiao-desktop.pages.dev` 一致                           | ✅   |
| 2   | 域名已绑定                                                                       | 跑 `pnpm nx run aiao-desktop:deploy`                                         | 命令把自定义域名的入口页纳入线上核对并通过（与生产地址同一粒度）；核对失败时报出具体地址与原因       | ✅   |
| 3   | 旧地址 `aiao-desktop.pages.dev` 上已有用户文件与备忘录                           | 打开 `https://desktop.aiao.io`，再回到旧地址                                 | 新地址是一份全新的桌面（内置内容），没有页面错误，也没有被重定向；旧地址上原来的文件与备忘录原样还在 | ✅   |
| 4   | 发布完成，真实网络；已在直接访问 vscode.aiao.io 的标签页登录 GitHub 并新建了项目 | 在 `desktop.aiao.io` 的桌面里打开 Aiao Code                                  | 看到同一个项目                                                                                       | ✅   |
| 5   | 同上                                                                             | 同上，看登录状态                                                             | 处于已登录状态                                                                                       | ✅   |
| 6   | 同上                                                                             | 跑 `aiao-desktop-e2e:verify-aiao-code --desktop-url=https://desktop.aiao.io` | 全部检查项通过，桌面与 Aiao Code 没有页面错误                                                        | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：第 1、3、4、5 条是对真实 Cloudflare 面板与线上地址的浏览器验收；第 2 条由 `aiao-desktop:deploy-test` 与对线上账号的实跑覆盖；第 6 条沿用 `aiao-desktop-e2e:verify-aiao-code`。

## 技术笔记

- [deploy.mjs](../../../scripts/deploy/deploy.mjs) 已把绑定的自定义域名纳入线上核对，粒度是入口页（`liveTargets` 里自定义域名的 `full` 为 false，D-16 与 [deploy.spec.mjs](../../../scripts/deploy/deploy.spec.mjs) 的断言一致），绑定域名不需要改发布代码；发布命令会等地址连得上（新建子域名的证书要几分钟才签发）。
- 存储分区按浏览器同站规则：`desktop.aiao.io` 与 `vscode.aiao.io` 同站后自然共享；与 aiao.io 之外的站点仍是两份。桌面自己的数据另当别论：它按来源（Origin）隔离，同站也不共享，换域名就是另一个来源。

## 实现文件

- `scripts/deploy/deploy.mjs` — 自定义域名核对（绑定后若暴露缺口在此修复）。
- `aiao-desktop/apps/e2e/src/verify-aiao-code.mjs` — 同站验收入口。

## 本轮验收（2026-11-14）

域名已绑定；两个入口只读核对通过，同站项目及已有 GitHub 登录状态已在用户实际 Chrome 配置中对照。真实线上 Aiao Code 与当前构建结合线上 Aiao Code 的验收均通过。

原始记录：[live-entrypoints.json](../../evidence/2026-11-14/live-entrypoints.json)、[pages-metadata.json](../../evidence/2026-11-14/pages-metadata.json)、[domain-same-site.md](../../evidence/2026-11-14/domain-same-site.md)、[aiao-code-online.json](../../evidence/2026-11-14/aiao-code-online.json)、[aiao-code-current-final.json](../../evidence/2026-11-14/aiao-code-current-final.json)、[domain-storage-final.json](../../evidence/2026-11-14/domain-storage-final.json)、[domain-storage-old-save-failure.json](../../evidence/2026-11-14/domain-storage-old-save-failure.json)；执行环境、命令和证据边界见[证据索引](../../evidence/2026-11-14/README.md)与[验收台账](../../verification-report.md)。

AC#3 已在两个真实 HTTPS Origin 上执行并复测：旧地址通过终端复制创建用户文件并读回正文，切到新地址确认用户文件、文件夹和备忘录不存在，再返回旧地址确认正文、文件夹、备忘录及外观设置完整，9 项全部通过且无页面错误。旧部署用 TextEdit 覆盖种子文件及终端写入时出现的 `Storage file meta not found` 仍保留在失败报告中；本次复制路径通过不表示该旧部署缺陷已修。本次正式发布及后续对账现已完成，AC#2关闭。

### 本次正式发布与复验

按 [D-20](../../decisions.md#d-20接受两项回溯基线例外并批准本次正式发布) 授权，已发布生产部署 `b093f8b2-9bc7-492c-9a8b-1928f8397ada`（源提交 `b6827b105`，含需求记录的未提交改动）。候选入口SHA256为 `2f142ced7f1617a3463d1c008c5e0f8b5836934b8d4bf16b5df2248fa6ec873c`。

[原始发布命令](../../evidence/2026-11-14/release-production.txt)已上传成功，生产地址与自定义域名的入口核对都通过；独有部署地址有5个文件下载超时，原命令退出码1保持原样。随后对同一部署执行[只读逐文件复验](../../evidence/2026-11-14/release-curl-reconciliation.json)：95个可公开访问文件的大小、SHA256与跨源隔离响应头全部通过，没有再次上传。两份Pages配置文件由托管消费，不属于公开文件。

[两个生产入口](../../evidence/2026-11-14/release-entrypoints.json)、[双域名数据隔离](../../evidence/2026-11-14/release-domain-storage.json)与[真实线上Aiao Code](../../evidence/2026-11-14/release-aiao-code.json)分别通过入口核对、9项隔离检查和9项集成检查；相关页面错误集合为空。[本机Google Chrome 157的入口复核](../../evidence/2026-11-14/release-chrome-entry-provenance.json)确认Finder与跨源隔离可用。自定义域名的浏览器响应在原HTML前1435字符与后15字符之间额外插入367字符的Cloudflare统计脚本，原构建字符未删除，模块入口仍为 `main-RI2ER7MO.js`；因此浏览器入口摘要为 `a23d249747af4e6cfc0cdb8604d570324c1f27dbeaca8134bf34bfd029fc85fc`，不把它冒称为与未插入脚本的HTTP响应逐字节相同。

本次发布包含schema 2026111301及降级保护；B0（6859fe56）之前的旧生产部署不能作为升级后数据库的回滚目标。

## References

- [ADESK-US-003 一键发布到 Cloudflare Pages](ADESK-US-003-cloudflare-pages-deploy.md)
- [ADESK-US-007 外网内容来源与隐私说明](ADESK-US-007-external-content-disclosure.md)
- [D-16 发布到 Cloudflare Pages，一键发布命令](../../decisions.md#d-16发布到-cloudflare-pages一键发布命令)
