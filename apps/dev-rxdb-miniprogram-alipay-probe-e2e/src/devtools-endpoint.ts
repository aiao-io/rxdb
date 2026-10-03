import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** 开发者工具（Electron）启动后把 CDP 端口与 browser 路径写进用户数据目录的这个文件，端口每次随机。 */
const ACTIVE_PORT_FILE = join(homedir(), 'Library', 'Application Support', '小程序开发者工具', 'DevToolsActivePort');

const START_IDE_HINT = [
  '先启动支付宝小程序开发者工具并打开探针产物：',
  '  env -u ELECTRON_RUN_AS_NODE "/Applications/小程序开发者工具.app/Contents/MacOS/小程序开发者工具" &',
  '  open "antdevtool-tiny://open?path=<apps/dev-rxdb-miniprogram-alipay-probe/dist 的绝对路径，URL 编码>"',
  '（shell 里带 ELECTRON_RUN_AS_NODE=1 时 IDE 会按 Node 跑；打开项目后点「完 成」与「我信任该文件夹」）',
  '或用 ALIPAY_DEVTOOLS_WS_ENDPOINT 直接给 browser 的 ws 地址（IDE 日志里 `DevTools listening on` 那一行）。'
].join('\n  ');

/**
 * 解析开发者工具的 browser CDP 端点。
 *
 * `ALIPAY_DEVTOOLS_WS_ENDPOINT` 优先；否则读 macOS 用户数据目录里的 `DevToolsActivePort`。
 * `--remote-debugging-port` 被 IDE 忽略、`/json/*` HTTP 发现被 Host 头校验拦，只能这样拿。
 * Windows 版的用户数据目录没有实测过，不猜路径，要求显式给环境变量。
 */
export function resolveWsEndpoint(): string {
  const override = process.env['ALIPAY_DEVTOOLS_WS_ENDPOINT'];
  if (override) return override;
  if (process.platform !== 'darwin') {
    throw new Error(
      `${process.platform} 上没有实测过 DevToolsActivePort 的位置，请设置 ALIPAY_DEVTOOLS_WS_ENDPOINT。\n  ${START_IDE_HINT}`
    );
  }
  if (!existsSync(ACTIVE_PORT_FILE)) throw new Error(`没找到 ${ACTIVE_PORT_FILE}。\n  ${START_IDE_HINT}`);
  const [port, browserPath] = readFileSync(ACTIVE_PORT_FILE, 'utf8').trim().split('\n');
  if (!port || !browserPath) throw new Error(`${ACTIVE_PORT_FILE} 内容不是「端口\\n路径」两行。\n  ${START_IDE_HINT}`);
  return `ws://127.0.0.1:${port}${browserPath}`;
}

/** 连不上端点时的提示：`DevToolsActivePort` 会在 IDE 退出后残留，端口已经失效。 */
export const STALE_ENDPOINT_HINT = `连不上开发者工具的 CDP 端点（IDE 退出后 DevToolsActivePort 会残留旧端口）。\n  ${START_IDE_HINT}`;
