---
id: RV-036
title: Supabase 默认测试环境没有工作树隔离，命中另一个 checkout 的容器
status: Open
created: 2026-10-03
updated: 2026-10-03
severity: P2
baseline: 3b3e449e10c6a587056a2ae947eddfd161834f97
---

# RV-036：Supabase 默认测试环境没有工作树隔离，命中另一个 checkout 的容器

**P2 · 确认问题，待修复**；业务实现未在本轮修改。

## 问题

本机已运行 `supabase-db` 等 CI 容器，其 compose working_dir/config_file 属于另一个 checkout `rxdb_ai_doc/docker`。当前项目的 `test-env` 却使用同一个固定 compose project/container 名称及端口。

## 源码证据与根因

- [adapter project.json 的 test-env](../../packages/rxdb-adapter-supabase/project.json)：`docker compose -f docker-compose.ci.yml up -d && ./init-db.sh`。
- [docker-compose.ci.yml](../../docker/docker-compose.ci.yml)：固定 `name: supabase-ci`、`container_name: supabase-db` 等和 `54331:8000`。
- [init-db.sh](../../docker/init-db.sh)：固定 `docker exec ... supabase-db ...`，即使只给 compose 加 -p，初始化阶段也不能跟着隔离。

不同 checkout 的测试并非独立：原样运行会尝试复用/重建同名实例，并在固定 db 容器初始化 SQL。影响是测试串扰和数据/配置副作用风险；**本轮没有为了证明它而去破坏另一个工作树的数据**。

## 实际环境取证与安全复验

[docker inspect 只读取证与独立环境记录](evidence/2026-10-03/full-run/supabase-environment.json) 保留现有容器 ID/labels。实际 adapter 测试另建唯一 project、唯一容器名和系统分配的空闲端口，手动执行等价初始化，显式排除默认 task dependencies 后通过真实 Nx test；退出后仅清理本次拥有的项目。

[初始化](evidence/2026-10-03/full-run/supabase-setup.log)、[测试](evidence/2026-10-03/full-run/supabase-test.log)、[状态](evidence/2026-10-03/full-run/supabase-status.json)、[清理](evidence/2026-10-03/full-run/supabase-cleanup.log) 都有日志。默认环境没有被执行初始化或 down。

## 修复方案

让 compose project/容器标识、端口、初始化目标与 Vitest URL 同源且可按 checkout/run 区分，最好通过服务名+compose exec 而不是固定 docker exec 容器名。测试不得默认清理已有他人实例；补两个 checkout 并行起环境、独立数据与清理归属的回归。

## 解决记录

- [ ] 保留失败复验/门禁证据并定位最小修法。
- [ ] 修复后复跑关联回归，不用缓存或跳过换绿。
- [ ] 合并后按评审目录清理规则处理；当前仍 Open。
