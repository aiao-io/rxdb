# PR #228 评审记录

## 基本信息

- PR：#228
- 分支：`origin/admin-template`
- 评审工作区：`/private/tmp/rxdb-pr-228`
- 评审 HEAD：`9571fbd23a05163f8c2d7fc5851e2661fdd89bba`
- 基线：`origin/main`，提交 `fd8cdfa4aa126a0e883ab7d1d16a33933d0a37ed`
- 评审方式：完整检查 `origin/main...HEAD` 的差异

## 审查范围

覆盖 admin template、collaboration 包、同步权限、表单草稿、历史视图、未保存输入提示，以及 Angular、React、Vue 入口。

## P2：默认协作包测试目标失败

执行标准 Nx 测试入口：

```text
pnpm nx run admin-collaboration:test --skip-nx-cache --output-style=static
```

结果为 55 个测试文件中 54 个通过，687 个测试中 685 个通过。`history-view.spec.ts` 的 2 个测试因 Node 环境没有 `sessionStorage` 失败。`unsaved-input.spec.ts` 还产生了未处理的 `Event.returnValue` 只读属性异常。

`rxdb-admin-template/packages/collaboration/vitest.config.mts:10` 明确使用 Node 环境。`rxdb-admin-template/packages/collaboration/src/client/form-drafts.ts:52-60` 的 `FormDrafts.restore()` 无条件读取 `sessionStorage`，而 `history-view.spec.ts:267-328` 会触发该路径。Node 环境没有这个全局对象，因此用例直接抛出 `ReferenceError: sessionStorage is not defined`。

`rxdb-admin-template/packages/collaboration/src/client/unsaved-input.ts:59-64` 直接写入 `event.returnValue`。`unsaved-input.spec.ts:4-14` 使用 Node 的普通 `Event` 模拟 `beforeunload`，Node 的 `Event.returnValue` 是只读属性，触发未处理的 `TypeError`。

CI 或本地标准 Nx 测试门禁无法通过，新增协作 UI 的焦点、重绘和离开提示回归无法被完整验证。当前失败发生在测试环境与测试替身的组合上，不能据此断言浏览器生产路径同样失败，但它会阻断该包的默认验证入口。

应为浏览器 API 建立明确的测试替身，或把这类 DOM 测试切换到项目支持的浏览器仿真环境。修复后重新运行完整 `admin-collaboration:test`，并确认没有未处理异常。

## P0、P1、P3

未发现可登记问题。

`admin_private.can_read_topic()` 将当前用户与 `collab:<team>:<app>` topic 绑定，未发现跨团队频道复用路径。Angular、React、Vue 入口均依赖同一个 `packages/collaboration` 协作实现，未发现单框架缺失或独立实现漂移。

## 验证

- `pnpm nx run admin-collaboration:typecheck --skip-nx-cache --output-style=static` 通过，包含 23 个依赖任务。
- `pnpm nx run admin-collaboration:test --skip-nx-cache --output-style=static` 失败，具体原因见上述 P2。
- 此前并发运行造成的 `packages/utils/dist` `ENOTEMPTY`、`ENOENT` 和缺少构建产物属于并发构建假失败，本报告未将其作为业务问题。

## 结论

该 PR 有一个 P2 级默认测试门禁问题。权限边界和三端共享调用链未发现可登记的生产越权问题。
