# Review：@aiao/rxdb-client-generator 评审

## 结论

🟢 未发现 P0-P2 问题。生成器对实体标识、关系映射、输出路径、manifest、软链和并发输出做了 fail-closed 处理，测试覆盖较完整。

## 检查范围

检查 `core/RxDBClientGenerator.ts`、`core/ts-morph-browser.ts`、`cli/find-files.ts`、`build-client-lib.ts`、repository generator 装载、Vite/CLI 插件和全部 generator/CLI/security spec；核对 bin、exports 和依赖。

## 发现

无。生成器拒绝非法标识、重复实体和 many-to-many 反向关系缺失（`src/core/RxDBClientGenerator.ts:136-176,445-473`）；输出路径做目录逃逸校验并拒绝软链删除（`src/cli/build-client-lib.ts:44-78,129-153`）；空 glob/空实体默认 fail-closed（`src/cli/find-files.ts:31-63`、`build-client-lib.ts:204-228`）。

## 风险/未覆盖

未覆盖 Windows 大小写/权限、磁盘满导致逐个 rename 中断、恶意 ts-morph 输入的资源上限；已有测试覆盖路径逃逸、软链与原子输出。

## 验证

已检查源码与测试入口；本机执行 Nx 任务时在插件加载阶段失败（Node v22.14.0 不满足仓库要求的 Node >=26，详见 core-plan.md），因此未将测试写成已通过。建议在 Node 26+ 环境按建议任务复跑。
