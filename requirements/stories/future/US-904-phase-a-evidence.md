# US-904 阶段 A 可行性记录 — Electron 43 / 44 MV3 扩展 stop/go

> 本文件是 [US-904](./US-904-devtools-native-storage-contract.md) frontmatter `evidence` 指向的可行性记录。
> 结论：**`decision: supported`** —— 阶段 D（Electron desktop SQLite / native files 接入）解锁。

## 结论

| 项目           | 值                                                                       |
| -------------- | ------------------------------------------------------------------------ |
| 判定           | `supported`                                                              |
| 判定日期       | 2026-08-27（Electron 43.4.0）；2026-08-29 在 44.0.0 上复核               |
| 关键项         | AC#1 / AC#2 / AC#3(注入) / AC#4 —— 全部通过                              |
| 可容忍差异     | 1 项（AC#3 的 `chrome.permissions.request`，见下）                       |
| 不可容忍的降级 | 0 项（未使用 `<all_urls>`、未 mock 任何 `chrome.*` API）                 |
| 复现次数       | 43.4.0 上 3 次；44.0.0 上 macOS / Linux 各 1 次，ok 向量一致             |
| 前置条件       | **Electron 必须在真沙箱下运行**（`--no-sandbox` 会让面板失效，见发现 4） |

## 运行环境与命令

| 项       | 首次判定                                   | 44 复核                                         |
| -------- | ------------------------------------------ | ----------------------------------------------- |
| Electron | 43.4.0                                     | 44.0.0                                          |
| Chromium | 150.0.7871.224                             | 152.0.7977.54                                   |
| Node     | 24.18.1（Electron 内置，非工作区 Node 26） | 24.18.1                                         |
| 平台     | darwin arm64 (Darwin 25.5.0)               | darwin arm64 + linux arm64（noble 容器 + Xvfb） |
| 扩展     | `RxDB DevTools`，`manifest_version: 3`     | 同左                                            |

```bash
# 门禁（推荐）：自动构建扩展产物后跑断言
pnpm nx e2e dev-rxdb-electron-e2e --grep "US-904 阶段 A"

# 只跑探针、拿原始 findings（路径不写死版本，避免升级后失效）
pnpm nx build rxdb-devtools-extension
ELECTRON_RUN_AS_NODE= "$(node -p 'require("electron")')" \
  apps/dev-rxdb-electron/tools/devtools-mv3-probe.mjs \
  "$PWD/apps/rxdb-devtools-extension/dist" /tmp/us904.json
```

> `ELECTRON_RUN_AS_NODE` 必须清掉。任何 Electron 宿主（VS Code 集成终端最常见）都会给子进程设它，
> 带着它启动会让二进制退化成纯 Node —— 报出来的错和真正的原因毫无关系。
>
> **Linux 上还要先配好 SUID 沙箱助手**（pnpm 解包置不了 setuid 位）：
> `sudo chown root:root "$(dirname "$(node -p 'require("electron")')")/chrome-sandbox" && sudo chmod 4755 …`。
> 不能改用 `--no-sandbox` 绕过 —— 那会直接让被测能力失效，见发现 4。

fixture：

- `apps/dev-rxdb-electron/tools/devtools-mv3-probe.mjs` —— 真实 Electron 主进程，加载真实扩展产物、
  开真实 DevTools，只记录事实，不做判定。
- `apps/dev-rxdb-electron-e2e/src/devtools-mv3-feasibility.spec.ts` —— 逐条断言，缺 finding 即红。

两个文件不被 `apps/dev-rxdb-electron/src-electron/` 的任何模块 import。删除它们，生产主进程一行不改，
不留任何运行时 fallback（阶段 A 技术约束要求）。

## AC 逐项证据

### AC#1 — `loadExtension` + MV3 service worker 启动 ✅ 关键项

`session.defaultSession.extensions.loadExtension(<staged dist>)` 返回有效扩展：

```json
{
  "extension": { "id": "ijimdocfmeklgilcgckfhhphpaemdleh", "name": "RxDB DevTools", "manifestVersion": 3 },
  "serviceWorkers": [
    {
      "scriptUrl": "chrome-extension://ijimdocfmeklgilcgckfhhphpaemdleh/service-worker-loader.js",
      "scope": "chrome-extension://ijimdocfmeklgilcgckfhhphpaemdleh/"
    }
  ]
}
```

无差异，无失败。

### AC#2 — `chrome.devtools.panels.create` + 一次完整往返 ✅ 关键项

RxDB panel 真实出现在 DevTools **主** tab 条中。tab 元素的 id 才是稳定标识（内建面板 `tab-elements`，
扩展面板 `tab-chrome-extension://<扩展 id><面板标题>`）—— 标题随 DevTools locale 变，id 不变：

```text
tab-elements | tab-console | tab-sources | tab-network | tab-timeline | tab-heap-profiler
| tab-resources | tab-security | tab-lighthouse | tab-chrome-recorder
| tab-chrome-extension://<扩展 id>RxDB
```

按「下一个面板」快捷键循环 10 次后选中项为 `RxDB`，真实面板文档加载：

```text
devtools://devtools/bundled/devtools_app.html?remoteBase=…
chrome-extension://ijimdocfmeklgilcgckfhhphpaemdleh/devtools.html
chrome-extension://ijimdocfmeklgilcgckfhhphpaemdleh/panel.html#/events
```

四段中继全程真实（panel → service worker → `chrome.scripting` 注入 → inspected page → panel）：

| 观察点              | 结果                                          |
| ------------------- | --------------------------------------------- |
| inspected page 收到 | `["PING", "HANDSHAKE", "port:HANDSHAKE_ACK"]` |
| 私有 MessagePort    | 1 个                                          |
| panel 侧 Port 收到  | `[{ "type": "HANDSHAKE" }]`                   |

**发现 1（阻塞过一次判定，必须记录）：DevTools 必须 dock。** `mode: 'detach'` 与 `'undocked'` 的
DevTools 窗口**不注册任何扩展面板** —— Lighthouse、Recorder 也一并消失，等 20 秒同样不出现。只有
`mode: 'bottom'` 会注册。曾据此差点误判 `unsupported`；dock 模式矩阵推翻了该结论。

**发现 2：面板页惰性实例化。** `chrome.devtools.panels.create` 只登记 tab，`panel.html` 要等 tab 被
选中才加载。合成 `element.click()` 不被 DevTools 的 tab 选中逻辑接受，完整指针事件序列
（`pointerdown / mousedown / pointerup / mouseup / click`）可以，但探针最终改用 DevTools 自己的
「下一个面板」快捷键循环 —— 它遍历完整 tab 数组，tab 条放不下时被收进溢出下拉的 tab 照样能选中，
而那个下拉在 Electron 下是原生菜单，DOM 里查不到、脚本点不到。

### AC#3 — 权限与 `chrome.scripting` 注入 ✅ 关键项（注入），⚠️ 可容忍差异（授权 UI）

**注入本身（关键项，真实通过）**：由真实 `panel.html` 文档内的 `chrome.runtime.connect` + INIT 驱动，
注入由 background 的真实 `chrome.scripting.executeScript` 执行，往返结果同 AC#2。

**只注入目标页面（关键项，真实通过）**：另开一个 `http://localhost:<port>` 窗口（与授权的
`127.0.0.1` 是不同**主机名**；match pattern 不接受端口，所以只能靠主机名区分），对其 tabId 驱动同一条
relay：

```json
{ "foreignOrigin": "http://localhost:58618", "foreignTabId": 2, "page": { "seen": [], "ports": 0 } }
```

注入没有越出窄 host permission。

**可容忍差异（AC#3 的 `chrome.permissions.request`）**：按故事「关键项与可容忍差异」，fixture 的扩展
manifest 改用静态窄 host permission，绕过运行时授权 UI。

| 项                     | 值                                                                                                                                                                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 构建产物改动前         | `permissions: ["scripting"]`，`optional_host_permissions: ["<all_urls>"]`，无 `host_permissions`                                                                                                                     |
| fixture 副本改动后     | `permissions: ["scripting"]`，`host_permissions: ["http://127.0.0.1/*"]`                                                                                                                                             |
| 改动范围               | 只改 `mkdtemp` 出来的临时目录副本                                                                                                                                                                                    |
| **生产 manifest 核对** | `apps/rxdb-devtools-extension/manifest.config.ts` 与 `dist/manifest.json` **未改动**，仍为 `optional_host_permissions: ['<all_urls>']`；由 spec 的「可容忍差异已记录，且 Chrome 生产 manifest 未被改动」一条持续核对 |

差异范围严格限定：未使用 `<all_urls>`，未对非 fixture origin 注入，未 mock `chrome.scripting`。

### AC#4 — Port 断开与生命周期清理可观察 ✅ 关键项

| 场景                    | 观察                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 刷新 inspected page     | 刷新后立刻 `{ "seen": [], "ports": 0 }`（旧 connector 与私有 port 随页面释放）；重新 INIT 后完整往返恢复                                                                              |
| 关闭 DevTools 再打开    | `isDevToolsOpened(): false`，devtools webContents 消失（只剩两个 `window`）；重开后**新** panel Port 收到 `[{"type":"HANDSHAKE"}]`，页面收到 `port:HANDSHAKE_ACK` —— 无残留旧连接顶替 |
| 销毁全部窗口            | `getAllWebContents(): []`                                                                                                                                                             |
| service worker 空闲自停 | 销毁瞬间 worker 仍在（MV3 worker 不随页面走）；空闲约 30 秒后 `getAllRunning()` 为空                                                                                                  |

两个时刻都断言过，才能把「清理生效」与「本来就没起起来」区分开。

## 发现 3：Electron 43 缺少整个 `chrome.permissions` 命名空间 —— 阶段 D 必须处理

从真实 `panel.html` 文档内枚举能力：

```json
{
  "devtools": "object",
  "inspectedTabId": 1,
  "inspectedWindowEval": "function",
  "networkOnNavigated": "function",
  "panelsCreate": "function",
  "permissions": "undefined",
  "permissionsContains": "undefined",
  "permissionsRequest": "undefined",
  "runtimeConnect": "function"
}
```

缺的不只是 `request`，是**整个命名空间**。后果链条：

1. `InspectedPageAccessService.refresh()` 调 `chrome.permissions.contains(...)`；
2. 抛 `TypeError: Cannot read properties of undefined (reading 'contains')`，且是**未捕获的 promise 拒绝**；
3. `activateTab()` 永不执行；
4. 面板停在 `DevTools 未连接 Events Database OPFS Storage Settings`，用户看不到任何错误原因。

**这不构成 stop**：它落在故事允许的 AC#3 差异范围内（授权 UI 本身不是被测能力），且被测的四项关键
能力全部真实通过。

**但它是阶段 D 的一个显式工作项**，且比 `request` 单点缺失更宽：

- 阶段 D 必须做**显式能力探测**（`typeof chrome.permissions?.contains === 'function'`）并在缺失时走
  Electron 专属的授权路径，同时把状态如实呈现给用户；
- **不允许写静默 fallback**（AGENTS.md 铁律「无 fallback 兜底」）—— 现状的失败模式恰恰就是静默：
  一个未捕获拒绝把面板永久钉在「未连接」，没有任何可诊断的输出；
- spec 里的「已记录 chrome.permissions 在 Electron 43 缺失」一条固化现状。Electron 补上该 API 后它会
  变红，那正是回来删掉阶段 D 能力探测分支的时机。

## 发现 4：`--no-sandbox` 会让扩展面板彻底消失 —— 阶段 D 的硬前置

2026-08-29 在 Electron 44.0.0 上复核时，CI（ubuntu + Xvfb）红了 AC#2 / AC#3(注入) / AC#4a / AC#4b，
而同一份产物在本机全绿。**唯一的变量是 `--no-sandbox`**：CI 为了绕开 pnpm 装不出 setuid 位的
`chrome-sandbox` 而加了这个开关。

| 平台                      | 沙箱                  | 结果                                   |
| ------------------------- | --------------------- | -------------------------------------- |
| darwin arm64              | 真沙箱                | 10/10 findings ok                      |
| darwin arm64              | `--no-sandbox`        | AC#2 / AC#3(注入) / AC#4a / AC#4b 全红 |
| linux arm64（noble 容器） | `--no-sandbox`        | 同上，与 CI 逐字一致                   |
| linux arm64（noble 容器） | 真沙箱（setuid 4755） | 10/10 findings ok                      |

机制：非沙箱渲染进程走 Electron 的 `renderer_init`，它同步向主进程要 preload 列表；扩展的
`devtools_page` 拿回的是 `null`，于是整个 bundle 在

```text
Electron renderer.bundle.js script failed to run
TypeError: object null is not iterable (cannot read property Symbol(Symbol.iterator))
```

处中断 —— 页面自己的脚本一行都没执行，`chrome.devtools.panels.create` 从未被调用，面板不进 tab 条。

**失败模式是静默的**，这才是它值得单独记一条的原因：那两行只出现在 DevTools 前端的 console 里，
主进程 stderr 一个字都没有；从帧树看 `chrome-extension://<id>/devtools.html` 还在，
在那个帧里探 `chrome.devtools` / `panels.create` 也一切正常。只有
`document.readyState` 停在 `loading`、`document.scripts` 为空能看出脚本压根没跑。
探针因此固定采集 `devtoolsPageState` 与 DevTools 前端 console（见 `AC2` 的 detail）。

对阶段 D 的约束：

- **桌面端不能带 `--no-sandbox` 发布**，否则 DevTools 扩展面板在用户机器上直接不存在，且没有任何
  可见错误 —— 与「无 fallback 兜底」冲突的正是这种静默失效；
- 阶段 D 的 E2E 同理不能用 `--no-sandbox` 绕沙箱配置问题。门禁侧已由
  `devtools-mv3-feasibility.spec.ts` 的 `assertSandboxUsable()` 兜住：Linux 上 `chrome-sandbox`
  不是 root:root 4755 就带修复命令直接红，不退回 `--no-sandbox`；
- CI 侧对应 `.github/workflows/ci-template.yml` 的 `Configure Electron SUID sandbox` 步骤。
  ubuntu-24.04 的 AppArmor 默认禁掉非特权 user namespace，命名空间沙箱走不通，只能配 SUID 助手。

## 对排期的影响（AC#6）

- **阶段 D 解锁**（仍需等阶段 C 与 US-207 / US-504 关闭）。
- 阶段 B / C 的共享链与 US-905 不受影响。
- 阶段 D 新增工作项：`chrome.permissions` 缺失下的显式能力探测与授权路径（见发现 3）。
- 阶段 D 的 E2E 必须把 DevTools 固定为 dock 模式（见发现 1），否则面板根本不会注册。
- 阶段 D 的桌面端启动参数必须保留沙箱（见发现 4），否则面板在用户机器上静默消失。
