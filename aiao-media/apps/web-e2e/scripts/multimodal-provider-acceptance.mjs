import { chromium, expect, request as playwrightRequest } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  acceptancePlan,
  assertSafeAcceptanceRecord,
  attemptPath,
  failureCode,
  liveSettings,
  requireCheck,
  safeProviderRequestId,
  validateVerifiedRecord
} from './multimodal-provider-acceptance-check.mjs';
import { withAcceptanceRunLock } from './provider-acceptance.mjs';

const taskPath = /\/api\/relay\/tasks\/([0-9a-f-]{36})(?:[/?]|$)/i;
const sha256 = value => createHash('sha256').update(value).digest('hex');

function wavFixture() {
  const durationMs = 1000;
  const samples = 32_000;
  const dataBytes = samples * 2;
  const bytes = Buffer.alloc(44 + dataBytes);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8, 'ascii');
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(32_000, 24);
  bytes.writeUInt32LE(64_000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36, 'ascii');
  bytes.writeUInt32LE(dataBytes, 40);
  return { bytes, durationMs };
}

function manifestFor(record, operation) {
  const value = record.manifest;
  requireCheck(value && typeof value === 'object', 'ACCEPTANCE_MANIFEST_MISSING');
  if (operation.id === 'asr') {
    requireCheck(value.kind === 'transcript' && typeof value.text === 'string' && value.text.trim(), 'TRANSCRIPT_RESULT_INVALID');
    requireCheck(typeof value.language === 'string' && /^[a-zA-Z0-9-]{2,20}$/.test(value.language), 'TRANSCRIPT_LANGUAGE_INVALID');
    requireCheck(Number.isSafeInteger(value.characters) && value.characters > 0, 'TRANSCRIPT_RESULT_INVALID');
    requireCheck(/^[a-f0-9]{64}$/.test(value.sha256 ?? ''), 'TRANSCRIPT_RESULT_INVALID');
    return value;
  }
  if (operation.id === 'video') {
    requireCheck(value.kind === 'video' && value.mediaType === 'video/mp4' && value.format === 'mp4', 'VIDEO_MANIFEST_INVALID');
    requireCheck(value.codec === 'h264' && Number.isSafeInteger(value.width) && Number.isSafeInteger(value.height), 'VIDEO_MANIFEST_INVALID');
  } else {
    requireCheck(value.kind === 'audio' && value.mediaType === 'audio/wav' && value.format === 'wav', 'AUDIO_MANIFEST_INVALID');
    requireCheck(value.channels === 1 && value.sampleRate === 32_000, 'AUDIO_MANIFEST_INVALID');
  }
  requireCheck(Number.isSafeInteger(value.bytes) && value.bytes > 0, 'MEDIA_MANIFEST_INVALID');
  requireCheck(Number.isSafeInteger(value.durationMs) && value.durationMs > 0, 'MEDIA_MANIFEST_INVALID');
  requireCheck(/^[a-f0-9]{64}$/.test(value.sha256 ?? ''), 'MEDIA_MANIFEST_INVALID');
  return value;
}

async function verifyManifest(settings) {
  const client = await playwrightRequest.newContext({ baseURL: settings.origin });
  try {
    const response = await client.get('/offline-manifest.json', { maxRedirects: 0, timeout: 30_000 });
    requireCheck(response.ok(), 'BUILD_MANIFEST_UNAVAILABLE');
    const bytes = await response.body();
    requireCheck(bytes.length < 1024 * 1024, 'INVALID_BUILD_MANIFEST');
    requireCheck(sha256(bytes) === settings.manifestSha256, 'DEPLOYED_MANIFEST_MISMATCH');
  } finally {
    await client.dispose();
  }
}

async function persist(file, record, settings) {
  assertSafeAcceptanceRecord(record, settings);
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
}

async function previousAttempts(settings, directory) {
  const history = new Map();
  for (const name of await readdir(directory)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    let record;
    try {
      record = JSON.parse(await readFile(resolve(directory, name), 'utf8'));
    } catch {
      throw new Error('PREVIOUS_ATTEMPT_REQUIRES_REVIEW');
    }
    assertSafeAcceptanceRecord(record, settings);
    history.set(resolve(directory, name), record);
  }
  for (const operation of acceptancePlan()) {
    const file = attemptPath(directory, settings, operation);
    const record = history.get(file);
    if (record) {
      requireCheck(record.phase === 'verified', 'PREVIOUS_ATTEMPT_REQUIRES_REVIEW');
      continue;
    }
    const unresolved = [...history.values()].some(
      value => value.phase !== 'verified' && value.operation === operation.operation
    );
    requireCheck(!unresolved, 'PREVIOUS_ATTEMPT_REQUIRES_REVIEW');
  }
  return history;
}

async function platformLogin(page, settings) {
  await page.goto('/providers');
  await page.getByRole('button', { name: /^(登录账号|我的账号)$/ }).click();
  const dialog = page.getByRole('dialog', { name: '我的账号' });
  await expect(dialog.getByRole('heading', { name: /^(登录账号|已登录)$/ })).toBeVisible();
  if (await dialog.getByRole('heading', { name: '登录账号', exact: true }).isVisible()) {
    await dialog.getByLabel('邮箱', { exact: true }).fill(settings.email);
    await dialog.getByLabel('密码', { exact: true }).fill(settings.password);
    await dialog.getByRole('button', { name: '登录', exact: true }).click();
  }
  await expect(dialog.getByRole('heading', { name: '已登录', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '关闭账号窗口' }).click();
  const token = await page.evaluate(() => {
    const url = globalThis.__AIAO_SUPABASE_CONFIG__?.url;
    return JSON.parse(localStorage.getItem(`aiao-media-supabase-session-v1:${encodeURIComponent(url)}`) ?? 'null')?.access_token;
  });
  requireCheck(typeof token === 'string' && token.length > 0, 'PLATFORM_LOGIN_REQUIRED');
  return token;
}

async function platformCredits(page, token) {
  const receipt = await page.evaluate(async tokenValue => {
    const response = await fetch('/api/credits', {
      headers: { authorization: `Bearer ${tokenValue}` },
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });
    return response.ok ? response.json() : null;
  }, token);
  requireCheck(Number.isSafeInteger(receipt?.account?.balance) && Array.isArray(receipt.entries), 'PLATFORM_CREDITS_UNAVAILABLE');
  return receipt;
}

function operationLabel(operation) {
  return operation.label;
}

async function inputFor(page, panel, operation, settings) {
  if (operation.id !== 'asr') {
    const prompts = {
      tts: '正式验收语音文本',
      music: '正式验收纯音乐片段',
      video: '正式验收蓝色森林短视频'
    };
    await panel.locator('#media-prompt').fill(prompts[operation.id]);
    return;
  }
  const wav = settings.asrFile ? await readFile(settings.asrFile) : wavFixture().bytes;
  await panel.locator('#media-audio-file').setInputFiles({ name: 'acceptance.wav', mimeType: 'audio/wav', buffer: wav });
  await expect(panel.getByText('acceptance.wav', { exact: true })).toBeVisible();
}

async function downloadEvidence(page, panel, operation, manifest) {
  const name = operation.id === 'asr' ? /下载 transcript-.*\.txt/ : operation.id === 'video' ? /下载 video-.*\.mp4/ : /下载 audio-.*\.wav/;
  const downloadEvent = page.waitForEvent('download');
  await panel.getByRole('link', { name }).click();
  const download = await downloadEvent;
  const file = await download.path();
  requireCheck(file, 'DOWNLOAD_FAILED');
  const bytes = await readFile(file);
  if (operation.id === 'asr') {
    requireCheck(bytes.toString('utf8').trim() === manifest.text.trim(), 'TRANSCRIPT_DOWNLOAD_MISMATCH');
  } else {
    requireCheck(bytes.length === manifest.bytes, 'MEDIA_DOWNLOAD_SIZE_MISMATCH');
    requireCheck(sha256(bytes) === manifest.sha256, 'MEDIA_DOWNLOAD_DIGEST_MISMATCH');
  }
  return { status: 'verified', bytes: bytes.length, sha256: sha256(bytes) };
}

async function libraryEvidence(page, operation) {
  await page.goto('/images');
  const library = page.locator('section[aria-label="已保存媒体"]');
  await expect(library).toBeVisible({ timeout: 30_000 });
  const card = library.locator('.media-library-card').last();
  await expect(card).toBeVisible();
  const kind = operation.id === 'asr' ? 'Transcript' : operation.id === 'video' ? '视频' : '音频';
  await expect(card.getByText(kind, { exact: true })).toBeVisible();
  return { status: 'verified', visible: true };
}

async function runAttempt(browser, settings, directory, operation, previous) {
  const file = attemptPath(directory, settings, operation);
  const existing = previous.get(file);
  if (existing) {
    validateVerifiedRecord(existing, operation);
    return existing;
  }
  const record = {
    identity: file.split('/').pop()?.slice(0, -5),
    release: settings.release,
    manifestSha256: settings.manifestSha256,
    operation: operation.operation,
    phase: 'dispatching',
    stage: 'browser-context',
    generationRequests: 0,
    taskId: null,
    taskStatus: null,
    providerRequestId: null,
    manifest: null,
    credits: null,
    localSave: null,
    download: null,
    library: null,
    startedAt: new Date().toISOString()
  };
  await persist(file, record, settings);
  const context = await browser.newContext({
    baseURL: settings.origin,
    acceptDownloads: true,
    serviceWorkers: 'block',
    viewport: { width: 1440, height: 1100 }
  });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    page.on('request', request => {
      const match = taskPath.exec(request.url());
      if (request.method() !== 'PUT' || !match) return;
      record.generationRequests++;
      record.taskId = match[1];
    });
    page.on('response', response => {
      const match = taskPath.exec(response.url());
      if (response.request().method() !== 'GET' || !match) return;
      void response.json().then(value => {
        if (match[1] !== record.taskId || !value || typeof value !== 'object') return;
        const providerId = safeProviderRequestId(value.providerRequestId);
        if (providerId) record.providerRequestId = providerId;
        record.taskStatus = typeof value.status === 'string' ? value.status : record.taskStatus;
        if (value.status === 'received' && value.result) record.manifest = value.result;
      }).catch(() => undefined);
    });
    const token = await platformLogin(page, settings);
    const before = await platformCredits(page, token);
    record.stage = 'capability-selection';
    const panel = page.getByRole('region', { name: '多模态媒体生成', exact: true });
    await page.goto('/create');
    await expect(panel).toBeVisible();
    await panel.getByRole('tab', { name: operationLabel(operation), exact: true }).click();
    await inputFor(page, panel, operation, settings);
    await expect(panel.getByRole('button', { name: '生成媒体', exact: true })).toBeEnabled();
    record.phase = 'dispatching';
    record.stage = 'generation-dispatch';
    await persist(file, record, settings);
    await panel.getByRole('button', { name: '生成媒体', exact: true }).click();
    record.stage = 'generation-response';
    try {
      await expect(panel.getByText('已保存到本机', { exact: true })).toBeVisible({ timeout: 210_000 });
    } catch (error) {
      if (record.taskStatus === 'needs_review') throw new Error('UNKNOWN_RECEIPT_REQUIRES_REVIEW', { cause: error });
      throw error;
    }
    await expect.poll(() => Boolean(record.taskId && record.providerRequestId && record.manifest), { timeout: 30_000 }).toBe(true);
    requireCheck(record.generationRequests === 1, 'GENERATION_REQUEST_BOUNDARY');
    requireCheck(/^\d{4}-\d{2}-\d{2}T/.test(record.startedAt), 'ACCEPTANCE_TIMESTAMP_INVALID');
    manifestFor(record, operation);
    record.stage = 'credit-settlement';
    const after = await platformCredits(page, token);
    const entries = after.entries.filter(entry => entry.source === 'generation' && entry.request_id === record.taskId);
    requireCheck(entries.length === 1, 'PLATFORM_CREDIT_MISMATCH');
    const cost = before.account.balance - after.account.balance;
    requireCheck(cost > 0 && entries[0].delta === -cost, 'PLATFORM_CREDIT_MISMATCH');
    record.credits = { before: before.account.balance, after: after.account.balance, cost, ledgerEntries: entries.length };
    record.stage = 'local-save';
    record.localSave = { status: 'saved', label: '已保存到本机' };
    record.stage = 'download';
    record.download = await downloadEvidence(page, panel, operation, record.manifest);
    record.stage = 'library-readback';
    record.library = await libraryEvidence(page, operation);
    record.phase = 'verified';
    record.stage = 'verified';
    record.finishedAt = new Date().toISOString();
    assertSafeAcceptanceRecord(record, settings);
    validateVerifiedRecord(record, operation);
    await persist(file, record, settings);
    return record;
  } catch (error) {
    record.phase = 'requires-review';
    record.failureCode = failureCode(error);
    record.finishedAt = new Date().toISOString();
    await persist(file, record, settings);
    throw new Error(
      `ACCEPTANCE_STOPPED_REVIEW_ATTEMPT operation=${operation.id} stage=${record.stage} code=${record.failureCode} requests=${record.generationRequests}`,
      { cause: error }
    );
  } finally {
    await context.close();
  }
}

export async function runMultimodalProviderAcceptance(settings, directory) {
  await verifyManifest(settings);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  return withAcceptanceRunLock(directory, async () => {
    const previous = await previousAttempts(settings, directory);
    const browser = await chromium.launch({ channel: process.env.AIAO_PLAYWRIGHT_CHANNEL || 'chrome', headless: true });
    const records = [];
    try {
      for (const operation of acceptancePlan()) records.push(await runAttempt(browser, settings, directory, operation, previous));
      return records;
    } finally {
      await browser.close();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let summary;
  try {
    const envFile = resolve(import.meta.dirname, '../../web/.env');
    if (existsSync(envFile)) process.loadEnvFile(envFile);
    const settings = liveSettings(process.env);
    const planned = acceptancePlan();
    summary = { planned: planned.length, verified: 0, realPlatform: true, automaticRetry: false };
    console.log(JSON.stringify({ ...summary, phase: 'planned' }));
    const records = await runMultimodalProviderAcceptance(
      settings,
      resolve(import.meta.dirname, '../tmp/provider-acceptance/multimodal-live')
    );
    summary.verified = records.length;
    console.log(JSON.stringify({ ...summary, phase: 'complete' }));
  } catch (error) {
    if (summary) console.error(JSON.stringify({ ...summary, phase: 'stopped', failureCode: failureCode(error) }));
    console.error('正式多模态 provider 验收未完成。请检查验收目录中的人工核查记录，脚本不会自动重发。');
    process.exitCode = 1;
  }
}
