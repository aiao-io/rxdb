# dev-rxdb-miniprogram-e2e

`dev-rxdb-miniprogram` 的端到端测试，用 [`miniprogram-automator`](https://developers.weixin.qq.com/miniprogram/dev/devtools/auto/) 驱动**微信开发者工具**跑真实小程序运行时。

## 为什么 target 叫 `e2e-devtools` 而不是 `e2e`

`ci-template.yml` 的 plan 步骤用 `nx show projects --withTarget=e2e` 自动发现 e2e 矩阵（注释原文：「不写死清单：新增 e2e 应用自动进矩阵」），而所有 runner 都是 `ubuntu-latest`。

本套件依赖 **GUI 版微信开发者工具**，官方只发 macOS 与 Windows 版。叫 `e2e` 就会被自动拉进 Linux job 并必然失败；`pnpm test-all` 的 `-t … e2e` 同理。

改名把它留在「显式本地门禁」这一侧：**想跑的人必须自己敲命令**。这也是 US-209 里「真机仍未测」那条缺口的现状——它没有被关掉，只是从「完全没有」变成了「有一套可随时手动执行的验证」。

光改名还不够：`@nx/playwright/plugin` 只要看到 `playwright.config.ts` 就会替项目推断出一个 `e2e`（以及 `e2e-ci`），推断出来的正好是要躲开的那个名字。所以 `nx.json` 里把本项目从该插件排除，`e2e-devtools` 的命令在 `project.json` 里显式写死。改动这两处任意一处之前，先跑一遍：

```bash
pnpm nx show projects --withTarget=e2e   # 结果里不应出现 dev-rxdb-miniprogram-e2e
```

## 前置条件

1. macOS 或 Windows，已安装微信开发者工具
2. **在工具里开启服务端口**：设置 → 安全设置 → 服务端口

   这一步只能在 GUI 里点。CLI 的 `y` 确认是弹在工具窗口里的对话框，管道和 pty 都喂不进去——`devtools-environment.ts` 会在连接前先探测，关着的话直接给出这条指引而不是超时。

3. 已登录开发者工具（`cli islogin`）

## 运行

```bash
# 会先自动构建 dev-rxdb-miniprogram（project.json 里声明了 dependsOn）
pnpm nx e2e-devtools dev-rxdb-miniprogram-e2e
```

### 环境变量

| 变量                          | 作用                                                                 |
| ----------------------------- | -------------------------------------------------------------------- |
| `WECHAT_DEVTOOLS_CLI`         | 覆盖开发者工具 CLI 路径（非默认安装位置时用）                        |
| `WECHAT_DEVTOOLS_WS_ENDPOINT` | 接上一个已在自动化模式下运行的工具实例，跳过冷启动。调试用例时省时间 |

手动起一个可复用的实例：

```bash
/Applications/wechatwebdevtools.app/Contents/MacOS/cli auto \
  --project apps/dev-rxdb-miniprogram --auto-port 9420
WECHAT_DEVTOOLS_WS_ENDPOINT=ws://localhost:9420 pnpm nx e2e-devtools dev-rxdb-miniprogram-e2e
```

## 覆盖什么

| 文件                         | 验证内容                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `runtime-bootstrap.spec.ts`  | 运行时能力全部就绪；`crypto.getRandomValues` 来源是**微信桥接**而非缺失或降级；CRUD 自检与断开重连通过 |
| `secure-random.spec.ts`      | 真实 `wx.getRandomValues` 下的随机池：单池同步连发、跨池轮换无重复无全零、超出整池容量时抛错而不降级   |
| `todo-crud.spec.ts`          | 增 / 改 / 删 / 重进页面后仍在——整条 Taro → RxDB → wa-sqlite → 落盘链路                                 |
| `launch-persistence.spec.ts` | 清库 → 待重启 → 重启 → 通过的完整状态迁移                                                              |

### 与单元测试的分工

`packages/rxdb-adapter-miniprogram` 的 Vitest 用例里，`wx` 是我们自己写的桩——它当然满足我们自己的期望。本套件换成开发者工具里的真 `wx`，验的是桩证明不了的那一半：桥接往返的真实时序、WXWebAssembly 的真实行为、`wx.getFileSystemManager` 的真实落盘。

特别地，`secure-random.spec.ts` 是 `random-pool-endurance.spec.ts` 的真机对照：后者用计数器桩证明**调度逻辑**正确，前者证明在真实桥接延迟下**补给来得及**。

## 已知约束

- **进不了 CI**。GitHub 托管的 runner 没有 macOS + 微信开发者工具的组合，自建 runner 也要挂着 GUI 会话。这是工具链的硬限制，不是本套件的设计选择。
- `miniprogram-automator` 停在 `0.12.1`（2023-11-07），依赖树里有 `ws@6` / `jimp@0.6` 这类 2018 年前后的包。实测在 Node 24 上握手、收发、协议解析均正常，且它对 `SDKVersion` 的 `>= 2.7.3` 校验认得本项目的 `libVersion 3.17.1`。
- `npm audit` 报的高危项全部来自 `jimp → mkdirp → minimist` 与 `jpeg-js`，其引用点只有 `MiniProgram.remote()`（真机调试扫码）。本套件走 `launch()` / `connect()`，不触及这条路径。
