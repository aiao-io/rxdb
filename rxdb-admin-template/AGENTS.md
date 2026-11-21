# rxdb-admin-template 产品说明

本产品目录位于仓库根 `rxdb-admin-template/`，与仓库的 `apps/`、`packages/`、`requirements/` 同级。它是一个产品边界，由以下 Nx 应用共同组成：

- `rxdb-admin-template-react`
- `rxdb-admin-template-angular`
- `rxdb-admin-template-vue`
- 对应的三端 E2E 应用

三端与对应 E2E 的源码统一位于本产品 `apps/{angular,react,vue,angular-e2e,react-e2e,vue-e2e}/`。产品根只使用仓库现有 Nx workspace，不创建独立 workspace 或锁文件。

产品级需求唯一真相源是本目录的 `requirements/`。三端不能各自复制产品故事、状态总览或路线图；三端独有的实现入口写在同一条产品故事的“实现文件”中。

产品故事使用 `ADMIN-*` 前缀。认证、团队、权限、数据契约、同步、业务流程和三端一致性写在产品级需求；RxDB 核心、适配器和插件能力继续写在仓库根 `requirements/`。

需求门禁统一运行：

```bash
pnpm nx run rxdb-admin-template:requirements-check
pnpm nx run rxdb-admin-template:requirements-test
```

三个应用保留同名兼容目标，目标内容必须继续调用本产品根目录的同一套脚本。涉及三端行为或公共 `packages/*` 能力的变更，必须在同一 PR 中统一评审、验证和合入。

应用 UI 可以依赖产品 domain/contracts 和根平台公共包，不得导入另一个应用的 `src/*`。新增产品私有包应位于本产品 `packages/`，设置 `private: true` 并使用产品作用域；真实复用出现前不提前抽包。前端不得包含服务端 secret，服务端授权不得依赖前端隐藏入口。
