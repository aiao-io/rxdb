import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const directory = resolve(import.meta.dirname, '../../tmp/self-hosted');
const admin = JSON.parse(await readFile(resolve(directory, 'initial-admin.json'), 'utf8'));
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const failures = [];
page.on('pageerror', error => failures.push(error.name));
try {
  await page.goto(admin.origin);
  await page.getByRole('button', { name: '登录账号', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.isSecureContext), true);
  await page.evaluate(() => navigator.serviceWorker.ready);
  assert.equal(await page.evaluate(() => globalThis.__AIAO_SUPABASE_CONFIG__.storageUrl), admin.origin);
  await page.getByRole('button', { name: '登录账号', exact: true }).click();
  await page.getByLabel('邮箱', { exact: true }).fill(admin.email);
  await page.getByLabel('密码', { exact: true }).fill(admin.password);
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('heading', { name: '已登录', exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭账号窗口' }).click();
  console.log('PASS public IP certificate, secure context, live initial account browser login');
  const websocket = await page.evaluate(
    () =>
      new Promise(resolve => {
        const config = globalThis.__AIAO_SUPABASE_CONFIG__;
        const socket = new WebSocket(
          `${config.url.replace('https:', 'wss:')}/realtime/v1/websocket?apikey=${encodeURIComponent(config.anonKey)}&vsn=1.0.0`
        );
        const timer = setTimeout(() => {
          socket.close();
          resolve(false);
        }, 10000);
        socket.onopen = () => {
          clearTimeout(timer);
          socket.close();
          resolve(true);
        };
        socket.onerror = () => {
          clearTimeout(timer);
          resolve(false);
        };
      })
  );
  assert.equal(websocket, true, 'Realtime WSS');
  console.log('PASS public Realtime WSS upgrade');
  for (const route of ['/', '/create', '/images', '/providers']) {
    await page.goto(`${admin.origin}${route}`);
    await page.getByRole('navigation', { name: '主导航' }).waitFor();
    await page.getByText('创作自动保存在此设备', { exact: true }).waitFor();
    await page.getByRole('button', { name: '我的账号', exact: true }).waitFor();
  }
  console.log('PASS four direct routes, WASM local storage, login survives reload');
  await context.setOffline(true);
  for (const route of ['/', '/create', '/images', '/providers']) {
    await page.goto(`${admin.origin}${route}`);
    await page.getByRole('navigation', { name: '主导航' }).waitFor();
    await page.getByText('创作自动保存在此设备', { exact: true }).waitFor();
  }
  assert.deepEqual(failures, []);
  console.log('PASS four routes reload offline with persistent local workspace and no JavaScript exception');
} finally {
  await context.close();
  await browser.close();
}
