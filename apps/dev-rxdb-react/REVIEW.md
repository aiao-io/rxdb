# `dev-rxdb-react` 代码评审

## 结论

🟡 凑合。未发现阻断发布的数据破坏问题，但加密页会泄漏 RxJS 订阅，分支选择器又会显示过期状态。两个问题都来自 React 生命周期契约没处理干净。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：`apps/dev-rxdb-react` 下源码、路由、测试和 Nx 配置；112 个文件
- 自动校验：此次仅进行只读代码审查，未单独运行本项目的 `lint`、`test`、`typecheck`、`build`，不能据此判定通过
- 测试现状：16 个 spec/test 文件；缺少异步 effect 卸载和外部分支状态变化测试

## 问题

| ID | 级别 | 位置 | 问题与影响 | 建议 |
| --- | --- | --- | --- | --- |
| REACT-001 | P2 | `src/app/pages/encrypted.tsx:38` | `lockChange$` 的 `unsubscribe()` 被返回给 `Promise.then()` 回调。Promise 会忽略回调返回值，React effect 只执行外层 cleanup，因此适配器已经解析后创建的订阅永远不会注销。反复挂载页面会积累订阅和闭包。 | 在 effect 作用域保存订阅引用，并由 React cleanup 同时设置 cancelled 和执行 `unsubscribe()`；为“解析前卸载”和“订阅后卸载”两个竞态补测试。 |
| REACT-002 | P2 | `src/app/components/AppBranchManager.tsx:57` | `<select>` 使用 `defaultValue={activeBranch}`，只在首次挂载读取值。切换分支或外部状态更新后，真实 active branch 已变化，选择框仍可能显示旧值，用户会在错误上下文继续操作。 | 改为受控组件 `value={activeBranch}`；切换失败时保持原值并展示错误，切换成功后由唯一的分支状态源驱动 UI。 |

## 其余观察 / 测试缺口

- `cancelled` 标记阻止了卸载后的 state update，但没有释放订阅；“不报 React 警告”不等于没有资源泄漏。
- 分支切换目前只处理 loading，错误只写入 console，用户无法知道选择为何回退或失败。
- 现有测试没有统计订阅者数量，也没有验证 active branch 在异步切换后的选择框值。

## 验收条件

- 加密页卸载后 `lockChange$` 订阅必须注销，适配器 Promise 在卸载前后 settle 都不得泄漏或更新已卸载组件。
- 分支选择器改为受控状态，并覆盖成功切换、失败回滚、外部 active branch 更新测试。
- 修复后执行 `pnpm nx lint dev-rxdb-react`、`pnpm nx test dev-rxdb-react`、`pnpm nx typecheck dev-rxdb-react`、`pnpm nx build dev-rxdb-react`。
