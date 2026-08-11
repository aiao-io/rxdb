---
name: 'tri-framework-check'
description: '校验某个 RxDB 插件的 Angular/React/Vue 三端 API 是否对称。用于落实「三框架对称」铁律：单端缺失 = 未完成。触发场景：用户提到「三端对称」「Angular React Vue 是否一致」「这个插件三端都齐了吗」「检查 cross-framework API」，或在新功能落地前/PR review 时主动调用。'
argument-hint: '包名前缀，如 rxdb-plugin-search 或 code-editor。留空则扫描所有已知三端组。'
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

## 三框架 API 对称性检查

**铁律来源**：[AGENTS.md](../../../AGENTS.md) — 「跨框架：Angular/React/Vue 同功能同 API；单框架实现 = 未完成」。

### 已知三端组

通过 nx tag 识别：核心包 + `-angular` (`tag:angular-lib`) / `-react` (`tag:react-lib`) / `-vue` (`tag:vue-lib`)。

当前仓库已知组（执行时复核 `packages/` 目录确认）：

- `code-editor` → code-editor-{angular,react,vue}
- `rxdb` → rxdb-{angular,react,vue}
- `rxdb-plugin-search` → rxdb-plugin-search-{angular,react,vue}

### 执行步骤

1. **确定目标组**
   - 有参数：把 `$ARGUMENTS` 当作前缀，验证 `packages/<prefix>-{angular,react,vue}` 是否存在；缺哪个直接报「单端缺失」并退出
   - 无参数：用 `ls packages/ | grep -E '^<...>-(angular|react|vue)$'` 扫描，按前缀分组

2. **提取每端公开 API**

   ```bash
   cat packages/<prefix>-angular/src/index.ts
   cat packages/<prefix>-react/src/index.ts
   cat packages/<prefix>-vue/src/index.ts
   ```

   关注 `export` 与 `export type` 行；忽略 `'use client'` 等运行时指令、`@packageDocumentation` 注释。

3. **对齐与归一**

   把每个导出归类为：
   - **类型导出**（`export type` / `export interface`）—— 应严格对称（同名同结构）
   - **运行时 API**：
     - Angular 端：约定 `inject<X>()` + `Inject<X>Return` 类型
     - React 端：约定 `use<X>()` + `Use<X>Return` 类型
     - Vue 端：约定 `use<X>()` + `Use<X>Return` 类型
   - **共享类型再导出**（从核心包透传，如 `SearchOptions` / `SearchResult` / `SearchHandle`）—— 三端都应透传同一组

4. **对比并报告**

   输出表格：

   ```
   导出名                  | Angular | React | Vue | 备注
   SearchOptions           | ✅       | ✅    | ✅  | 类型透传一致
   SearchResult            | ✅       | ✅    | ❌  | Vue 端缺失（src/index.ts 未导出）
   injectSearch            | ✅       | -     | -   | Angular 专属（对称：useSearch）
   useSearch               | -       | ✅    | ✅  | Hook/composable
   ```

5. **判定**
   - 🟢 完全对称：所有共享类型透传齐全 + 各端有命名约定一致的运行时入口
   - 🟡 凑合：透传齐全但某端运行时入口命名不一致（如 React 是 `searchHook` 而非 `useSearch`）
   - 🔴 不通过：任一端缺失共享类型或运行时入口

6. **报告时附上修复建议**
   - 缺失类型：建议在缺失端 `src/index.ts` 加 `export type { X } from '@aiao/<core>'`
   - 命名不一致：指出哪个端违反约定，建议改名
   - 实现缺失：建议参考已有端的 spec 文件（如 `inject-search.spec.ts` ↔ `use-search.spec.ts`）补齐

### 不要做的事

- **不要**自动改代码，只报告 + 建议
- **不要**仅看文件名就断言「对称」—— 必须比对 `src/index.ts` 实际导出
- **不要**忽略 `export type` 与 `export` 的区别（前者编译期擦除，后者保留）
- **不要**误报：Angular 端用 `inject*`、React/Vue 用 `use*` 是设计选择，不是不对称
