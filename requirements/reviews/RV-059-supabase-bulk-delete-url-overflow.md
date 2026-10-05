---
id: RV-059
title: Supabase 批量删除把全部 UUID 拼进单条超长 URL
status: Open
severity: P2
created: 2026-10-05
updated: 2026-10-05
baseline: b7edef590051c8842d4914e30e31475977dea6ac
---

# RV-059：Supabase 批量删除把全部 UUID 拼进单条超长 URL

## 问题与影响

**P2，确认，待修。** 在本 checkout 的隔离 CI Supabase 环境中，`removeMany` 删除 80 个 UUID 实体正常；删除 400 个同类实体时，把全部主键拼入一个请求，URL 达 15,656 字符，被实际 Kong 网关拒绝。400 行仍在，调用者收到 `NetworkOfflineError`；随后较小的查询/清理请求仍成功，不是远端真正不可达。

400 是本配置下的实测输入，不是 Supabase 协议保证的统一阈值。本问题是公开非事务批删除原语的规模边界；没有证明数据被删除后丢失，也不把它扩大成示例应用所有 Push 都失败。该应用当前使用 Full 同步 RPC，不等于直接调用此原语。

## 根因

[RxDBAdapterSupabase.ts](../../packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts)：`removeMany`（179–181）按实体类型分组后进入 `executeDelete`（726–754），740 行直接 `.delete().in('id', ids).select('id')`，没有分块。

同包已有 [chunk_values / SUPABASE_IN_CHUNK_SIZE](../../packages/rxdb-adapter-supabase/src/pagination.ts)，但 `findByIds` 使用了它，删除未使用。正常缺失主键校验不会解决 URL 在到达数据库之前已被拒绝的问题。

## 实际复验与反证

[真实 SDK / Chromium / REST 复验](../../packages/rxdb-adapter-supabase/src/__tests__/review-large-rest-writes.spec.ts)：

- 80 行：DELETE URL 3,176 字符，HTTP 200，返回 80 行，剩余 0。
- 400 行：DELETE URL 15,656 字符，浏览器中三次实际 fetch 尝试均表现为 fetch 失败/status 0；剩余 400，红测试保留。
- 同一引擎单次 `saveMany` 1100 行实际保存并返回全部 1100 行。不能凭服务端 max-rows 推断本轮 POST 返回被截断；这个猜测被反证否定。

[原生 HTTP 复验脚本](evidence/2026-10-05/supabase/gateway-length-probe.py) / [实际响应](evidence/2026-10-05/supabase/gateway-length-probe.json) 用随机不存在 UUID、同长度/同格式请求访问原 CI 网关：80 个返回 200，400 个返回 **414 URI too long**。没有凭 browser 的 TypeError 直接猜 HTTP 状态，也没有把原生响应当成浏览器可读取的响应。

[最终聚焦日志](evidence/2026-10-05/supabase/supabase-delivery-focused.txt) / [最终整包日志](evidence/2026-10-05/supabase/supabase-delivery-all-tests.txt)；生产实现未由助手修改，失败测试没有 skip 或删除。

## 修复方向

沿已有非事务契约拆分删除请求，保持分组、重复 ID、缺失/拒绝删除的验证和返回顺序；每块请求及返回集合都必须校验。可复用既有 chunk helper，但仍需验证真实网关的 URL 大小边界，不能再把全部长主键串进单条 URL。不要把分块伪装为跨块事务，也不要吞错返回成功。

回归空批、小批、大批、重复 ID、长字符串 ID、某块失败和真实权限拒绝。浏览器 status 0 的分类不是修改成正则猜 414 的理由，应先消除本地可预防的超长请求。

## 解决记录

- [x] 真实 80/400 行删除与 1100 行 upsert 对照，原生 414 确认。
- [ ] 修复单请求 URL 溢出，保留失败/部分成功边界测试。
