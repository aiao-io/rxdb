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
