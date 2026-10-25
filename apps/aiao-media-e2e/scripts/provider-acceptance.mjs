import { chromium, expect, request as playwrightRequest } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, open, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  imageGenerationRequest,
  isMiniMaxImageProvider
} from '../../aiao-media/src/contracts/image-provider-protocol.ts';
import { prompt, provider, verifyImageDownload } from '../src/local-first.helpers.ts';
import { installFetchCapture } from './provider-fetch-capture.mjs';

const ratios = [
  { aspect: 'square', label: '正方形', size: '1024x1024' },
  { aspect: 'landscape', label: '横向', size: '1536x1024' },
  { aspect: 'portrait', label: '纵向', size: '1024x1536' }
];
const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const requireCheck = (condition, code) => {
  if (!condition) throw new Error(code);
};

export function acceptanceSelection(env) {
  const parse = (value, allowed) => {
    const selected = value === undefined ? allowed : value.split(',').map(item => item.trim());
    requireCheck(selected.length > 0 && selected.every(item => allowed.includes(item)), 'INVALID_ACCEPTANCE_SELECTION');
    requireCheck(new Set(selected).size === selected.length, 'INVALID_ACCEPTANCE_SELECTION');
    return selected;
  };
  return {
    modes: parse(env.AIAO_MEDIA_ACCEPTANCE_MODES, ['direct', 'proxy']),
    aspects: parse(
      env.AIAO_MEDIA_ACCEPTANCE_ASPECTS,
      ratios.map(ratio => ratio.aspect)
    )
  };
}

export function acceptancePlan(selection) {
  return selection.modes.flatMap(mode =>
    ratios.filter(ratio => selection.aspects.includes(ratio.aspect)).map(ratio => ({ mode, ratio }))
  );
}

export function failureCode(error) {
  const codes = new Map([
    ['BUILD_MANIFEST_UNAVAILABLE', 'BUILD_MANIFEST_UNAVAILABLE'],
    ['DEPLOYED_MANIFEST_MISMATCH', 'DEPLOYED_MANIFEST_MISMATCH'],
    ['PREVIOUS_ATTEMPT_REQUIRES_REVIEW', 'PREVIOUS_ATTEMPT_REQUIRES_REVIEW'],
    ['GENERATION_REJECTED_OR_UNCERTAIN', 'GENERATION_REJECTED_OR_UNCERTAIN'],
    ['ORIGINAL_RESULT_UNAVAILABLE', 'ORIGINAL_RESULT_UNAVAILABLE'],
    ['INVALID_RESULT_ORIGIN', 'INVALID_RESULT_ORIGIN'],
    ['RESULT_CREDENTIAL_LEAK', 'RESULT_CREDENTIAL_LEAK'],
    ['RESULT_READ_FAILED', 'RESULT_READ_FAILED'],
    ['CAPTURE_NOT_INSTALLED', 'CAPTURE_NOT_INSTALLED'],
    ['GENERATION_CAPTURE_FAILED', 'GENERATION_CAPTURE_FAILED'],
    ['GENERATION_CAPTURE_TOO_LARGE', 'GENERATION_CAPTURE_TOO_LARGE'],
    ['GENERATION_CAPTURE_TIMEOUT', 'GENERATION_CAPTURE_TIMEOUT'],
    ['GENERATION_JSON_INVALID', 'GENERATION_JSON_INVALID'],
    ['RESULT_HEADERS_READ_FAILED', 'RESULT_HEADERS_READ_FAILED'],
    ['RESULT_CAPTURE_FAILED', 'RESULT_CAPTURE_FAILED'],
    ['RESULT_CAPTURE_TOO_LARGE', 'RESULT_CAPTURE_TOO_LARGE'],
    ['RESULT_CAPTURE_TIMEOUT', 'RESULT_CAPTURE_TIMEOUT'],
    ['RESULT_CAPTURE_LIMIT', 'RESULT_CAPTURE_LIMIT'],
    ['RESULT_CAPTURE_DUPLICATE', 'RESULT_CAPTURE_DUPLICATE'],
    ['GENERATION_REQUEST_BOUNDARY', 'GENERATION_REQUEST_BOUNDARY'],
    ['RESULT_SIZE_MISMATCH', 'RESULT_SIZE_MISMATCH']
  ]);
  if (codes.has(error?.message)) return codes.get(error.message);
  if (error?.name === 'TimeoutError') return 'BROWSER_TIMEOUT';
  if (typeof error?.message === 'string' && error.message.includes('expect(')) return 'BROWSER_ASSERTION';
  return 'BROWSER_OPERATION_FAILED';
}

export async function readResultHeaders(request) {
  try {
    return await request.allHeaders();
  } catch {
    throw new Error('RESULT_HEADERS_READ_FAILED');
  }
}

async function receivedBytes(page, kind, url = '') {
  requireCheck(await page.evaluate(() => Boolean(globalThis.__AIAO_ACCEPTANCE_CAPTURE__)), 'CAPTURE_NOT_INSTALLED');
  await page.waitForFunction(
    ({ kind, url }) => {
      const state = globalThis.__AIAO_ACCEPTANCE_CAPTURE__;
      const record = kind === 'generation' ? state.generation : state.results.get(url);
      return (
        record?.phase === 'settled' ||
        (kind === 'result' && (state.duplicateResults.has(url) || (!record && state.resultLimitReached)))
      );
    },
    { kind, url },
    { timeout: 210000 }
  );
  const result = await page.evaluate(
    ({ kind, url }) => {
      const state = globalThis.__AIAO_ACCEPTANCE_CAPTURE__;
      const record = kind === 'generation' ? state.generation : state.results.get(url);
      if (kind === 'result' && state.duplicateResults.has(url)) return { ok: false, code: 'RESULT_CAPTURE_DUPLICATE' };
      if (!record) return { ok: false, code: 'RESULT_CAPTURE_LIMIT' };
      return { ok: record.ok, base64: record.base64, code: record.code };
    },
    { kind, url }
  );
  const code = failureCode(new Error(result.code));
  requireCheck(result.ok, code);
  return Buffer.from(result.base64, 'base64');
}

export function assertionCode(error) {
  const matchers = new Map([
    ['toBeVisible', 'ELEMENT_VISIBLE'],
    ['toContainText', 'TEXT_CONTENT'],
    ['toEqual', 'EXACT_BYTES'],
    ['toBe', 'EXPECTED_VALUE']
  ]);
  return matchers.get(error?.matcherResult?.name) ?? 'NONE';
}

export function liveSettings(env) {
  requireCheck(env.AIAO_MEDIA_ACCEPTANCE_GENERATE === '1', 'LIVE_OPT_IN_REQUIRED');
  requireCheck(!env.DEBUG && !env.PWDEBUG, 'BROWSER_DEBUG_LOGGING_MUST_BE_DISABLED');
  requireCheck(env.AIAO_MEDIA_ACCEPTANCE_ORIGIN === 'https://media.aiao.io', 'FORMAL_ORIGIN_REQUIRED');
  requireCheck(
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(env.AIAO_MEDIA_ACCEPTANCE_RELEASE ?? ''),
    'DEPLOYED_VERSION_ID_REQUIRED'
  );
  requireCheck(
    /^[a-f0-9]{64}$/.test(env.AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256 ?? ''),
    'REVIEWED_MANIFEST_DIGEST_REQUIRED'
  );
  const base = new URL(env.AIAO_IMAGE_BASE_URL);
  requireCheck(
    base.protocol === 'https:' && !base.username && !base.password && !base.search && !base.hash,
    'INVALID_PROVIDER'
  );
  requireCheck(/^[a-zA-Z0-9._:-]{1,128}$/.test(env.AIAO_IMAGE_MODEL ?? ''), 'INVALID_MODEL');
  requireCheck(
    imageGenerationRequest(base.href.replace(/\/+$/, ''), {
      model: env.AIAO_IMAGE_MODEL,
      prompt: '',
      size: '1024x1024'
    }),
    'INVALID_MODEL'
  );
  requireCheck(/^[\x21-\x7e]{1,4096}$/.test(env.AIAO_IMAGE_API_KEY ?? ''), 'INVALID_KEY');
  return {
    selection: acceptanceSelection(env),
    origin: env.AIAO_MEDIA_ACCEPTANCE_ORIGIN,
    release: env.AIAO_MEDIA_ACCEPTANCE_RELEASE,
    manifestSha256: env.AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256,
    baseUrl: base.href.replace(/\/+$/, ''),
    model: env.AIAO_IMAGE_MODEL,
    key: env.AIAO_IMAGE_API_KEY,
    fixture: false
  };
}

export function attemptPath(directory, settings, mode, aspect) {
  return resolve(
    directory,
    fingerprint([
      settings.origin,
      settings.release,
      settings.manifestSha256,
      settings.baseUrl,
      settings.model,
      mode,
      aspect
    ]) + '.json'
  );
}

async function verifyManifest(settings) {
  const client = await playwrightRequest.newContext({ baseURL: settings.origin });
  try {
    const response = await client.get('/offline-manifest.json', { maxRedirects: 0, timeout: 30000 });
    requireCheck(response.ok(), 'BUILD_MANIFEST_UNAVAILABLE');
    const bytes = await response.body();
    requireCheck(bytes.length < 1024 * 1024, 'INVALID_BUILD_MANIFEST');
    requireCheck(
      createHash('sha256').update(bytes).digest('hex') === settings.manifestSha256,
      'DEPLOYED_MANIFEST_MISMATCH'
    );
  } finally {
    await client.dispose();
  }
}

async function persist(file, record, exclusive = false) {
  const handle = await open(file, exclusive ? 'wx' : 'r+', 0o600);
  try {
    const data = JSON.stringify(record, null, 2) + '\n';
    await handle.writeFile(data);
    await handle.truncate(Buffer.byteLength(data));
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function claim(file, record) {
  try {
    await persist(file, record, true);
    return null;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const previous = JSON.parse(await readFile(file, 'utf8'));
    requireCheck(previous.phase === 'verified', 'PREVIOUS_ATTEMPT_REQUIRES_REVIEW');
    requireCheck(previous.identity === record.identity, 'PREVIOUS_ATTEMPT_REQUIRES_REVIEW');
    return previous;
  }
}

async function runAttempt(browser, settings, directory, mode, ratio) {
  const file = attemptPath(directory, settings, mode, ratio.aspect);
  const record = {
    identity: fingerprint([
      settings.origin,
      settings.release,
      settings.manifestSha256,
      settings.baseUrl,
      settings.model,
      mode,
      ratio.aspect
    ]),
    checkedAt: new Date().toISOString(),
    origin: settings.origin,
    release: settings.release,
    buildManifestSha256: settings.manifestSha256,
    providerFingerprint: fingerprint([settings.baseUrl, settings.model]),
    fixture: settings.fixture,
    mode,
    aspect: ratio.aspect,
    protocol: isMiniMaxImageProvider(settings.baseUrl) ? 'minimax-native' : 'openai-images',
    request:
      mode === 'direct' && isMiniMaxImageProvider(settings.baseUrl) ?
        {
          width: Number(ratio.size.split('x')[0]),
          height: Number(ratio.size.split('x')[1]),
          n: 1,
          responseFormat: 'url',
          promptOptimizer: false
        }
      : { size: ratio.size, n: 1, quality: 'low', outputFormat: 'png' },
    phase: 'prepared',
    stage: 'prepared',
    generationRequests: 0,
    automaticRetry: false
  };
  const previous = await claim(file, record);
  if (previous) return previous;
  try {
    return await verifyCase(browser, settings, mode, ratio, file, record);
  } catch (error) {
    record.phase = 'requires-review';
    record.failureCode = failureCode(error);
    record.assertionCode = assertionCode(error);
    record.finishedAt = new Date().toISOString();
    await persist(file, record);
  }
  throw new Error(
    `ACCEPTANCE_STOPPED_REVIEW_ATTEMPT_BEFORE_ANOTHER_REQUEST stage=${record.stage} code=${record.failureCode} assertion=${record.assertionCode} mode=${mode} aspect=${ratio.aspect} requests=${record.generationRequests} status=${record.generationStatus ?? 0}`,
    { cause: { code: record.failureCode, assertion: record.assertionCode } }
  );
}

export function generationDispatch(settings, mode, ratio, prompt) {
  const input = { model: settings.model, prompt, size: ratio.size };
  const request = imageGenerationRequest(settings.baseUrl, input);
  requireCheck(request, 'INVALID_MODEL');
  if (mode === 'direct') return request;
  return {
    url: `${settings.origin}/api/relay`,
    body: { model: input.model, prompt, n: 1, size: input.size, quality: 'low', output_format: 'png' }
  };
}

export function generationImageResult(result, baseUrl) {
  if (!isMiniMaxImageProvider(baseUrl)) return result?.data?.length === 1 ? result.data[0] : null;
  requireCheck(result?.base_resp?.status_code === 0, 'GENERATION_REJECTED_OR_UNCERTAIN');
  const urls = result?.data?.image_urls ?? [];
  const base64 = result?.data?.image_base64 ?? [];
  requireCheck(
    Array.isArray(urls) && Array.isArray(base64) && urls.length + base64.length === 1,
    'ORIGINAL_RESULT_UNAVAILABLE'
  );
  return { url: urls[0], b64_json: base64[0] };
}

async function originalBytes(page, response, responses, origin, record, baseUrl) {
  requireCheck(response.ok(), 'GENERATION_REJECTED_OR_UNCERTAIN');
  record.stage = 'generation-capture';
  const body = await receivedBytes(page, 'generation');
  record.stage = 'generation-json';
  let result;
  try {
    result = JSON.parse(body.toString('utf8'));
  } catch {
    throw new Error('GENERATION_JSON_INVALID');
  }
  const item = generationImageResult(result, baseUrl);
  if (typeof item?.b64_json === 'string')
    return { bytes: Buffer.from(item.b64_json, 'base64'), delivery: 'base64', credentialFree: null };
  requireCheck(typeof item?.url === 'string', 'ORIGINAL_RESULT_UNAVAILABLE');
  const url = new URL(item.url);
  requireCheck(url.protocol === 'https:' && !url.username && !url.password, 'INVALID_RESULT_ORIGIN');
  await expect.poll(() => responses.has(url.href), { timeout: 30000 }).toBe(true);
  const image = responses.get(url.href);
  record.stage = 'result-headers';
  const headers = await readResultHeaders(image.request());
  requireCheck(
    ['authorization', 'cookie', 'referer'].every(name => !headers[name]),
    'RESULT_CREDENTIAL_LEAK'
  );
  requireCheck(!image.request().redirectedFrom() && image.ok(), 'RESULT_READ_FAILED');
  record.stage = 'result-capture';
  const bytes = await receivedBytes(page, 'result', url.href);
  return {
    bytes,
    delivery: url.origin === origin ? 'same-origin-url' : 'cross-origin-url',
    credentialFree: true
  };
}

async function verifyCase(browser, settings, mode, ratio, file, record) {
  record.stage = 'browser-context';
  const context = await browser.newContext({
    baseURL: settings.origin,
    acceptDownloads: true,
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 1100 }
  });
  try {
    await settings.setupContext?.(context);
    const text = `桌面正式验收：${mode} ${ratio.aspect} 蓝色森林`;
    const dispatch = generationDispatch(settings, mode, ratio, text);
    const endpoint = dispatch.url;
    await context.addInitScript(installFetchCapture, {
      generationUrl: endpoint,
      pageOrigin: settings.origin,
      generationLimit: 24 * 1024 * 1024,
      resultLimit: 16 * 1024 * 1024,
      timeoutMs: 190000
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const generationEndpoints = [
      `${settings.origin}/api/relay`,
      `${settings.baseUrl}/images/generations`,
      `${settings.baseUrl}/image_generation`
    ];
    const responses = new Map();
    page.on('response', response => responses.set(response.url(), response));
    await context.route('**/*', async route => {
      const request = route.request();
      if (request.method() !== 'POST' || !generationEndpoints.includes(request.url())) return route.fallback();
      record.generationRequests++;
      const headers = await request.allHeaders();
      const body = request.postDataJSON();
      const valid =
        record.generationRequests === 1 &&
        request.url() === endpoint &&
        headers.authorization === `Bearer ${settings.key}` &&
        !headers.cookie &&
        body &&
        Object.keys(body).length === Object.keys(dispatch.body).length &&
        Object.entries(dispatch.body).every(([name, value]) => body[name] === value);
      if (!valid) {
        record.requestBoundaryFailed = true;
        return route.abort('blockedbyclient');
      }
      return route.fallback();
    });
    record.stage = 'provider-setup';
    await provider(page, false, mode, settings);
    record.stage = 'build-manifest';
    const manifest = await page.request.get('/offline-manifest.json');
    requireCheck(manifest.ok(), 'BUILD_MANIFEST_UNAVAILABLE');
    const observedManifestSha256 = createHash('sha256')
      .update(await manifest.body())
      .digest('hex');
    requireCheck(observedManifestSha256 === settings.manifestSha256, 'DEPLOYED_MANIFEST_MISMATCH');
    record.stage = 'draft-setup';
    await prompt(page, text);
    record.stage = 'aspect-selection';
    await page.getByRole('button', { name: ratio.label, exact: true }).click();
    const generated = page.waitForResponse(
      response => response.url() === endpoint && response.request().method() === 'POST',
      { timeout: 210000 }
    );
    generated.catch(() => undefined);
    record.phase = 'dispatching';
    record.stage = 'generation-dispatch';
    await persist(file, record);
    await page.getByRole('button', { name: '✧ 生成图片' }).click();
    record.stage = 'generation-response';
    const response = await generated;
    record.generationStatus = response.status();
    record.stage = 'original-result';
    const original = await originalBytes(page, response, responses, settings.origin, record, settings.baseUrl);
    record.stage = 'local-save';
    await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible({ timeout: 210000 });
    requireCheck(!record.requestBoundaryFailed && record.generationRequests === 1, 'GENERATION_REQUEST_BOUNDARY');
    record.stage = 'library-open';
    await page.goto('/images');
    const card = page.locator('.library-card').filter({ hasText: text });
    record.stage = 'library-initial-image';
    await expect(card.getByAltText('本机生成作品')).toBeVisible();
    record.stage = 'library-reload';
    await page.reload();
    record.stage = 'library-reloaded-image';
    await expect(card.getByAltText('本机生成作品')).toBeVisible();
    record.stage = 'exact-download';
    const sha256 = await verifyImageDownload(page, card, original.bytes);
    record.image = {
      sha256,
      bytes: original.bytes.length,
      width: original.bytes.readUInt32BE(16),
      height: original.bytes.readUInt32BE(20),
      delivery: original.delivery,
      credentialFreeResultRequest: original.credentialFree,
      exactDownloadAfterReload: true
    };
    const [width, height] = ratio.size.split('x').map(Number);
    record.stage = 'result-size';
    requireCheck(record.image.width === width && record.image.height === height, 'RESULT_SIZE_MISMATCH');
    record.phase = 'verified';
    record.stage = 'verified';
    record.finishedAt = new Date().toISOString();
    await persist(file, record);
    return record;
  } finally {
    await context.close();
  }
}

export async function runProviderAcceptance(settings, directory, setupContext) {
  await verifyManifest(settings);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const browser = await chromium.launch({ channel: process.env.AIAO_PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
  const records = [];
  try {
    const cases = acceptancePlan(settings.selection ?? acceptanceSelection({}));
    for (const { mode, ratio } of cases) {
      records.push(await runAttempt(browser, { ...settings, setupContext }, directory, mode, ratio));
      settings.onVerified?.(records.length);
    }
    return records;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let summary;
  try {
    requireCheck(process.env.AIAO_MEDIA_ACCEPTANCE_GENERATE === '1', 'LIVE_OPT_IN_REQUIRED');
    const envFile = resolve(import.meta.dirname, '../../aiao-media/.env');
    if (existsSync(envFile)) process.loadEnvFile(envFile);
    const settings = liveSettings(process.env);
    summary = {
      ...settings.selection,
      planned: acceptancePlan(settings.selection).length,
      verified: 0,
      realProvider: true,
      automaticRetry: false
    };
    console.log(JSON.stringify({ ...summary, phase: 'planned' }));
    const records = await runProviderAcceptance(
      {
        ...settings,
        onVerified: count => {
          summary.verified = count;
        }
      },
      resolve(import.meta.dirname, '../tmp/provider-acceptance/live')
    );
    console.log(JSON.stringify({ ...summary, verified: records.length, phase: 'complete' }));
  } catch (error) {
    if (summary) console.error(JSON.stringify({ ...summary, phase: 'stopped', failureCode: failureCode(error) }));
    console.error(
      '正式供应商验收未完成。检查私有配置与 apps/aiao-media-e2e/tmp/provider-acceptance/live 记录；不会自动重发。'
    );
    process.exitCode = 1;
  }
}
