import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * e2e 的端口与库文件。配置与用例共用同一份常量。
 *
 * @remarks
 * 刻意**不用** 4300 / 4301：那两个是开发时手工跑的端口，e2e 与它们撞上会让
 * 「测试跑在一个说不清是哪份产物、哪个库文件的服务上」。8313 / 8314 归 supabase 套件。
 */
export const APP_PORT = 8316;
export const API_PORT = 8317;

/** 前端产物的地址。 */
export const APP_BASE_URL = `http://localhost:${APP_PORT}`;

/**
 * 后端地址。
 *
 * @remarks
 * 与 {@link APP_BASE_URL} **不同源**（端口不同即不同源），AC#9～#12 全靠这一条。
 * 主机名也刻意用 `127.0.0.1` 而不是 `localhost`：两者在浏览器眼里就是不同的源，
 * 这样即便端口相同也仍然跨源，少一个「改端口时不小心变成同源」的陷阱。
 */
export const API_BASE_URL = `http://127.0.0.1:${API_PORT}/v1`;

/**
 * 后端在 e2e 里连的数据目录（pglite `dataDir`，文件落盘）。
 *
 * @remarks
 * 落在系统临时目录，**绝不碰** `apps/dev-rxdb-http-server/.data/`：
 * 那是开发者手工调试用的库，被 e2e 反复 reset 掉是件很难自己想明白的怪事。
 */
export const E2E_DATABASE = join(tmpdir(), 'rxdb-http-e2e', 'pglite');

/** 打开 demo 页面时要带的查询串，把前端指向 e2e 的后端。 */
export const appUrl = (extraQuery: string = ''): string =>
  `${APP_BASE_URL}/?api=${encodeURIComponent(API_BASE_URL)}${extraQuery === '' ? '' : `&${extraQuery}`}`;
