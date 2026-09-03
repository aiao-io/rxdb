# RxDB DevTools Extension (Angular)

Chrome DevTools 扩展（Manifest V3），用于检查任意接入 [`@aiao/rxdb-devtools`](../../packages/rxdb-devtools) 的本地优先应用：实时事件流、数据库/实体数据、分支管理、文件浏览与存储管理。

面板本体不在本目录，而在共享 library [`modules/rxdb-devtools-panel`](../../modules/rxdb-devtools-panel)（Angular + signals + daisyUI/Tailwind），Chrome / Electron / Tauri 三个宿主共用同一份 UI 与状态机。本目录只提供 **Chrome 侧的宿主适配**：四段中继、`chrome.*` API 的封装、以及 MV3 打包。

## 功能面板

- **Events** —— 实时 RxDB 事件流与详情
- **Database** —— 数据库信息、实体列表与数据查询
- **OPFS** —— 浏览 / 上传 / 下载 / 删除文件与目录（浏览器端是 OPFS，桌面端是原生文件后端）
- **Storage** —— `StorageFileMeta` 存储元数据
- **Settings** —— 主题、清理本地数据

## 架构

四段中继，消息协议由 `@aiao/rxdb-devtools` 定义（v2 信封 + 版本协商）：

```text
被检查页面 (@aiao/rxdb-devtools connector)
        │  window.postMessage
        ▼
src/content/bridge.ts    ── 页面 ↔ 扩展 消息桥接（由 background 经 chrome.scripting 注入）
        │  chrome.runtime
        ▼
src/background/index.ts  ── 按 tabId 路由 Panel ↔ Content（MV3 service worker）
        │  chrome.runtime.Port
        ▼
src/devtools/            ── 宿主适配 + modules/rxdb-devtools-panel 的面板 UI
```

- 版本协商采用「**宽外层、严内层**」：外层认两代信封并必判方向，内层版本匹配后对未知消息、额外字段、错误 direction / session / 窗口标签一律拒绝。
- 握手容错：面板连接后由 background 发 `PING`，页面 connector 重发 `HANDSHAKE`，未连接期间事件在页面侧缓冲。

## 开发

```bash
# 开发（HMR）
pnpm nx serve rxdb-devtools-extension        # 或 dev

# 生产构建 → dist/，并打包 release/crx-*.zip
pnpm nx build rxdb-devtools-extension

# 桌面端调试变体 → dist-desktop-dev/（见下一节，不打 zip）
pnpm nx run rxdb-devtools-extension:build-desktop-dev

# 质量门禁
pnpm nx run rxdb-devtools-extension:typecheck
pnpm nx run rxdb-devtools-extension:lint
pnpm nx run rxdb-devtools-extension:test
```

加载到 Chrome：`chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择 `dist/`。随后对目标页面打开 DevTools，切到 **RxDB** 面板。

## 桌面端（Electron）调试

桌面 SQLite 与原生文件后端**在浏览器端不存在**，要看它们的数据只能在桌面应用里开面板。桌面端唯一成立的形态是：

> **应用跑 `--serve`（http renderer） + 加载 `dist-desktop-dev/` 这份 dev 变体扩展。**

**要开两个终端**，理由见下面的「为什么不能只跑 `nx dev`」。

```bash
# ① 一次性：桌面端调试变体（带一条静态 host_permissions: ['http://localhost/*']）
pnpm nx run rxdb-devtools-extension:build-desktop-dev

# ② 终端 1：renderer dev server，占住 4120 不退
pnpm nx serve dev-rxdb-electron

# ③ 终端 2：带四个开关启动 Electron，指向 ① 的产物（在仓库根目录跑）
env -u ELECTRON_RUN_AS_NODE \
  DEV_RXDB_DEVTOOLS=1 \
  DEV_RXDB_DEVTOOLS_EXTENSION="$PWD/apps/rxdb-devtools-extension/dist-desktop-dev" \
  DEV_RXDB_DEVTOOLS_CAPABILITY=full \
  DEV_RXDB_DEVTOOLS_MUTATION=allow \
  ./node_modules/.bin/electron dist/apps/dev-rxdb-electron --serve
```

③ 里的 `electron dist/apps/dev-rxdb-electron --serve` 就是 `nx dev` 那个 target 的命令本体；这里直接跑它，是为了绕开下面那条依赖链问题。首次跑之前（或改过主进程代码后）需要有 `dist/apps/dev-rxdb-electron/src-electron/`，由 `pnpm nx run dev-rxdb-electron:watch-main` 产出。

应用窗口起来后打开 DevTools（`Cmd/Ctrl + Option/Shift + I`）→ 切到 **RxDB** 面板。面板应当直接进入已连接状态（Electron 上没有运行时授权模型，静态 host permission 在安装时即生效，不会出现「允许访问当前站点」按钮）。

### 为什么不能只跑 `nx dev`

`dev` 依赖的是**非 continuous** 的 `prepare-electron-package`，而 4120 那个 `serve` 是挂在
`prepare-electron-package` 下面的 continuous 依赖。`prepare-electron-package` 的
`wait-on tcp:4120` 一满足就算完成，Nx 随即把它下面的 continuous 任务收掉——**dev server 在
Electron 真正加载页面之前就被拆了**。实测表征（`nx dev` 单跑）：

```text
➜  Local:   http://127.0.0.1:4120/            ← serve 起来了
Command was killed with SIGTERM: tsc … --watch  ← 紧接着被拆
electron: Failed to load URL: http://localhost:4120/ with error: ERR_CONNECTION_REFUSED
[dev-rxdb-electron] 窗口加载失败： Error: ERR_CONNECTION_REFUSED (-102)
```

所以 dev server 必须由**另一个不会被收掉的进程**持有，也就是上面的终端 1。

### 四个 env 开关

由 [`devtools-extension.ts`](../dev-rxdb-electron/src-electron/devtools-extension.ts) 解析，**一律显式给全，缺一即抛**——没有默认扩展目录、没有默认档位。猜一个目录出来意味着路径写错时会去加载另一个碰巧存在的扩展；给档位一个默认值意味着漏配的那次运行拿到的是「某个人当初觉得合理」的权限。

| 变量                           | 取值                         | 含义                                      |
| ------------------------------ | ---------------------------- | ----------------------------------------- |
| `DEV_RXDB_DEVTOOLS`            | 逐字 `1`                     | 总开关；不是 `1` 就一步都不往下走         |
| `DEV_RXDB_DEVTOOLS_EXTENSION`  | **绝对路径**                 | unpacked 扩展目录，即 `dist-desktop-dev/` |
| `DEV_RXDB_DEVTOOLS_CAPABILITY` | `none` / `readonly` / `full` | 本次运行的能力档                          |
| `DEV_RXDB_DEVTOOLS_MUTATION`   | 逐字 `allow`，省略即只读     | 写入开关；要在面板里改文件才需要          |

一个开关都不设时（正式启动路径）**一个扩展都不加载**，产物里也没有扩展源码与加载路径——运行时闸门与 `electron-builder.json` 的构建期排除各挡一半，由 `devtools-extension-loading.spec.ts` 守住。

### 为什么打包产物（`app://` 入口）用不了

两条都是 US-904 阶段 D 在真实产物上实测的结论，**不是配置问题，没有修法**：

1. **自定义 scheme 拿不到扩展 host permission。** 桌面生产入口是 `app://`（`main.utils.ts` 的 `APP_SCHEME`），而自定义 scheme 不在 Chromium 扩展 match pattern 的合法 scheme 集（http / https / file / ftp）里。`['app://-/*']`、`['<all_urls>']`、两者并列三种写法实测全部让 `chrome.scripting.executeScript` 抛「Cannot access contents of the page…」——连 `<all_urls>` 都不行，它只覆盖上述四种 scheme。
2. **Electron 没有 `chrome.permissions` 命名空间。** 所以发布 manifest 里的 `optional_host_permissions` 授权集恒为空，运行时请求那条路不存在；桌面端必须有一条**静态** `host_permissions`。

这正是 dev 变体存在的理由，也是它**只加那一条键**的理由（`manifest.config.spec.ts` 的结构断言钉住了这点）。发布 manifest 保持 optional-only：往里加 `host_permissions` 加了也不工作，只会在浏览器侧多一份安装警告与权限面。

打包态打开面板时，面板会停在「当前页面不支持扩展注入」并说明原因（协议不在可注入集内）。这是诚实的终态，不是故障。

### 排查

- **`TypeError: Cannot read properties of undefined (reading 'registerSchemesAsPrivileged')`**：应用以**纯 Node** 启动了，不是 Electron。原因是**任何 Electron 宿主都会给自己派生的子进程设 `ELECTRON_RUN_AS_NODE=1`**——VS Code 的集成终端是最常见的一个。同一条命令在系统终端里正常、在 VS Code 终端里必炸，而报错跟真因毫无关系。解法是把它剥掉：

  ```bash
  env -u ELECTRON_RUN_AS_NODE pnpm nx dev dev-rxdb-electron
  ```

  （e2e 侧早有防护，见 `apps/dev-rxdb-electron-e2e/src/packaged-app.ts` 的 `launchEnv()`。）

- **面板 tab 根本找不到**：DevTools 的 `TabbedPane` 会把放不下的 tab **移出 DOM**，只挂在「»」下拉里。先把窗口放宽（e2e 里是 `setSize(1600, 1000)`）再找。
- **注入失败是完全无声的**：service worker 的日志在生产构建里全关，Chromium 的安装警告也不落 stderr。唯一能看见真因的通道是在 `panel.html` 帧里直接调 `chrome.scripting.executeScript`，错误消息当场就有。
- **别用 `window.__AIAO_RXDB_DEVTOOLS_BRIDGE__` 判断桥注没注进去**：`chrome.scripting` 在**隔离世界**执行，从主世界看这个值永远是 false，这个观测口径是错的。

## 已知限制

- **文件上传**：经 base64 走消息通道传输，超大文件较慢（>50MB 会有提示）。
- **数据库导出**：**已停用**。按钮常量禁用，强制发命令固定返回 `export_unsupported`（面板与 connector 各拒一次）。原先的整库 tar 打包路径会把 OPFS 全读进内存，且对热文件（SQLite WAL）只能拿到不一致快照。
- **清理所有数据**：会清空被检查源下的 **RxDB + OPFS + IndexedDB + localStorage**，不仅限 RxDB，且不可撤销。宿主未声明该能力时返回 `provider_unsupported`。
- **权限**：浏览器端首次检查站点时按当前 origin 请求可选 host 权限，导航到新 origin 后重新判定；Electron 端没有这个运行时模型，见上文。
