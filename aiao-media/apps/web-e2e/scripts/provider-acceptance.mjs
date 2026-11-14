import { imageMetadata, openRelayResult, relayResultKey, validatePlatformModels } from '@aiao-media/api-contracts';
import { chromium, expect, request as playwrightRequest } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, open, readFile, readdir, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prompt, verifyImageDownload } from '../src/local-first.helpers.ts';
import { installFetchCapture } from './provider-fetch-capture.mjs';
import { observeResultNetwork, resultNetworkFailure } from './provider-result-network.mjs';

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
    modes: parse(env.AIAO_MEDIA_ACCEPTANCE_MODES, ['platform']),
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
    ['RELAY_RESULT_UNREADABLE', 'RELAY_RESULT_UNREADABLE'],
    ['INVALID_RESULT_ORIGIN', 'INVALID_RESULT_ORIGIN'],
    ['RESULT_CREDENTIAL_LEAK', 'RESULT_CREDENTIAL_LEAK'],
    ['RESULT_READ_FAILED', 'RESULT_READ_FAILED'],
    ['GENERATION_FETCH_FAILED', 'GENERATION_FETCH_FAILED'],
    ['RESULT_FETCH_FAILED', 'RESULT_FETCH_FAILED'],
    ['RESULT_CORS_BLOCKED', 'RESULT_CORS_BLOCKED'],
    ['RESULT_CSP_BLOCKED', 'RESULT_CSP_BLOCKED'],
    ['RESULT_REQUEST_FAILED', 'RESULT_REQUEST_FAILED'],
    ['RESULT_REQUEST_ABORTED', 'RESULT_REQUEST_ABORTED'],
    ['RESULT_REDIRECT_BLOCKED', 'RESULT_REDIRECT_BLOCKED'],
    ['RESULT_RESPONSE_TIMEOUT', 'RESULT_RESPONSE_TIMEOUT'],
    ['RESULT_REQUEST_NOT_OBSERVED', 'RESULT_REQUEST_NOT_OBSERVED'],
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
    ['RESULT_SIZE_MISMATCH', 'RESULT_SIZE_MISMATCH'],
    ...[
      'PLATFORM_MODEL_UNAVAILABLE',
      'PLATFORM_CREDITS_UNAVAILABLE',
      'PLATFORM_CREDIT_MISMATCH',
      'PLATFORM_LOGIN_REQUIRED'
    ].map(code => [code, code])
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
  requireCheck(/^[a-zA-Z0-9._-]{1,80}$/.test(env.AIAO_MEDIA_ACCEPTANCE_MODEL_ID ?? ''), 'INVALID_MODEL');
  requireCheck(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.AIAO_MEDIA_ACCEPTANCE_EMAIL ?? ''), 'PLATFORM_LOGIN_REQUIRED');
  requireCheck(
    typeof env.AIAO_MEDIA_ACCEPTANCE_PASSWORD === 'string' && env.AIAO_MEDIA_ACCEPTANCE_PASSWORD.length > 0,
    'PLATFORM_LOGIN_REQUIRED'
  );
  return {
    selection: acceptanceSelection(env),
    origin: env.AIAO_MEDIA_ACCEPTANCE_ORIGIN,
    release: env.AIAO_MEDIA_ACCEPTANCE_RELEASE,
    manifestSha256: env.AIAO_MEDIA_ACCEPTANCE_MANIFEST_SHA256,
    model: env.AIAO_MEDIA_ACCEPTANCE_MODEL_ID,
    email: env.AIAO_MEDIA_ACCEPTANCE_EMAIL,
    password: env.AIAO_MEDIA_ACCEPTANCE_PASSWORD,
    fixture: false
  };
}

export function attemptPath(directory, settings, mode, aspect) {
  return resolve(
    directory,
    fingerprint([settings.origin, settings.release, settings.manifestSha256, settings.model, mode, aspect]) + '.json'
  );
}

export async function checkAttemptHistory(settings, directory) {
  const history = new Map();
  for (const name of await readdir(directory)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    let record;
    try {
      record = JSON.parse(await readFile(resolve(directory, name), 'utf8'));
    } catch {
      throw new Error('PREVIOUS_ATTEMPT_REQUIRES_REVIEW');
    }
    requireCheck(record && typeof record === 'object' && !Array.isArray(record), 'PREVIOUS_ATTEMPT_REQUIRES_REVIEW');
    history.set(resolve(directory, name), record);
  }
  const modelFingerprint = fingerprint(['platform', settings.model]);
  for (const { mode, ratio } of acceptancePlan(settings.selection ?? acceptanceSelection({}))) {
    const file = attemptPath(directory, settings, mode, ratio.aspect);
    const current = history.get(file);
    if (current) {
      requireCheck(
        current.phase === 'verified' && file === resolve(directory, current.identity + '.json'),
        'PREVIOUS_ATTEMPT_REQUIRES_REVIEW'
      );
      continue;
    }
    const unresolved = [...history.values()].some(
      record =>
        record.phase !== 'verified' &&
        record.origin === settings.origin &&
        record.modelFingerprint === modelFingerprint &&
        record.mode === mode &&
        record.aspect === ratio.aspect
    );
    requireCheck(!unresolved, 'PREVIOUS_ATTEMPT_REQUIRES_REVIEW');
  }
}

export async function withAcceptanceRunLock(directory, operation) {
  const file = resolve(directory, '.acceptance-run.lock');
  const owner = JSON.stringify({ id: randomUUID(), pid: process.pid, startedAt: new Date().toISOString() });
  let handle;
  try {
    handle = await open(file, 'wx', 0o600);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('PREVIOUS_ATTEMPT_REQUIRES_REVIEW', { cause: error });
    throw error;
  }
  try {
    await handle.writeFile(owner);
    await handle.sync();
    return await operation();
  } finally {
    await handle.close();
    await releaseAcceptanceRunLock(file, owner);
  }
}

async function releaseAcceptanceRunLock(file, owner) {
  let current;
  try {
    current = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (current === owner) await unlink(file);
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
      settings.model,
      mode,
      ratio.aspect
    ]),
    checkedAt: new Date().toISOString(),
    origin: settings.origin,
    release: settings.release,
    buildManifestSha256: settings.manifestSha256,
    modelFingerprint: fingerprint(['platform', settings.model]),
    fixture: settings.fixture,
    mode,
    aspect: ratio.aspect,
    request: { size: ratio.size, n: 1 },
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
  requireCheck(mode === 'platform', 'INVALID_ACCEPTANCE_SELECTION');
  return {
    url: `${settings.origin}/api/relay/tasks/`,
    method: 'PUT',
    body: { model: settings.model, prompt, n: 1, size: ratio.size }
  };
}

export function generationImageResult(result, protocol) {
  if (protocol === 'openai') return result?.data?.length === 1 ? result.data[0] : null;
  requireCheck(result?.base_resp?.status_code === 0, 'GENERATION_REJECTED_OR_UNCERTAIN');
  const urls = result?.data?.image_urls ?? [];
  const base64 = result?.data?.image_base64 ?? [];
  requireCheck(
    Array.isArray(urls) && Array.isArray(base64) && urls.length + base64.length === 1,
    'ORIGINAL_RESULT_UNAVAILABLE'
  );
  return { url: urls[0], b64_json: base64[0] };
}

export async function resultResponse(url, responses, network, record, timeout = 30000) {
  try {
    await expect.poll(() => responses.has(url) || network(url).phase === 'failed', { timeout }).toBe(true);
  } catch {
    record.resultRequest = network(url);
    throw new Error(
      record.resultRequest.phase === 'not-requested' ? 'RESULT_REQUEST_NOT_OBSERVED' : 'RESULT_RESPONSE_TIMEOUT'
    );
  }
  record.resultRequest = network(url);
  const code = resultNetworkFailure(record.resultRequest);
  requireCheck(!code, code);
  return responses.get(url);
}

async function relayAnswer(sealed, task) {
  try {
    return Buffer.from(
      await openRelayResult(await relayResultKey(task.token, task.id, 'decrypt'), new Uint8Array(sealed))
    );
  } catch {
    throw new Error('RELAY_RESULT_UNREADABLE');
  }
}

async function originalBytes(page, response, responses, network, origin, record, protocol, relayTask) {
  requireCheck(response.ok(), 'GENERATION_REJECTED_OR_UNCERTAIN');
  record.stage = 'generation-capture';
  const captured = await receivedBytes(page, 'generation');
  const body = relayTask ? await relayAnswer(captured, relayTask) : captured;
  record.stage = 'generation-json';
  let result;
  try {
    result = JSON.parse(body.toString('utf8'));
  } catch {
    throw new Error('GENERATION_JSON_INVALID');
  }
  const requestId = result?.id;
  if (typeof requestId === 'string' && /^[a-zA-Z0-9_.:-]{1,160}$/.test(requestId)) record.providerRequestId = requestId;
  const businessCode = result?.base_resp?.status_code;
  if (Number.isSafeInteger(businessCode)) record.providerBusinessCode = businessCode;
  const item = generationImageResult(result, protocol);
  if (typeof item?.b64_json === 'string')
    return { bytes: Buffer.from(item.b64_json, 'base64'), delivery: 'base64', credentialFree: null };
  requireCheck(typeof item?.url === 'string', 'ORIGINAL_RESULT_UNAVAILABLE');
  const url = new URL(item.url);
  requireCheck(url.protocol === 'https:' && !url.username && !url.password, 'INVALID_RESULT_ORIGIN');
  record.stage = 'result-response';
  const image = await resultResponse(url.href, responses, network, record);
  record.stage = 'result-headers';
  const headers = await readResultHeaders(image.request());
  requireCheck(
    ['authorization', 'cookie', 'referer'].every(name => !headers[name]),
    'RESULT_CREDENTIAL_LEAK'
  );
  requireCheck(!image.request().redirectedFrom() && image.ok(), 'RESULT_READ_FAILED');
  record.stage = 'result-capture';
  const bytes = await receivedBytes(page, 'result', url.href);
  record.resultRequest = network(url.href);
  return {
    bytes,
    delivery: url.origin === origin ? 'same-origin-url' : 'cross-origin-url',
    credentialFree: true
  };
}

async function platformLogin(page, settings) {
  await page.goto('/providers');
  await page.getByRole('button', { name: /^(登录账号|我的账号)$/ }).click();
  const dialog = page.getByRole('dialog', { name: '我的账号' });
  await expect(dialog.getByRole('heading', { name: /^(登录账号|已登录)$/ })).toBeVisible();
  if (await dialog.getByRole('heading', { name: '登录账号', exact: true }).isVisible()) {
    requireCheck(settings.email && settings.password, 'PLATFORM_LOGIN_REQUIRED');
    await dialog.getByLabel('邮箱', { exact: true }).fill(settings.email);
    await dialog.getByLabel('密码', { exact: true }).fill(settings.password);
    await dialog.getByRole('button', { name: '登录', exact: true }).click();
  }
  await expect(dialog.getByRole('heading', { name: '已登录', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '关闭账号窗口' }).click();
  const token = await page.evaluate(() => {
    const url = globalThis.__AIAO_SUPABASE_CONFIG__?.url;
    return JSON.parse(localStorage.getItem(`aiao-media-supabase-session-v1:${encodeURIComponent(url)}`) ?? 'null')
      ?.access_token;
  });
  requireCheck(typeof token === 'string' && token.length > 0, 'PLATFORM_LOGIN_REQUIRED');
  return token;
}
async function platformCredits(page, token) {
  const receipt = await page.evaluate(async token => {
    const response = await fetch('/api/credits', {
      headers: { authorization: `Bearer ${token}` },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });
    return response.ok ? response.json() : null;
  }, token);
  requireCheck(
    Number.isSafeInteger(receipt?.account?.balance) && Array.isArray(receipt.entries),
    'PLATFORM_CREDITS_UNAVAILABLE'
  );
  return receipt;
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
    const text = `平台正式验收：${ratio.aspect} 蓝色森林`;
    const dispatch = generationDispatch(settings, mode, ratio, text),
      endpoint = dispatch.url;
    let relayTask = null,
      sessionToken = '';
    await context.addInitScript(installFetchCapture, {
      generationUrl: endpoint,
      generationResult: { prefix: endpoint, suffix: '/result' },
      pageOrigin: settings.origin,
      generationLimit: 24 * 1024 * 1024,
      resultLimit: 16 * 1024 * 1024,
      timeoutMs: 190000
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const responses = new Map();
    page.on('response', response => responses.set(response.url(), response));
    const session = await context.newCDPSession(page),
      network = observeResultNetwork(session);
    await session.send('Network.enable');
    await session.send('Audits.enable');
    await context.route('**/*', async route => {
      const request = route.request();
      const generation = request.method() === 'PUT' && request.url().startsWith(endpoint);
      const forbidden =
        request.method() === 'POST' &&
        /\/(?:api\/relay|images\/generations|image_generation)$/.test(new URL(request.url()).pathname);
      if (!generation && !forbidden) return route.fallback();
      record.generationRequests++;
      const headers = await request.allHeaders(),
        body = request.postDataJSON();
      const task = { id: request.url().slice(endpoint.length), token: headers['x-relay-task-token'] ?? '' };
      const valid =
        generation &&
        record.generationRequests === 1 &&
        /^[0-9a-f-]{36}$/.test(task.id) &&
        /^[A-Za-z0-9_-]{43}$/.test(task.token) &&
        headers.authorization === `Bearer ${sessionToken}` &&
        !headers.cookie &&
        !headers['x-provider-base'] &&
        body &&
        Object.keys(body).length === Object.keys(dispatch.body).length &&
        Object.entries(dispatch.body).every(([key, value]) => body[key] === value);
      if (!valid) {
        record.requestBoundaryFailed = true;
        return route.abort('blockedbyclient');
      }
      relayTask = task;
      return route.fallback();
    });
    record.stage = 'platform-login';
    sessionToken = await platformLogin(page, settings);
    record.stage = 'model-catalog';
    const catalog = await page.evaluate(async () => {
      const response = await fetch('/api/models', { credentials: 'omit', cache: 'no-store', redirect: 'error' });
      return response.ok ? response.json() : null;
    });
    requireCheck(catalog, 'PLATFORM_MODEL_UNAVAILABLE');
    const model = validatePlatformModels(catalog).find(model => model.id === settings.model);
    requireCheck(model, 'PLATFORM_MODEL_UNAVAILABLE');
    record.protocol = model.protocol;
    const before = await platformCredits(page, sessionToken);
    requireCheck(before.account.available >= model.credits, 'PLATFORM_CREDITS_UNAVAILABLE');
    record.stage = 'build-manifest';
    const manifest = await page.request.get('/offline-manifest.json');
    requireCheck(manifest.ok(), 'BUILD_MANIFEST_UNAVAILABLE');
    requireCheck(
      createHash('sha256')
        .update(await manifest.body())
        .digest('hex') === settings.manifestSha256,
      'DEPLOYED_MANIFEST_MISMATCH'
    );
    record.stage = 'draft-setup';
    await prompt(page, text);
    await page.locator('#selected-model').selectOption(settings.model);
    record.stage = 'aspect-selection';
    await page.getByRole('button', { name: ratio.label, exact: true }).click();
    const generated = page.waitForResponse(
      response => response.request().method() === 'PUT' && response.url().startsWith(endpoint),
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
    const original = await originalBytes(
      page,
      response,
      responses,
      network,
      settings.origin,
      record,
      model.protocol,
      relayTask
    );
    record.stage = 'local-save';
    await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible({ timeout: 210000 });
    requireCheck(!record.requestBoundaryFailed && record.generationRequests === 1, 'GENERATION_REQUEST_BOUNDARY');
    record.stage = 'credit-settlement';
    const after = await platformCredits(page, sessionToken),
      entries = after.entries.filter(entry => entry.source === 'generation' && entry.request_id === relayTask.id);
    requireCheck(
      before.account.balance - after.account.balance === model.credits &&
        entries.length === 1 &&
        entries[0].delta === -model.credits,
      'PLATFORM_CREDIT_MISMATCH'
    );
    record.credits = {
      before: before.account.balance,
      after: after.account.balance,
      cost: model.credits,
      taskId: relayTask.id,
      ledgerEntries: entries.length
    };
    record.stage = 'library-open';
    await page.goto('/images');
    const card = page.locator('.library-card').filter({ hasText: text });
    await expect(card.getByAltText('本机生成作品')).toBeVisible();
    record.stage = 'library-reload';
    await page.reload();
    await expect(card.getByAltText('本机生成作品')).toBeVisible();
    record.stage = 'exact-download';
    const sha256 = await verifyImageDownload(page, card, original.bytes);
    record.image = {
      sha256,
      bytes: original.bytes.length,
      ...imageMetadata(original.bytes),
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
  return withAcceptanceRunLock(directory, () => executeProviderAcceptance(settings, directory, setupContext));
}

async function executeProviderAcceptance(settings, directory, setupContext) {
  await checkAttemptHistory(settings, directory);
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
    const envFile = resolve(import.meta.dirname, '../../web/.env');
    if (existsSync(envFile)) process.loadEnvFile(envFile);
    const settings = liveSettings(process.env);
    summary = {
      ...settings.selection,
      planned: acceptancePlan(settings.selection).length,
      verified: 0,
      realPlatform: true,
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
      '正式平台积分生图验收未完成。检查私有配置与 aiao-media/apps/web-e2e/tmp/provider-acceptance/live 记录；不会自动重发。'
    );
    process.exitCode = 1;
  }
}
