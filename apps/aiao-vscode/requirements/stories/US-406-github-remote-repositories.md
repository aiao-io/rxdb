---
id: US-406
title: GitHub 连接与远程仓库提交推送
status: In Progress
priority: Medium
epic: epic-003-ui-developer-tools
created: 2026-11-03
updated: 2026-11-03
tags: [aiao-vscode, github, remote-repository, oauth, git, scm]
---

# 用户故事：GitHub 连接与远程仓库提交推送

## 作为/我想要/以便

**作为** 在浏览器工作台里开发前端代码的开发者
**我想要** 用 GitHub 账号登录工作台，直接打开 GitHub 仓库并像本地项目一样编辑、提交与推送
**以便** 不动用本地工具链就能参与真实仓库的协作，把工作台闭环从 OPFS 本地项目扩展到 GitHub 托管项目

具体症状：工作台已有 OPFS 本地 Git（US-404），但没有远端：不能浏览 / 打开 GitHub 仓库，
不能把提交推送到远端。远端认证在 US-404 与 [Git + OPFS 研究](../../../../requirements/domain-research/browser-git-opfs.md)
里明确不承诺；本故事按 [vscode.dev GitHub 集成研究](../../../../requirements/domain-research/vscode-dev-github-integration.md)
的结论承接这一块：浏览器里不做真 git，用 GitHub API 当文件系统与提交引擎。

## 范围边界

### In Scope

- GitHub 登录：OAuth PKCE 授权码流（`/redirect` 中转 + 轻量 token 交换端点持 client secret），PAT 手动输入兜底；登出删除远端 token。
- 「从 GitHub 打开」：搜索仓库、我的仓库、粘贴 owner/repo 或完整 URL；选分支（默认分支置顶）；GitHub 项目登记进工作台目录并可重开恢复。
- 虚拟仓库后端 [`createGitHubBackend`](../../src/workbench/session.ts) 实现 [`WorkbenchBackend`](../../src/workbench/session.ts) 全协议：递归树快照、编辑缓冲保存、SCM 状态与双侧差异、暂存集、提交即推送、历史与导出。
- 提交推送：git database API 原地建提交（`git/createTree` → `git/createCommit` → `git/updateRef` 直写分支头），分支列表 / 切换 / 新建，大文件走 `git/blobs`。
- SCM 面板（[`workbench-scm.ts`](../../src/workbench/workbench-scm.ts)）与差异视图复用，零改动接入虚拟仓库。
- token 安全：加密存储、CSP 白名单、登出即删、永不出浏览器。

### Out of Scope

- 真 git push：本地 OPFS 仓库经 git smart-HTTP 推送需要 CORS 代理（实测 github.com git 端点无 CORS 头），另立候选。
- merge / rebase / PR 创建（`pulls` API）与组织 / GHE 域：后续独立候选，本故事只留 URI 与配置槽位。
- 多人实时协作、AI agent：不在本故事范围。
- 三框架外壳各自实现登录：内核在 `src/workbench/` 框架无关层，Angular / React / Vue 外壳共用，无单端缺失问题。

## 交付阶段

| 阶段 | 交付           | 前置与关闭条件                                                                                           | 范围         | 状态 |
| ---- | -------------- | -------------------------------------------------------------------------------------------------------- | ------------ | ---- |
| A    | 登录与仓库浏览 | PAT / OAuth 登录、登出、公开仓库免登录打开、搜索 / 我的仓库 / URL 与分支选择、目录恢复，AC#1～6          | 当前登记范围 | ⚠️   |
| B    | 编辑与提交推送 | 虚拟仓库全协议、SCM 复用、提交即推送、分支操作、冲突提示、历史与导出，AC#7～13                           | 当前登记范围 | ⬜   |
| C    | 安全与发布     | token 加密与登出删除、401 恢复、本地项目 API 发布到 GitHub、验证链（单测 / 浏览器探针 / e2e），AC#14～17 | 当前登记范围 | ⬜   |

A 是进入 B / C 的技术门槛：登录拿不到 token，浏览与提交都无从谈起。所有阶段均为本故事关闭所必需，没有候选 AC。
本故事只承接工作台的 GitHub 协作切片，不代表完整云 IDE 或多人协作已立项；已解锁、阶段 A 进行中，
合入前按仓库治理完成范围与质量评审（进度见[路线图](../roadmap.md)）。

## 验收标准

### 阶段 A：登录与仓库浏览

| #   | 前置条件                                                                               | 操作                                                                            | 预期结果                                                                                                                                                | 状态 |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 用户有 GitHub 账号，工作台未登录                                                       | 登录入口粘贴 PAT 完成登录，再登出                                               | 账户登录名与头像显示；PAT 仅进加密的本地存储，不进 URL / 日志 / 导出归档；登出清除本地会话，OAuth token 另由 Cloudflare 函数持 secret 调 token 删除 API | ⬜   |
| 2   | Cloudflare Pages 已部署 `/redirect` 函数与 token 交换函数（secret 经 wrangler secret） | 登录入口走 OAuth：弹窗授权 → GitHub 回调 → 交换端点换 token                     | 会话建立，scope 固定 `repo workflow user:email read:user`；取消 / 失败给出明确提示并可切 PAT 方式                                                       | ⬜   |
| 3   | 用户未登录，公开仓库 `owner/repo` 或 URL                                               | 「从 GitHub 打开」粘贴后打开                                                    | 递归树加载为虚拟项目，文件树、编辑标签与仓库一致；只读浏览不要求登录                                                                                    | ⬜   |
| 4   | 已登录                                                                                 | 搜索仓库（含 fork）、「我的仓库」列表分页、选仓库后选分支（默认分支置顶）后打开 | 三个入口结果一致；分支内容正确，切换分支后文件树与编辑缓冲同步                                                                                          | ⬜   |
| 5   | 已打开 GitHub 项目                                                                     | 关闭工作台后重开，断网 / 触发 API 配额错误                                      | 目录恢复该 GitHub 条目与上次分支；断网 / 限额 / 认证失败给出具体错误，不显示永久加载                                                                    | ⬜   |
| 6   | 打开含截断树或二进制文件的大仓库                                                       | 浏览深层目录与二进制文件                                                        | 按需 Contents API 读取 + ETag 缓存，不对整仓逐文件拉取；二进制只读展示不承诺编辑                                                                        | ⬜   |

### 阶段 B：编辑与提交推送

| #   | 前置条件                               | 操作                                | 预期结果                                                                                                                                          | 状态 |
| --- | -------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 7   | 已打开仓库，有写权限                   | 编辑多个文件并保存，查看 SCM 面板   | 保存只落编辑缓冲与本地持久化；SCM 展示工作区相对分支头的更改，复用本地项目的 SCM / 差异 UI，未保存缓冲不能暂存                                    | ⬜   |
| 8   | 存在新增 / 修改 / 删除与二进制文件     | 查看双栏差异，逐文件暂存 / 取消暂存 | 差异只读、双侧（基线 ↔ 工作区）语义与本地项目一致；二进制显示字节信息；暂存集仅内存维护，提交只含暂存集                                           | ⬜   |
| 9   | 暂存集非空                             | 填写提交说明并提交                  | `git/createTree`（`base_tree` 增量）→ `git/createCommit` → `git/updateRef` 直写分支头；提交后 SCM 干净，github.com 该分支可见此提交（提交即推送） | ⬜   |
| 10  | 分支头已被他人推进，本地基于旧基线编辑 | 提交                                | 检测到分支头变化，明确提示冲突，拒绝覆盖他人提交；重新拉取后基线更新，编辑缓冲不丢                                                                | ⬜   |
| 11  | 已打开仓库                             | 切换 / 新建分支，从任意分支头新建   | 分支列表分页完整、默认分支置顶；新建分支基于所选头建立 ref；切换后树、缓冲与 SCM 状态一致                                                         | ⬜   |
| 12  | 仓库有提交历史                         | 查看历史列表，导出当前分支源码      | 历史按 commits API 分页展示提交与说明；导出为 zipball（`/zipball/{ref}`），不含工作台本地数据                                                     | ⬜   |
| 13  | 改动含超过单请求 inline 上限的大文件   | 提交                                | 大文件先 `git/blobs`（base64）拿 sha 再入树，提交成功且远端字节一致                                                                               | ⬜   |

### 阶段 C：安全与发布

| #   | 前置条件                                | 操作                                                                              | 预期结果                                                                                                               | 状态 |
| --- | --------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---- |
| 14  | 已登录，页面含测试代码与预览            | 尝试从预览 / 日志 / 导出读取 token；检查 CSP 与网络请求                           | token 不进入 URL、日志、预览 iframe 与导出归档；`connect-src` 只放行 api.github.com 与自有交换端点；本地存储为加密形式 | ⬜   |
| 15  | 会话被吊销或 token 过期，存在未提交缓冲 | 触发一次写操作返回 401，重新登录                                                  | 明确提示重新登录，重新认证后继续原操作，编辑缓冲与暂存集不丢                                                           | ⬜   |
| 16  | 本地 OPFS 项目已初始化，用户已登录      | 「发布到 GitHub」选择私有 / 公开与仓库名                                          | `POST /user/repos` 建库（默认分支一致），快照转 blob / tree / commit 上传为初始提交；仓库名冲突与越权给出明确提示      | ⬜   |
| 17  | 内核与 e2e 就绪                         | 跑内核单测（打桩 GitHub API）、真实 Chromium 探针与 e2e（公开测试仓库或打桩契约） | 内核测试覆盖率不低于 80%；探针记录真实浏览器、依赖版本与耗时；e2e 走通登录 → 打开 → 编辑 → 提交 → 分支切换 → 登出      | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据：A 的 OAuth 链路先写红测（PKCE 参数、`/redirect` 中转、交换端点契约），真实授权走手动验收脚本并留报告；
B / C 的 GitHub 后端先写红测再实现（协议映射与提交三步 API 打桩断言），组合行为以真实浏览器 e2e 与
公开测试仓库关闭；token 安全以预览隔离探针与 CSP 检查关闭。验收入口与原始结果见下方「验收证据」；
故事合并前保持 In Review，不以分支验证代替合并。

## 验收证据

| 范围                 | 可重跑入口与证据                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A 认证与仓库浏览     | `pnpm nx run aiao-vscode:verify-github-auth`；手动 OAuth 授权与登出报告写入 `apps/aiao-vscode/benchmarks/`                                                   |
| B 虚拟仓库与提交推送 | `pnpm nx test aiao-vscode --coverage`（github 后端 spec）；`pnpm nx run aiao-vscode:test-browser`（打桩 API 的真实 Chromium 探针）；公开测试仓库手动验收报告 |
| C 安全与发布         | 预览隔离探针（token 不可达）；`verify-github-publish` 本地项目发布报告；CSP 检查随生产构建                                                                   |
| 应用 e2e             | `pnpm nx run aiao-vscode-e2e:e2e`：登录 → 打开 → 编辑 → 提交 → 分支切换 → 登出，打桩或公开测试仓库契约                                                       |

## 技术笔记

- 不引入真 git push：实测 github.com git smart-HTTP 端点无 CORS 头、api.github.com 返回 `access-control-allow-origin: *`，
  全部读写走 REST / GraphQL。提交三步（共享库 [githubRepository.ts](https://github.com/microsoft/vscode-pull-request-github/blob/main/src/github/githubRepository.ts) 的 `commit` 同构）：

  ```ts
  const last = (await repos.getBranch({ branch })).data.commit.sha; // 分支头
  const tree = (await repos.getCommit({ ref: last })).data.commit.tree.sha; // 基线树
  const newTree = (await git.createTree({ base_tree: tree, tree: items })).data.sha; // 只传变更文件
  const newCommit = (await git.createCommit({ message, tree: newTree, parents: [last] })).data.sha;
  await git.updateRef({ ref: `heads/${branch}`, sha: newCommit }); // 推送 = 直写 ref
  ```

- [`WorkbenchBackend`](../../src/workbench/session.ts) 协议映射：`open` = 递归树快照（截断按需补读），
  `save` = 编辑缓冲本地持久化 + revision（分支头 sha 与变更计数），`status` / `readDiff` = 工作区相对基线树的 diff，
  `stage` / `unstage` = 内存暂存集，`commit` = 上述三步 API，`history` = commits API 分页，
  `restore` = 只读回看（不重写历史），`exportArchive` = zipball。SCM 面板与差异视图复用不感知后端。
- 认证落地：自有 GitHub OAuth App（callback 为部署域 `/redirect`）；项目托管在 Cloudflare Pages，
  `/redirect` 中转（302 回 `state` 内嵌回调 URI）与 token 交换、登出删 token 都是同一部署内的 Pages Functions，
  client secret 经 `wrangler secret` 注入、不进前端与仓库（OAuth App 与 GitHub App 的交换端点都强制
  `client_secret`，设备码免 secret 但被 CORS 阻断）。本地 `wrangler pages dev` 用 `.dev.vars` 复现完整链路，
  纯 vite 开发（4320）先用 PAT 兜底。PKCE S256 + nonce 防重放；会话存 IndexedDB（WebCrypto AES-GCM 加密），
  启动时 `GET /user` 验活。
- 速率与缓存：认证 REST 5000 req/h、search 认证 30 req/min；递归树与文件内容做 ETag 缓存，仓库打开不打爆限额。
- 乐观并发：分支头变化（他人推进）时拒绝 `updateRef`，422 / 409 映射为「分支已被更新」提示，编辑缓冲保留。
- 三框架对称：内核在框架无关的 `src/workbench/`，外壳只加登录入口与目录条目 UI，不存在单端缺失。

## 实现文件

- `apps/aiao-vscode/src/workbench/git/github/` — `github-auth.ts`（PKCE / PAT / 会话存储）、`github-api.ts`（fetch 客户端、ETag 缓存、限额）、`github-backend.ts`（`createGitHubBackend` 协议实现）+ 对应 spec
- `apps/aiao-vscode/deploy/` — `wrangler.toml` 与 Pages Functions：`/redirect` 302 中转、`/api/github-token` 交换（secret 注入）、`/api/github-token/delete` 服务端删 token；`.dev.vars` 为本地 secret，clientId 是公开常量（注册 OAuth App 后填入 `github-service.ts`）
- `apps/aiao-vscode/src/app/` — 登录入口、「从 GitHub 打开」对话框、目录（RxDB catalog）GitHub 条目
- `apps/aiao-vscode-e2e/` — GitHub 用例（打桩契约 + 公开测试仓库）

## References

- [vscode.dev GitHub 集成研究](../../../../requirements/domain-research/vscode-dev-github-integration.md)
- [US-404 浏览器本地开发工作台](US-404-browser-development-workbench.md)
- vscode 源码：[认证流](https://github.com/microsoft/vscode/blob/main/extensions/github-authentication/src/flows.ts)、[scope 与 Octokit](https://github.com/microsoft/vscode/blob/main/extensions/github/src/auth.ts)、[仓库发现](https://github.com/microsoft/vscode/blob/main/extensions/github/src/remoteSourceProvider.ts)、[提交实现](https://github.com/microsoft/vscode-pull-request-github/blob/main/src/github/githubRepository.ts)、[发布与凭据](https://github.com/microsoft/vscode/blob/main/extensions/github/src/publish.ts)
- GitHub 文档：git database API、OAuth 授权、token 删除（`DELETE /applications/{client_id}/token`）
