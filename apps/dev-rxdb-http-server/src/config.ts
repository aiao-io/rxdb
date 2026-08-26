/**
 * demo 后端的常量与环境读取。
 *
 * @remarks
 * 只有三处允许被环境变量改写：端口、库文件路径、是否暴露 `ETag`。
 * 前两个是 e2e 的刚需（`webServer` 必须用临时目录另起一份库，不能碰开发库），
 * 第三个是 AC#10 / AC#11 那对反例的开关。其余一律写死——demo 的读者要看的是协议怎么实现，
 * 不是又一套配置系统。
 */

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 后端端口。前端 4300、后端 4301，**故意不同源**（AC#9～#12 全靠这一条）。 */
export const DEFAULT_PORT = 4301;

/** 所有协议端点的公共前缀，对应客户端的 `baseUrl = http://127.0.0.1:4301/v1`。 */
export const BASE_PATH = '/v1';

/** 实体 `Recipe` 的资源路径片段，与 `http-protocol.md` 示例同名。 */
export const RECIPES_RESOURCE = 'recipes';

/**
 * 列名白名单。
 *
 * @remarks
 * 与 `db.ts` 的建表语句逐字一致。`RuleGroup` 的 `field` 必须命中这个数组才允许进 SQL——
 * 协议文档说 `field` 是「受信任的列名」，但参考实现面向的是公网上任何一个发 JSON 的客户端，
 * 不能把那句话当成前提。
 */
export const RECIPE_COLUMNS = ['id', 'title', 'status', 'price', 'tag', 'createdAt', 'updatedAt'] as const;

/** 客户端可写的列。`id` / `createdAt` / `updatedAt` 一律由服务端定型（协议第 3 / 4 节的硬要求）。 */
export const RECIPE_WRITABLE_COLUMNS = ['title', 'status', 'price', 'tag'] as const;

/** 种子行数。250 行 + 前端 `pageSize: 50` 才能让翻页真实发生（见故事「默认配置会让 demo 白跑」）。 */
export const SEED_ROW_COUNT = 250;

/**
 * `version()` 的返回值。
 *
 * @remarks
 * 刻意不是任何一个 npm 包的版本号：AC#8 要求页面上显示的是**后端自己报的串**，
 * 一眼能分辨它来自网络而不是前端 bundle 里的常量。
 */
export const BACKEND_VERSION = 'node-sqlite-demo/1.0.0';

/** 前端 auth hook 注入的固定假 token。真实身份认证是另一件事，见故事 Out of Scope。 */
export const DEMO_TOKEN = 'demo-token';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** 开发用库文件。进 `.gitignore`；e2e **不碰**它，另用临时目录（AC#16）。 */
export const DEFAULT_DATABASE_PATH = join(PROJECT_ROOT, '.data', 'demo.sqlite');

const readPositiveInt = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, received '${raw}'`);
  }
  return parsed;
};

/** 端口：`RXDB_HTTP_DEMO_PORT` > {@link DEFAULT_PORT}。 */
export const resolvePort = (env: NodeJS.ProcessEnv = process.env): number =>
  readPositiveInt(env['RXDB_HTTP_DEMO_PORT'], DEFAULT_PORT);

/** 库文件路径：`RXDB_HTTP_DEMO_DB` > {@link DEFAULT_DATABASE_PATH}。 */
export const resolveDatabasePath = (env: NodeJS.ProcessEnv = process.env): string => {
  const raw = env['RXDB_HTTP_DEMO_DB'];
  return raw === undefined || raw === '' ? DEFAULT_DATABASE_PATH : resolve(raw);
};

/**
 * 是否回 `Access-Control-Expose-Headers: ETag`。
 *
 * @remarks
 * demo 默认**开**（AC#11）。设 `RXDB_HTTP_DEMO_EXPOSE_ETAG=0` 关掉，复现 AC#10 那条
 * 「跨源读不到 ETag，条件请求静默失效」的已知症状。运行期也能用 `POST __control/cors` 切换。
 */
export const resolveExposeEtag = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env['RXDB_HTTP_DEMO_EXPOSE_ETAG'] !== '0';

/** `__control` 端点只在非 production 注册——它们显式不属于协议（见故事同名小节）。 */
export const resolveControlEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env['NODE_ENV'] !== 'production';
