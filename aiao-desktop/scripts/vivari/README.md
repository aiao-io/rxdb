# Vivari 终端资源

桌面固定使用 Vivari 1.3.0。SDK 自带的命令还需要宿主提供 `/vendor/` 资源；SDK worker 已存在不代表 Python、TypeScript 或 SQLite 已能执行。

`aiao-desktop-web:prepare-vendor` 在构建和开发前运行：

- `tools.json` 固定 npm、pnpm、Yarn、Corepack 和 tsgo-wasm 的版本、下载地址与 SHA-512。下载包不执行生命周期脚本。tsgo 按固定发布源码的规则从启动器提取 Go 引擎，再生成 Vivari 的 gzip 索引包。
- `runtimes.json` 固定 Pyodide 314.0.3、Ruff 0.16.1、SQLite 3.53.0-build1 的源包 SHA-512，以及全部输出文件的 SHA-256。72 个 Python wheel 的散列来自 Pyodide 锁文件或 PyPI 发布元数据。
- `python-lock.json` 源自同版本 Pyodide 的锁文件，补入固定版本的纯 Python wheel，修正上游脚本列出的 mypy / rich 依赖，再解析完整传递依赖。同源 wheel 保留相对路径；其余 Pyodide 索引中的包使用固定版本 CDN 地址，使用它们仍需要网络。
- 资源生成到 `node_modules/.cache/aiao-desktop/vivari/vendor`，随后复制到正式产物。合格缓存完全离线复用；损坏缓存直接失败。发布前逐文件复核，缺失、HTML 替身、版本错误与内容变更均拒绝。

源码依据是 `tools.json` 的 `sourceCommit`，对应 Vivari 的 `vendor-tsgo.mjs`、`vendor-pyodide.mjs`、`vendor-ruff.mjs` 与 `vendor-sqlite.mjs`。llhttp 已嵌入 SDK worker，不另复制。SDK 的 pnpm 补丁固定在 `tools.json` 的 `sdkPatch`：宿主同源 `/vendor/` 请求使用浏览器网络，其余 localhost 请求继续走虚拟机；Ruff 的 ESM 资源使用宿主加载器。正常 `SystemExit` 保留退出码，pip 的 wheel 加载失败会返回失败；两个 worker URL 带补丁版本参数，避免浏览器复用旧缓存。上游 Studio 的工程模板锁和预热缓存不属于终端运行时。

全部资源按命令或 import 首次使用加载，不进入桌面首屏。`.mjs` 必须以 JavaScript 类型返回，WASM 必须保留二进制内容，托管方需要全站跨源隔离响应头。

| 能力           | 命令或模块                                                | 提供的资源                                  |
| -------------- | --------------------------------------------------------- | ------------------------------------------- |
| 包管理器       | npm / npx、pnpm / pnpx、Yarn、Corepack                    | 固定版本 pack                               |
| Python 3.14    | python / python3、脚本、REPL、标准库                      | Pyodide、CPython WASM、标准库               |
| Python 包      | pip / pip3、python -m pip                                 | micropip、固定 wheel、项目内 `.venv` 包存储 |
| 数据与科学计算 | NumPy、pandas、SciPy、scikit-learn、matplotlib、openpyxl  | 同源 wheel 与传递依赖                       |
| Python 工具    | pytest、Black、mypy、Ruff                                 | 同源 wheel 或独立 Ruff WASM                 |
| Python 库      | FastAPI、Flask、httpx、requests、SQLAlchemy、Rich、tzdata | 同源 wheel 与传递依赖                       |
| TypeScript 7   | tsc / tsgo                                                | tsgo-wasm 与 Go 引擎                        |
| Bun 兼容命令   | bun / bunx                                                | SDK 自带，不下载原生 Bun                    |
| SQL            | node:sqlite、bun:sqlite                                   | 同源 SQLite WASM                            |

Python 按当前目录镜像项目文件；运行项目测试前先 `cd` 到项目目录。pip 是 Vivari 的兼容命令，支持 install / list / freeze / show / check / uninstall，不代表原生 pip 的全部子命令。原生 CPython 扩展必须有匹配的 Pyodide WASM wheel；任意 npm 包与 Node 原生扩展也没有兼容保证。当前没有接入 Web 服务的预览路由、TCP 中继或上游 Studio 的 IDE 界面。Yarn `--version` 仍有 SDK 的退出堆栈问题，可用 `yarn versions --json` 查询版本。

验证通过 Nx 运行：

```bash
NX_NO_CLOUD=true pnpm nx run aiao-desktop:runtime-test:coverage
NX_NO_CLOUD=true pnpm nx run aiao-desktop:deploy-test
NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=terminal-runtimes,terminal-packages,disk-terminal
```

浏览器冒烟不访问外网。pip 使用仓库内固定 wheel，npm 使用固定 registry 夹具；Python 库从正式产物加载。增加或更新资源时同时更新清单中的版本与散列、锁文件依赖、发布检查和浏览器验收。
