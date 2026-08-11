# `@aiao/rxdb-adapter-supabase` 代码评审

## 结论

🔴 不通过。删除操作没有验证受影响行数；RLS 拒绝或目标不存在时可能被当成成功，随后本地状态会与远端分叉。

## 评审基线

- 基线提交：`03a46a5d5992a958c19ae33d5fed15c9c3322021`
- 评审日期：2026-07-14
- 范围：Supabase 适配器、Repository、同步、RLS 校验、查询转换、测试和公开入口；50 个文件，约 13,072 行 TS
- 自动校验：`lint`、`test`、`typecheck`、`build` 全部通过
- 测试现状：26 个 spec/test 文件；含 RLS 严格模式和同步回归测试，但未覆盖 delete 零行结果

## 问题

| ID | 级别 | 位置 | 问题与影响 | 建议 |
| --- | --- | --- | --- | --- |
| SUPABASE-001 | P1 | `src/SupabaseRepository.ts:203` | `delete().eq()` 只检查 `error`，没有请求 representation/count。PostgREST/RLS 常以 0 affected rows 而非错误表示不可见或无匹配行；方法仍返回原 entity，调用方会把远端删除误判为成功并提交本地删除/变更。 | 使用 `.select().single()` 或 `count: 'exact'` 验证恰好删除一行；0 行与多行都抛 `SupabaseDataError`。补充 RLS 拒绝和不存在 id 的回归测试。 |

## 其余观察

- 查询分页在未指定 id 排序时补足稳定排序，避免跨页重复/漏行。
- RLS 自检支持 strict 模式；默认 `warn` 适合开发，但生产接入应显式使用 `failureMode: 'throw'`。
- 规则值对 PostgREST 保留字符做了转义；关系 scope 同时使用 logical namespace 和 entity。

## 验收条件

- 修复后执行 `pnpm nx test rxdb-adapter-supabase`、`pnpm nx typecheck rxdb-adapter-supabase`、`pnpm nx lint rxdb-adapter-supabase`、`pnpm nx build rxdb-adapter-supabase`。
- 所有 CRUD 操作都必须区分“远端成功”“目标不存在”和“RLS 隐藏”。
