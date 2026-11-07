import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll } from 'vitest';

/**
 * 测试启动期固定的临时目录，与生产路径 `/tmp/aiao-gateway/` 隔离。
 *
 * - 测试 retention 落盘逻辑时 `GATEWAY_TMP_DIR` 指向这里
 * - 整个 vitest run 结束自动清空
 */
const TEST_TMP = join(tmpdir(), 'aiao-gateway-test');

/**
 * ⚠️ 必须在**模块作用域**设置，不能放进 `beforeAll`。
 *
 * `src/db/index.ts` 在**模块加载时**就 `postgres(process.env.DATABASE_URL)`，
 * 而 `beforeAll` 要等到所有 import 完成后才执行——放在里面等于没设。
 * 2026-07-26 实测：把它从 `beforeAll` 挪出来之前，改这一行对覆盖率**毫无影响**，
 * 因为 db 模块早已用宿主 `.env` 的值建好了客户端（specs/027 T031e）。
 *
 * 值指向不可达地址（不是宿主 `.env` 的 `127.0.0.1:54322`——那正是本地 docker
 * Postgres）：夹具本就不该依赖真实库，否则「DB 异常 → 内存 fallback」这类分支
 * 走哪条取决于本机有没有起 docker，覆盖率随环境漂移。
 *
 * 没有任何测试需要真实库：`notifications.test.ts` 走 fallbackStore、
 * `credential-repository.test.ts` 只断言默认驱动不建连接、`sql-routes.test.ts`
 * 注入假 executor。要测真实 DB 路径应另开带显式前置的集成套件。
 */
process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:1/aiao-test-unreachable';

beforeAll(() => {
  rmSync(TEST_TMP, { recursive: true, force: true });
  mkdirSync(TEST_TMP, { recursive: true, mode: 0o700 });
  process.env.GATEWAY_TMP_DIR = TEST_TMP;
  // **强制**指向不可达地址，而不是 `||=` 沿用宿主 `.env`。
  //
  // 原先是 `||= postgresql://...@127.0.0.1:54322/postgres`，注释写「仅作占位」，
  // 但 54322 正是本地 docker Postgres 的端口——栈起着的时候夹具就真连上了库，
  // 于是「DB 异常 → 内存 fallback」这类分支走哪条取决于**环境**：
  // 2026-07-26 实测同一份代码在 DB 可达 / 不可达时覆盖率相差约 1 个百分点，
  // 让覆盖率棘轮无故抖动（specs/027 Phase 5）。
  //
  // 没有任何测试需要真实库：`notifications.test.ts` 走 fallbackStore、
  // `credential-repository.test.ts` 只断言默认驱动不建连接、
  // `sql-routes.test.ts` 显式注入假 executor。要测真实 DB 路径应另开
  // 带显式前置的集成套件，而不是靠「本机恰好起了 docker」。
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:1/aiao-test-unreachable';
  // 宿主 apps/api/.env 可能是 local profile：空 JWKS URL + HS256 secret。
  // 单测/夹具自己注入 jwksUrl 或 jwtSecret；空串不能用 ??= 覆盖。
  if (!process.env.SUPABASE_JWT_ISSUER_URL?.trim()) {
    process.env.SUPABASE_JWT_ISSUER_URL = 'http://localhost:9999/.well-known/jwks.json';
  }
  process.env.SUPABASE_JWT_AUDIENCE ||= 'authenticated';
  // 避免 local HS256 secret 与测试 ES256 JWKS 路径互相干扰（HS256 单测显式传 secret）
  delete process.env.SUPABASE_JWT_SECRET;
  process.env.NODE_ENV = 'test';
  // 防止环境变量中的真实凭证被 Anthropic SDK 自动拾取，污染测试用的 Authorization 头
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
});

afterAll(() => {
  rmSync(TEST_TMP, { recursive: true, force: true });
});
