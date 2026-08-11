---
name: 'coverage-gate'
description: '对指定包跑 vitest 覆盖率并按阈值判定通过/失败：核心包（rxdb / rxdb-{angular,react,vue}）≥ 90%，其他 packages/* ≥ 80%。落实 AGENTS.md「TDD：80%+，核心 90%+」铁律。触发场景：用户说「覆盖率达标了吗」「测一下 coverage」「这个包够 90% 吗」「准备发包前」「补完测试想验证」。'
argument-hint: '包名（如 rxdb-plugin-search）或 all（跑所有 packages/*）。可附 --base=<ref> 配合 affected。'
user-invocable: true
disable-model-invocation: false
---

## User Input

```text
$ARGUMENTS
```

## 覆盖率门禁

### 阈值定义（来源 [AGENTS.md](../../../AGENTS.md)）

| 包类别                | 阈值   | 包列表（动态识别）                               |
| --------------------- | ------ | ------------------------------------------------ |
| 核心包                | 90%    | `rxdb`、`rxdb-angular`、`rxdb-react`、`rxdb-vue` |
| 其他可发布包          | 80%    | `packages/*` 中除核心之外的所有                  |
| `apps/*`、`modules/*` | 不计入 | 仅 lint/test 通过即可                            |

### 执行步骤

1. **解析参数**
   - `<包名>`：单包模式
   - `all`：跑 `packages/*` 全集
   - 不传：默认 `all`，但先打出影响范围让用户确认

2. **跑测试 + 强制写出 json-summary**

   每个包的 vitest 当前**未配** `json-summary` reporter，需要 CLI 临时启用：

   ```bash
   pnpm nx test <pkg> \
     --coverage \
     --coverage.reporter=text \
     --coverage.reporter=json-summary
   ```

   多包：

   ```bash
   pnpm nx run-many -t test \
     --projects=tag:js-lib,tag:angular-lib,tag:react-lib,tag:vue-lib \
     --configuration=coverage \
     --parallel=4
   ```

   结果文件：`coverage/packages/<pkg>/coverage-summary.json`（v8 + json-summary 自动生成）

3. **解析与判定**

   每包读取 `coverage-summary.json`，取 `total` 节点的四项指标：

   ```json
   {
     "total": {
       "lines": { "pct": 92.5 },
       "statements": { "pct": 91.0 },
       "functions": { "pct": 88.3 },
       "branches": { "pct": 85.4 }
     }
   }
   ```

   判定规则：**四项都达标才算 PASS**（不能拿 lines 高来掩盖 branches 低）。

4. **报告格式**

   ```
   包                          | 阈值 | lines  | stmts  | funcs  | branches | 判定
   rxdb                        | 90%  | 92.5%  | 91.0%  | 88.3%  | 85.4%    | 🔴 FAIL (funcs/branches)
   rxdb-angular                | 90%  | 95.1%  | 94.8%  | 93.2%  | 91.0%    | 🟢 PASS
   rxdb-plugin-search          | 80%  | 87.2%  | 86.1%  | 82.5%  | 78.9%    | 🔴 FAIL (branches)
   rxdb-adapter-pglite         | 80%  | 91.0%  | 90.5%  | 89.0%  | 85.0%    | 🟢 PASS
   ```

   汇总：`X / Y 包通过`。

5. **失败时附「未覆盖文件 Top 5」**

   读 `coverage/packages/<pkg>/coverage-final.json`（istanbul 格式），按未覆盖语句数排序，列出最值得补测试的文件 + 行范围：

   ```
   rxdb-plugin-search 未覆盖 Top 5：
   - src/search-handle.ts:142-167  (26 行未覆盖，分支 8/14)
   - src/parser.ts:88-101          (14 行未覆盖)
   ...
   ```

   让用户对症下药，**不要**自动写测试。

### 不要做的事

- **不要**只看 `lines.pct` 一项就判定通过 —— 必须四项同时达标
- **不要**改包里的 vitest config 加 `coverage.thresholds.global` —— 那会把门禁固化到 vitest 失败逻辑里，剥夺手动豁免的灵活度（铁律是约定，不是 vitest 配置）
- **不要**把 `apps/*` 或 `dev-rxdb-*` 计入门禁
- **不要**通过 `--coverage.exclude` 临时绕过未覆盖文件 —— 让数字暴露问题
- **不要**自动补测试代码 —— 列出未覆盖位置、给建议即可，TDD 是用户的活
