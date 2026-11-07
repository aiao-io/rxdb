# vscode.dev 的 GitHub 连接、克隆与推送机制

> [浏览器代码工作区：Git + OPFS](browser-git-opfs.md) 的后续补充——远端认证与 GitHub 集成曾明确不在该分支承诺内。
> 调研日期：2026-11-03。方法：vscode 公开仓库源码核对（`extensions/github-authentication`、`extensions/github`、
> `extensions/git-base`、`microsoft/vscode-pull-request-github` 共享库）、vscode.dev 线上行为实测
> （`/redirect` 302 链路、CORS 头）、GitHub 官方文档核对（OAuth / App 认证参数表、VS Code for the Web FAQ）。

**结论：✅ vscode.dev 在浏览器里不跑真 git，而是把 GitHub REST / GraphQL API 当文件系统和 git 引擎。**
「克隆」= 用 API 虚拟挂载仓库（无本地副本）；「提交并推送」= 用 git database API（blob → tree → commit → 直写分支 ref）
在 GitHub 服务器上原地建提交，提交即推送，没有本地仓库。认证是标准 OAuth PKCE 授权码流，token 交换由
微软托管的代理（`vscode-auth.github.com`）持 client secret 完成，浏览器永远接触不到 secret。

实测确认两个决定性约束：

| 端点                                              | CORS 表现（2026-11-03 实测）                   | 浏览器直连可用性                                |
| ------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| `api.github.com`（REST / GraphQL）                | `access-control-allow-origin: *`               | ✅ 全可用                                       |
| `github.com/<owner>/<repo>.git`（git smart-HTTP） | 无任何 `Access-Control-*` 头，OPTIONS 预检挂起 | ❌ 真 git fetch/push 不可行，必须代理或改用 API |

因此集成路线明确：**一切写操作走 api.github.com 的 git database API（vscode.dev 路线）；本地 OPFS 仓库若要真 push，
需要自建 CORS 代理或服务端中转，首版不必做。**

---

## 1. 组件架构：五个扩展各司其职

vscode.dev 的 GitHub 能力由五块拼成，aiao-vscode 已有其中三块的等价物：

| vscode 组件（仓库内路径）                                                           | 职责                                                                           | aiao-vscode 对应                                                                               |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `vscode.github-authentication`（`extensions/github-authentication/`）               | AuthenticationProvider：PKCE 授权码流、设备码流、PAT 兜底、会话存储            | **缺**，需新建认证服务                                                                         |
| `vscode.git-base`（`extensions/git-base/`）                                         | 「克隆」选择器框架：`pickRemoteSource` 提供者注册、搜索输入、最近来源          | **缺**，`workbench-commands` 可加「从 GitHub 打开」入口                                        |
| `vscode.github`（`extensions/github/`）                                             | GitHub 实现：仓库搜索 provider、凭据 provider、发布到 GitHub、push 错误处理    | **缺**，需新建 GitHub 适配层                                                                   |
| Remote Repositories / `vscode-vfs` scheme（已移出公开仓库，随 vscode.dev 独立下发） | 虚拟 FileSystemProvider + GitProvider：API 直读、编辑缓冲、SCM 状态与提交编排  | **`WorkbenchBackend` 接口就是它的等价抽象**，`git-backend.ts` 是 OPFS 实现，需新增 GitHub 实现 |
| `vscode.git` + wasm git（仅桌面/本地）                                              | 本地文件夹的真 git；`registerCredentialsProvider` 用 OAuth token 当 https 密码 | **`git/git-worker.ts` + wasm-git 0.0.17 已是等价物**                                           |

要点：vscode 的抽象是「FileSystemProvider + GitProvider 可插拔」——`vscode.git` 的 SCM 面板不关心后端是
wasm git 还是 GitHub API。aiao-vscode 的 `WorkbenchBackend`（[session.ts](../../apps/aiao-vscode/src/workbench/session.ts)）
与 `WorkbenchStatus` / `WorkbenchDiff` 协议已经是同样的可插拔设计，GitHub 集成 = 新写一个 `createGitHubBackend`，
SCM 面板（`workbench-scm.ts`）零改动。三框架对称天然成立：内核在 `src/workbench/` 框架无关层，Angular/React/Vue 外壳不用各自实现认证。

## 2. 认证：PKCE 授权码流 + /redirect 中转 + 服务端交换代理

### 2.1 流程（vscode.dev 实测链路）

```
工作台 ──①──> github.com/login/oauth/authorize
   │            client_id / redirect_uri=https://vscode.dev/redirect / scope / state / code_challenge / S256
   │
用户授权后 GitHub 302 ──②──> https://vscode.dev/redirect?code=...&state=<回调 URI>
   │
vscode.dev 服务端 /redirect 路由 302 ──③──> <state 里的回调 URI>?state=...&code=...
   │            （实测：无 state 参数时返回 40 字节报错「No state or url query parameter provided」）
   │
扩展 URI 处理器收到 code ──④──> POST https://vscode-auth.github.com/login/oauth/access_token
   │            （code + client_id + redirect_uri + client_secret + code_verifier；secret 在代理侧，不出服务端）
   │
返回 access_token ──⑤──> 存入 SecretStorage（web 端即 IndexedDB）
```

关键设计（全部来自 [`flows.ts`](https://github.com/microsoft/vscode/blob/main/extensions/github-authentication/src/flows.ts)）：

- **PKCE S256**：`code_verifier` 64 位 hex 随机，`code_challenge = base64url(SHA-256(verifier))`
- **state 复用**：state 参数内嵌回调 URI（`vscode://vscode.github-authentication/did-authenticate?nonce=...`），
  中转页不需要知道业务，只做 302；nonce 防重放
- **client ID 单一**：[`config.ts`](https://github.com/microsoft/vscode/blob/main/extensions/github-authentication/src/config.ts)
  只有 `01ab8ac9400c4e429b23`，同一个 OAuth App 注册多个回调：桌面 `vscode://` 系列 + `https://vscode.dev/redirect` +
  `insiders.vscode.dev` + `github.dev`（[`env.ts`](https://github.com/microsoft/vscode/blob/main/extensions/github-authentication/src/common/env.ts)
  的白名单：`vscode*`、`*.vscode.dev`、`*.github.dev`、`*.ghe.com`）
- **token 交换代理可配置**：`workbench.getCodeExchangeProxyEndpoints` 返回 `{ github: 'https://vscode-auth.github.com/' }`；
  无代理时（桌面）直连 `github.com/login/oauth/access_token`，此时 client secret 编进扩展（官方注释承认
  native client 的 secret 不是秘密）
- **scope**：[`auth.ts:31`](https://github.com/microsoft/vscode/blob/main/extensions/github/src/auth.ts) 固定
  `['repo', 'workflow', 'user:email', 'read:user']`——`repo` 覆盖私有仓库读写，`workflow` 供 Actions 相关扩展使用
- **登出删 token**：`DELETE /applications/{client_id}/token`，仅 `gho_` 前缀的 OAuth token 可服务端删除
- **失败降级链**：授权码流 →（取消时询问）→ 设备码流 → PAT 手动输入

### 2.2 三条流的适用边界

| 流                                                        | 免 client secret  | Web Worker 可用                  | vscode 用法          |
| --------------------------------------------------------- | ----------------- | -------------------------------- | -------------------- |
| 授权码 + 交换代理                                         | ❌（代理侧持有）  | ✅                               | vscode.dev 主路径    |
| 授权码 + loopback 本地服务器                              | ❌（内置）        | ❌                               | 桌面                 |
| 设备码（`POST /login/device/code` + 轮询 `access_token`） | ✅ 只需 client_id | ❌ **CORS 阻断**（源码注释明说） | 桌面远程场景         |
| PAT 手动输入                                              | ✅                | ✅                               | 不受支持客户端的兜底 |

**对集成的推论**：GitHub OAuth App 与 GitHub App 的 user-to-server token 交换都强制要求 `client_secret`
（GitHub 文档参数表核实），设备码免 secret 但被 CORS 阻断。所以**纯静态前端无法自己换 token**，
必须二选一：① 轻量交换端点（Cloudflare Worker / edge function 持 secret，仿 vscode-auth.github.com 角色）——推荐；
② 首版接受 PAT 手动输入（api.github.com 有 CORS，PAT 直接可用）——零后端，快速打通全链路后再换 OAuth。

## 3. 「克隆」：仓库发现与虚拟挂载

选择器框架在 [`remoteSource.ts`](https://github.com/microsoft/vscode/blob/main/extensions/git-base/src/remoteSource.ts)，
GitHub 数据源在 [`remoteSourceProvider.ts`](https://github.com/microsoft/vscode/blob/main/extensions/github/src/remoteSourceProvider.ts)：

- **搜索**：`GET /search/repositories?q=<query> fork:true`（URL 形输入先 `repos.get` 直查）；空输入时列
  `GET /user/repos`（`sort=updated, per_page=100`）缓存为「我的仓库」
- **选分支**：`GET /repos/{owner}/{repo}/branches` 分页拉全（每页 100），默认分支置顶
- **打开**：`https://vscode.dev/github/{owner}/{repo}` 直达（协议处理器），内部 URI 为 `vscode-vfs://github/{owner}/{repo}`
- **无真克隆**：官方 VS Code for the Web 文档原话——「the web editor doesn't "clone" the repo, but instead loads
  the code by invoking the services' APIs directly from your browser」；文件读取走 Contents API（base64），
  「your work is saved in the browser's local storage until you commit it」——编辑缓冲存 IndexedDB，提交才落 GitHub

对 aiao-vscode 意味着：本地项目（OPFS）与远端仓库是两种「项目」，目录（RxDB catalog）里加一类
GitHub 条目；打开即拉树（`GET /repos/{o}/{r}/git/trees/{branch}?recursive=1`，注意 truncated 分页与 >100k 文件仓库走
Contents API 按需读）。

## 4. 提交与推送：git database API 原地建提交

共享库保留着完整实现——[`githubRepository.ts:810-832`](https://github.com/microsoft/vscode-pull-request-github/blob/main/src/github/githubRepository.ts)：

```ts
async commit(branch: string, message: string, files: Map<string, Uint8Array>): Promise<boolean> {
    const lastCommitSha = (await octokit.api.repos.getBranch({ ...branch })).data.commit.sha;
    const lastTreeSha   = (await octokit.api.repos.getCommit({ ref: lastCommitSha })).data.commit.tree.sha;
    const treeItems = [...files].map(([path, content]) =>
        ({ path: path.substring(1), mode: '100644', content: content.toString() }));
    const newTreeSha   = (await octokit.api.git.createTree(
        { base_tree: lastTreeSha, tree: treeItems })).data.sha;          // 只传变更文件
    const newCommitSha = (await octokit.api.git.createCommit(
        { message, tree: newTreeSha, parents: [lastCommitSha] })).data.sha;
    await octokit.api.git.updateRef(
        { ref: `heads/${branch}`, sha: newCommitSha });                  // 推送 = 直写分支 ref
}
```

机制要点：

- **推送即提交**：远端仓库没有本地副本，「commit」在 GitHub 服务器上完成，`updateRef` 直接推进分支。
  vscode.dev 的「Commit & Push」是同一个动作
- **增量建树**：`createTree` 的 `base_tree` 携带未变文件，请求体只含变更文件——大仓库提交也只是一次树请求
- **二进制**：tree item 的 inline `content` 走 UTF-8 字符串（源码里 `content.toString()`），大文件超限时需
  先 `POST /git/blobs`（base64）拿 sha 再入树（GitHub API 对单请求 body 有上限，约 1MB 量级需拆 blob）
- **状态计算**：SCM 面板的「更改/暂存」= 工作区（浏览器内编辑缓冲）与分支头树的 diff；暂存区是虚拟的，
  提交时把暂存集传给 `commit()` 即可
- **能力边界**：无 merge / rebase（这类操作在 GitHub 侧走 PR merge API 完成）；`updateRef` 非 force，
  冲突时按 422 提示「分支已被更新，需重新拉取」
- **速率**：认证后 REST 5000 req/h，search API 单独限额（认证 30/min）——浏览/编辑走 Contents API 足够，
  但递归树 + 逐文件读要做 ETag 缓存，避免大仓库打开即打爆限额

## 5. 本地发布（Publish to GitHub）与 CORS 现实

[`publish.ts`](https://github.com/microsoft/vscode/blob/main/extensions/github/src/publish.ts) 流程：
`getAuthenticated` 定 owner → QuickPick 私有/公开 + 仓库名 → `POST /user/repos` 建空库 →
`git init`（默认分支与远端一致）→ `commit('first commit', all)` → `addRemote(origin)` →
`repository.push(origin, branch)`。push 凭据来自 [`credentialProvider.ts`](https://github.com/microsoft/vscode/blob/main/extensions/github/src/credentialProvider.ts)：
`registerCredentialsProvider` 返回 `{ username: 账号 id, password: OAuth token }`，仅 github.com。

**但这一步依赖真 git over HTTPS**——实测 github.com 的 git smart-HTTP 端点（`/info/refs` GET 与 OPTIONS 预检）
都不返回 `Access-Control-Allow-Origin`，浏览器无法直连。桌面版无此问题；纯浏览器里走通它需要 CORS 代理。
对 aiao-vscode 的建议：**首版发布走 API**——建库后把本地 HEAD 快照一次性转成 blob/tree/commit
上传为初始提交（同样用 §4 的 git database API），避免引入代理组件；本地 `.git` 历史不保留（或仅首提交）。
需要保留完整历史再升级真 git + 代理方案。

## 6. 集成建议（aiao-vscode）

### 6.1 总体方案：虚拟仓库后端 + 轻量交换端点

| 方案                                                | 说明                                                                                       | 评价                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------- |
| **A. GitHub API 虚拟仓库（推荐，vscode.dev 路线）** | 新 `createGitHubBackend` 实现 `WorkbenchBackend`；读 Contents API，提交走 git database API | 零代理依赖、CORS 实测全通、SCM 面板零改动   |
| B. 真 git + CORS 代理                               | 本地 OPFS 仓库用 wasm-git push 到自建代理转发 github.com                                   | 保真 git 语义，但新增常驻代理服务，复杂度高 |
| C. 全后端代理                                       | 后端持 token 转发所有 API                                                                  | 违背 local-first，不推荐                    |

### 6.2 `WorkbenchBackend` 协议映射（新实现要满足的现有契约）

| 现有方法（session.ts）             | GitHub 后端实现                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `open(projectId)`                  | `git/trees/{branch}?recursive=1` 拉快照；projectId 形如 `github:owner/repo`（或 URI 编码），branch 另存会话元数据 |
| `save(projectId, files, revision)` | 编辑缓冲直接内存/IndexedDB 保存，revision 用分支头 sha + 变更计数（乐观并发，`updateRef` 前校验分支未动）         |
| `status(projectId)`                | 工作区与快照基线 diff → `WorkbenchStatus.entries` 的 index/worktree 标记（虚拟暂存集）                            |
| `stage/unstage/commit`             | 暂存集内存维护；commit = §4 三步 API                                                                              |
| `readDiff`                         | 本地双侧 diff（基线内容 vs 编辑缓冲），二进制走 base64 字节说明                                                   |
| `history/restore/exportArchive`    | `commits` API 列历史；restore 可映射为反向提交或只读回看；导出 = 下载 zipball（`/zipball/{ref}`）                 |
| `remove/rename`                    | 提交时作为删除/重命名树条目处理（Contents API 也有 DELETE 路径，但虚拟仓库模式建议统一到提交）                    |

### 6.3 认证落地

1. 注册自有 GitHub OAuth App（callback 用 `https://<部署域>/redirect`，与 vscode 相同的中转模式）
2. 静态页面路由 `/redirect`：读 `state` + `code`，302 回 `state`（Angular 里用 route guard + `location.replace` 等价实现，
   或托管层 302 规则——vscode.dev 是服务端 302）
3. 交换端点：Cloudflare Worker 持 client secret，POST code → github access_token；Worker 域名进 CSP `connect-src`
4. 会话：token 存 IndexedDB（可用 WebCrypto AES-GCM 加密，vscode 对 webview 凭据也用此手法），启动时 `GET /user` 验活
5. 兜底与过渡：PAT 输入框先行（打通全链路），OAuth 后置；退出登录时调 token 删除 API

### 6.4 分阶段

- **M1 只读浏览 + 登录**：公开仓库免登录打开；认证 + 我的仓库列表 + 分支选择（含 PAT 模式）
- **M2 编辑 + 提交推送**：GitHub 后端全套 `WorkbenchBackend` 契约、SCM 面板复用、乐观并发与冲突提示
- **M3 发布与协作**：API 发布本地项目、创建/查看 PR（`pulls` API）、组织仓库与 GHE 域白名单

### 6.5 安全清单

- token 永不出浏览器（交换端点只收 code 不收 token；API 直连 api.github.com，CSP 白名单）
- scope 最小化：只读浏览阶段可先 `public_repo`，写操作升级到 `repo`
- 虚拟仓库打开不执行仓库代码（aiao-vscode 预览已有 iframe 隔离基础，远端仓库默认禁运行）
- IndexedDB 里的 token 与编辑缓冲加密；登出即删

## 7. 证据索引

- 认证流源码：[flows.ts](https://github.com/microsoft/vscode/blob/main/extensions/github-authentication/src/flows.ts)、
  [githubServer.ts](https://github.com/microsoft/vscode/blob/main/extensions/github-authentication/src/githubServer.ts)、
  [config.ts](https://github.com/microsoft/vscode/blob/main/extensions/github-authentication/src/config.ts)（client id）
- scope 与 Octokit 装配：[auth.ts](https://github.com/microsoft/vscode/blob/main/extensions/github/src/auth.ts)
- 仓库发现：[remoteSourceProvider.ts](https://github.com/microsoft/vscode/blob/main/extensions/github/src/remoteSourceProvider.ts)、
  [remoteSource.ts](https://github.com/microsoft/vscode/blob/main/extensions/git-base/src/remoteSource.ts)
- 提交实现：[githubRepository.ts:810](https://github.com/microsoft/vscode-pull-request-github/blob/main/src/github/githubRepository.ts)
- 发布与凭据：[publish.ts](https://github.com/microsoft/vscode/blob/main/extensions/github/src/publish.ts)、
  [credentialProvider.ts](https://github.com/microsoft/vscode/blob/main/extensions/github/src/credentialProvider.ts)
- GitBase API 面：[git-base.d.ts](https://github.com/microsoft/vscode/blob/main/extensions/github/src/typings/git-base.d.ts)
- 官方行为说明：VS Code for the Web 文档（无 clone / API 直读 / 编辑缓冲 / SCM 推送）、
  GitHub OAuth / GitHub App 认证文档（client_secret Required 参数表）
- 实测：`vscode.dev/redirect` 302 链路（2026-11-03）；`api.github.com` 返回 `access-control-allow-origin: *`；
  github.com git 端点 GET/OPTIONS 均无 CORS 头
- 未公开部分：vscode-vfs 的 FileSystemProvider / GitBaseApi 实现已移出 microsoft/vscode 与 vscode-pull-request-github
  公开仓库（随 vscode.dev 独立下发），本文以保留在公开仓库的 commit 实现、typings 与官方文档交叉验证其机制
