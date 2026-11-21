# 2026-11-16：终端 Bun 与 Python 补验

对应 [ADESK-US-102](../../stories/desktop/ADESK-US-102-local-data-and-real-disk.md)。本轮在本地正式构建上验证，未发布线上。

## 修复

- Python REPL 复用脚本执行会话，恢复当前项目目录、pip 包存储，按 import 加载同源 wheel，并在退出时回写文件。
- Python `input()` 按完整行读取，避免逐键输入时只读到首字符；单测同时覆盖空行、退格、CRLF 和 EOF 前的内容。
- Bun `-e` 注入以项目目录为基准的 `require()`，支持已安装依赖、相对模块和 `require.resolve()`。
- Vivari 仍固定为 1.3.0；worker URL 更新为 `aiao-runtime=4`。pnpm 补丁 SHA-256：`7dc4e9a1ffba237ba1c16191a1de83c1325b8de53570617f607b74931fc7fc71`。

## 浏览器验收

[最终报告](terminal-support.json)：Chromium，全新浏览器上下文，外网阻断，三组全部通过，共 58 项检查，无页面错误，总耗时 72.5 秒。

- `terminal-runtimes`：30 项。新增 Python REPL 的项目目录、pip 包与 NumPy import、退出后文件回写和终端逐键输入；Bun 的 TS 文件与参数、共享桌面文件、package.json 的 pre / post 脚本、退出码与 REPL。
- `terminal-packages`：11 项。新增 bunx 入口、固定 registry 上的 Bun 安装与执行；原 npm / pnpm / Yarn / Corepack 检查继续通过。
- `disk-terminal`：17 项。共享磁盘与原有 shell 交互继续通过。

[Python 修复前](python-before.json)记录 REPL 包导入、文件回写与 `input()` 三项失败；[Bun 修复前](bun-before.json)记录安装成功后 `bun -e` 的 `require is not defined`，以及 Python 修复后的全部运行时检查通过。

## 脚本与质量门禁

[运行时测试日志](runtime-tests.txt)：20 条测试全部通过。覆盖率只统计资源脚本 `prepare.mjs` 与 `runtimes.mjs`：行 100%、函数 100%、分支 96.34%。SDK 补丁由行为单测与上述浏览器验收覆盖。

[质量门禁日志](quality.txt)：产品与 e2e 的 lint / test 共 10 个任务成功，包含需求校验、发布资源校验、安全与开发脚本测试、冒烟 harness 测试。补充文档后[需求校验](requirements-check.txt)串行复跑通过；首次运行在校验成功后遇到 Nx 本地缓存外键错误，关闭 daemon 并跳过缓存后退出码为 0。未运行完整桌面冒烟或跨浏览器验收。

```bash
NX_NO_CLOUD=true pnpm nx run aiao-desktop:runtime-test:coverage --output-style=static
NX_NO_CLOUD=true pnpm nx run-many --projects=aiao-desktop,aiao-desktop-e2e --targets=lint,test --parallel=1 --output-style=static
NX_NO_CLOUD=true pnpm nx run aiao-desktop-e2e:e2e --group=terminal-runtimes,terminal-packages,disk-terminal --report=/tmp/aiao-terminal-final.json --output-style=static
```

## 同日 PWA 增量

PWA 安装、离线桌面与更新的验收单独记录在 [PWA 验收](pwa.md)，与本页的终端补验分开归档。
