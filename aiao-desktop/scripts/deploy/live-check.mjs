// 发布后的线上对账：把线上返回的每个文件与本地构建产物逐字节比较，并确认每个响应都带跨源隔离响应头。
// Pages 对不存在的路径会回 index.html 且状态码 200，所以只看状态码会假绿，必须比内容。
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Pages 自己消费、不会作为站点内容返回的配置文件。 */
const SERVER_ONLY = new Set(['_headers', '_redirects']);

/**
 * 产物里的文件对应的线上路径：`index.html` 是站点根（Pages 会把 `/index.html` 308 到 `/`），其余原样。
 *
 * @param file 产物内的相对路径（`/` 分隔）
 */
export function publicPath(file) {
  return file === 'index.html' ? '/' : `/${file.split('/').map(encodeURIComponent).join('/')}`;
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function describeError(error) {
  const cause = error.cause?.code ?? error.cause?.message;
  return cause ? `${error.message}（${cause}）` : error.message;
}

/**
 * 等一个线上地址连得上（拿到任何 HTTP 应答，哪怕是 404）。新建的 Pages 项目，`*.<项目>.pages.dev` 的证书要几分钟
 * 才签发，这段时间里部署地址与分支别名都是 TLS 握手失败；生产地址 `<项目>.pages.dev` 不受影响。
 *
 * @param options.baseUrl 要等的地址
 * @param options.timeoutMs 最长等待时间，超时抛错
 * @param options.intervalMs 两次尝试之间的间隔
 * @param options.onWait 第一次连不上时回调一次，参数是原因，供调用方告诉用户在等什么
 * @throws 超过时限仍连不上，信息带地址与最后一次的原因
 */
export async function waitUntilReachable({
  baseUrl,
  fetchImpl = fetch,
  timeoutMs = 180_000,
  intervalMs = 5000,
  requestTimeoutMs = 15_000,
  onWait
}) {
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 0; ; attempt += 1) {
    let reason;
    try {
      const init = { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(requestTimeoutMs) };
      await (await fetchImpl(baseUrl, init)).body?.cancel();
      return;
    } catch (error) {
      reason = describeError(error);
    }
    if (attempt === 0) onWait?.(reason);
    if (Date.now() + intervalMs > deadline) {
      throw new Error(`${baseUrl} 在 ${Math.round(timeoutMs / 1000)} 秒内一直连不上：${reason}`);
    }
    await pause(intervalMs);
  }
}

/**
 * 请求一次，网络错误与 5xx 重试；4xx 与重定向是确定的结果，不重试。
 * 用尽重试后，5xx 照实返回响应，网络错误返回 `error`。
 */
async function fetchWithRetry(url, { fetchImpl, retries, retryDelayMs, timeoutMs }) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const init = { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) };
      const response = await fetchImpl(url, init);
      if (response.status < 500 || attempt >= retries) {
        return { response, body: Buffer.from(await response.arrayBuffer()) };
      }
      await response.body?.cancel();
    } catch (error) {
      if (attempt >= retries) return { error };
    }
    await pause(retryDelayMs * (attempt + 1));
  }
}

/** 返回第一个不符合预期的原因；全部符合返回 `undefined`。 */
function mismatch({ response, body }, local, requiredHeaders) {
  if (response.status !== 200) return `状态码 ${response.status}，期望 200（不应重定向或出错）`;
  for (const [name, expected] of Object.entries(requiredHeaders)) {
    const actual = response.headers.get(name);
    if (actual === null) return `响应头 ${name} 缺少（期望 ${expected}）`;
    if (actual !== expected) return `响应头 ${name} 是 ${actual}，期望 ${expected}`;
  }
  if (!body.equals(local)) {
    return `内容与构建产物不一致（线上 ${body.length} 字节 sha256 ${sha256(body).slice(0, 12)}，本地 ${local.length} 字节 ${sha256(local).slice(0, 12)}）`;
  }
  return undefined;
}

async function verifyFile(file, options) {
  const url = new URL(publicPath(file.path), options.baseUrl).href;
  const fetched = await fetchWithRetry(url, options);
  if (fetched.error) return `请求失败：${describeError(fetched.error)}`;
  const local = await readFile(path.join(options.distDir, file.path));
  return mismatch(fetched, local, options.requiredHeaders);
}

/** 最多 `limit` 个任务并行，逐个取队列里的下一项。 */
async function forEachLimited(items, limit, task) {
  const queue = [...items];
  const worker = async () => {
    for (let item = queue.shift(); item; item = queue.shift()) await task(item);
  };
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker));
}

/**
 * 逐个文件核对线上站点。
 *
 * @param options.distDir 本地构建产物目录
 * @param options.files 要核对的文件（`listDistFiles` 的元素）；`_headers`、`_redirects` 不是站点内容，自动跳过
 * @param options.baseUrl 线上站点的来源，如 `https://aiao-desktop.pages.dev`
 * @param options.requiredHeaders 每个响应都必须带的响应头与取值
 * @param options.fetchImpl 测试用的 fetch 替身
 * @param options.retries 网络错误与 5xx 的重试次数
 * @param options.retryDelayMs 重试间隔的基数（第 n 次重试等 n 倍）
 * @param options.concurrency 并行请求数
 * @param options.timeoutMs 单次请求（含读完响应体）的时限
 * @returns 核对的文件数与失败清单（按路径排序）
 */
export async function checkLive({
  distDir,
  files,
  baseUrl,
  requiredHeaders,
  fetchImpl = fetch,
  retries = 3,
  retryDelayMs = 1000,
  concurrency = 6,
  timeoutMs = 120_000
}) {
  const targets = files.filter(file => !SERVER_ONLY.has(file.path));
  const failures = [];
  const options = { distDir, baseUrl, requiredHeaders, fetchImpl, retries, retryDelayMs, timeoutMs };
  await forEachLimited(targets, concurrency, async file => {
    const reason = await verifyFile(file, options);
    if (reason) failures.push({ path: file.path, reason });
  });
  failures.sort((a, b) => (a.path < b.path ? -1 : 1));
  return { checked: targets.length, failures };
}
