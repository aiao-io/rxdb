# 2026-11-15 终端包管理器验收

修复 ADESK-US-102 的包管理器资源漏部署。Node 26.13.0、macOS、本地正式构建；浏览器上下文全新，外网被拦截，npm registry 使用固定夹具。

在仓库根执行（关闭已停用的 Nx Cloud）：

```bash
NX_NO_CLOUD=true pnpm nx run aiao-desktop:runtime-test:coverage
NX_NO_CLOUD=true pnpm nx run aiao-desktop:deploy-test
NX_NO_CLOUD=true pnpm nx run aiao-desktop:verify --parallel=1
NX_NO_CLOUD=true pnpm nx run aiao-desktop:dev-test
NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=terminal-packages,disk-terminal --report=/Users/jimmy/Documents/aiao-io/web-desktop/aiao-desktop/requirements/evidence/2026-11-15/terminal-packages.json
```

打包脚本测试通过，行覆盖率 92.71%、分支 91.43%、函数 90%。包管理器资源按清单中的源包 SHA-512 校验；HTML、损坏 gzip、错误版本、缺入口与索引越界均拒绝。发布检查会拒绝遗漏或损坏的 vendor 包。

浏览器验收报告：[terminal-packages.json](terminal-packages.json)。资源首次加载、工具版本、npm 下载和解包固定依赖、Node 执行依赖，均在正式构建上验证。版本检查中 Yarn 使用 `yarn versions --json`，`yarn --version` 在 Vivari 1.3.0 中仍会打印 `process.exit called` 上游异常。

未发布线上；未证明任意第三方依赖、原生扩展或真实 registry 的完整兼容性。

完整产品校验首轮的前端单测为 92 个文件、1,348 条用例通过，完整浏览器冒烟 25 组通过。首轮 `verify` 退出码为 1，唯一失败是旧开发配置测试没有包含新增的 `prepare-vendor` 前置任务，见[首次汇总](verify-first-summary.txt)。更新该断言后，单独复跑 `aiao-desktop:dev-test` 通过，见[复跑日志](dev-test-green.txt)；没有重复运行已通过的完整浏览器套件。

## Python 与其余运行时补验

同日追加 Python 3.14（Pyodide 314.0.3）、72 个固定 wheel、Ruff 0.16.1、tsgo-wasm 7.0.2、SQLite 3.53.0-build1。运行时与包管理器共 89 个 vendor 文件、99,366,322 字节；全部按需加载，资源不进入首屏 JS。源发布包校验 SHA-512，原始运行时文件逐个校验 SHA-256。

[运行时报告](terminal-runtimes.json)的 22 项全部通过，包含真实程序执行和计算结果。pip 使用仓库内标准 wheel 夹具，验证安装、下个 Python 进程导入及 freeze；Python 写入的文件出现在桌面。TypeScript 编译结果交由 Node 执行；Node SQLite 的文件重新打开后仍有数据，Bun SQLite 能执行查询。

[首次失败](terminal-runtimes-first-failure.json)保留资源齐全但 localhost 请求被 SDK 路由进入 VM、Ruff 导入失败的结果；[中间结果](terminal-runtimes-intermediate.json)保留 Python/科学计算已通过但工具退出与测试路径尚未修复的结果。最终通过前还修复了 Pyodide 的 SystemExit 从异步事件循环逸出、pip 的 wheel 失败后误报安装成功；回归测试验证非零退出码、普通退出、顶层 await 和失败安装。SDK 用 pnpm 固定版本补丁登记，两个 worker URL 均带补丁版本参数。

资源脚本与 SDK 回归测试 16 条通过，资源脚本行/函数覆盖率 100%、分支 96.39%。发布脚本 47 条、e2e 框架单测与 lint 已通过。完整产品 verify 的最终结果见下方。

```bash
NX_NO_CLOUD=true pnpm nx run aiao-desktop:runtime-test:coverage
NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=terminal-runtimes --report=/Users/jimmy/Documents/aiao-io/web-desktop/aiao-desktop/requirements/evidence/2026-11-15/terminal-runtimes.json
NX_NO_CLOUD=true pnpm nx run aiao-desktop:verify --parallel=1 --output-style=static
```

完整产品 `verify` 本轮退出码为 **0**，58 个任务成功（24 个命中本地缓存），总耗时 7 分 48 秒。完整 Chromium 冒烟 **26 组全部通过**，耗时 412.2 秒；另有 1 组夹具自检通过，耗时 13.4 秒。完整套件中的 `terminal-runtimes` 22 项再次全部通过，前端 92 个测试文件、1,348 条用例通过。最终输出见[完整校验日志](verify-runtimes-green.txt)，保留此前失败记录用于追溯。

本轮没有发布。Python 按当前目录镜像项目文件；Web 服务预览、TCP 中继、原生 pip 全部子命令及任意第三方包兼容性不在本次验收范围。
