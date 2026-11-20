import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { asrWav, defaultMediaAnswer, installMediaFixture } from './multimodal-fixture.ts';
import { platformAccount } from './platform-fixture.ts';

test.describe('aiao-media 多模态媒体生成', () => {
  async function openMedia(page: import('@playwright/test').Page) {
    await platformAccount(page);
    await page.goto('/create');
    const panel = page.getByRole('region', { name: '多模态媒体生成', exact: true });
    await expect(panel).toBeVisible({ timeout: 30_000 });
    return panel;
  }

  test('TTS 生成、播放、下载和重复点击只产生一个任务', async ({ context, page }) => {
    const fixture = await installMediaFixture(context);
    const panel = await openMedia(page);
    await panel.getByRole('tab', { name: 'TTS 配音', exact: true }).click();
    await panel.locator('#media-prompt').fill('你好，欢迎使用 aiao-media。');
    const submit = panel.getByRole('button', { name: '生成媒体', exact: true });
    await submit.click();
    await submit.click();
    await expect(panel.getByText('已保存到本机', { exact: true })).toBeVisible();
    await expect(panel.locator('audio')).toHaveAttribute('src', /^blob:/);
    await expect(panel.getByRole('link', { name: /下载 audio-.*\.wav/ })).toBeVisible();
    expect(fixture.calls).toBe(1);
    expect(fixture.confirmCalls).toBe(1);
    expect(fixture.account.balance).toBe(998);
    expect(fixture.account.reserved).toBe(0);
  });

  test('双标签提交同一请求只产生一个上游任务并只扣一次积分', async ({ context, page }) => {
    const fixture = await installMediaFixture(context);
    const panel = await openMedia(page);
    const second = await context.newPage();
    const secondPanel = await openMedia(second);
    await panel.locator('#media-prompt').fill('两个标签页提交同一段文本');
    await secondPanel.locator('#media-prompt').fill('两个标签页提交同一段文本');
    const submit = panel.getByRole('button', { name: '生成媒体', exact: true });
    const secondSubmit = secondPanel.getByRole('button', { name: '生成媒体', exact: true });
    await expect(submit).toBeEnabled({ timeout: 30_000 });
    await expect(secondSubmit).toBeEnabled({ timeout: 30_000 });
    await Promise.all([submit.click(), secondSubmit.click()]);
    await expect.poll(
      async () =>
        Promise.all(
          [panel, secondPanel].map(async currentPanel => {
            if (await currentPanel.getByText('已保存到本机', { exact: true }).isVisible()) return 'saved';
            if (
              await currentPanel
                .getByRole('alert')
                .filter({ hasText: '已有相同的未确认媒体意图；只能核对原提交，不能覆盖或新建。' })
                .isVisible()
            )
              return 'conflict';
            return 'pending';
          })
        ).then(states => states.sort()),
      { timeout: 30_000 }
    ).toEqual(['conflict', 'saved']);
    expect(fixture.calls).toBe(1);
    expect(fixture.confirmCalls).toBe(1);
    expect(fixture.account.balance).toBe(998);
    expect(fixture.account.reserved).toBe(0);
    await second.close();
  });

  test('ASR 上传 WAV、识别、复制和下载 Transcript', async ({ context, page }) => {
    const fixture = await installMediaFixture(context);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4411' });
    const panel = await openMedia(page);
    await panel.getByRole('tab', { name: 'ASR 转写', exact: true }).click();
    await panel.locator('#media-audio-file').setInputFiles({
      name: 'fixture.wav',
      mimeType: 'audio/wav',
      buffer: asrWav()
    });
    await expect(panel.getByText('fixture.wav', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: '生成媒体', exact: true }).click();
    await expect(panel.locator('[aria-label="识别文本"]')).toHaveValue('fixture transcript');
    await panel.getByRole('button', { name: '复制文本', exact: true }).click();
    await expect(panel.getByRole('button', { name: '已复制', exact: true })).toBeVisible();
    const downloadEvent = page.waitForEvent('download');
    await panel.getByRole('link', { name: /下载 transcript-.*\.txt/ }).click();
    const download = await downloadEvent;
    expect(await readFile((await download.path()) as string)).toEqual(Buffer.from('fixture transcript\n'));
    expect(fixture.calls).toBe(1);
    expect(fixture.confirmCalls).toBe(1);
    expect(fixture.account.balance).toBe(999);
    expect(fixture.inputs.size).toBe(0);
  });

  test('短暂断网后继续完成原媒体任务，不重新提交', async ({ context, page }) => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    const fixture = await installMediaFixture(context, async request => {
      await pending;
      return defaultMediaAnswer(request);
    });
    let interrupted = false;
    const interruption = new Promise<void>(resolve => {
      void page.route('**/api/relay/tasks/**', async route => {
        if (!interrupted && route.request().method() === 'GET') {
          interrupted = true;
          await route.abort('internetdisconnected');
          resolve();
          return;
        }
        await route.fallback();
      });
    });
    const panel = await openMedia(page);
    await panel.locator('#media-prompt').fill('短暂断网后继续的媒体任务');
    await panel.getByRole('button', { name: '生成媒体', exact: true }).click();
    await expect.poll(() => fixture.calls).toBe(1);
    release();
    await interruption;
    await expect(panel.getByText('已保存到本机', { exact: true })).toBeVisible();
    expect(interrupted).toBe(true);
    expect(fixture.calls).toBe(1);
    expect(fixture.account.balance).toBe(998);
    expect(fixture.account.reserved).toBe(0);
  });

  test('刷新后续接已接单任务，不重新提交', async ({ context, page }) => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    const fixture = await installMediaFixture(context, async request => {
      await pending;
      return defaultMediaAnswer(request);
    });
    let panel = await openMedia(page);
    await panel.locator('#media-prompt').fill('刷新后续接的媒体任务');
    await panel.getByRole('button', { name: '生成媒体', exact: true }).click();
    await expect.poll(() => fixture.calls).toBe(1);
    await expect(panel.getByText('正在生成', { exact: true })).toBeVisible();
    await page.reload();
    panel = await openMedia(page);
    release();
    await expect(panel.getByText('已保存到本机', { exact: true })).toBeVisible();
    expect(fixture.calls).toBe(1);
    expect(fixture.account.balance).toBe(998);
    expect(fixture.account.reserved).toBe(0);
  });

  test('关闭页面后重开可以续接原任务，不重新提交', async ({ context, page }) => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => {
      release = resolve;
    });
    const fixture = await installMediaFixture(context, async request => {
      await pending;
      return defaultMediaAnswer(request);
    });
    const panel = await openMedia(page);
    await panel.locator('#media-prompt').fill('关闭页面后续接的媒体任务');
    await panel.getByRole('button', { name: '生成媒体', exact: true }).click();
    await expect.poll(() => fixture.calls).toBe(1);
    await page.close();
    const reopened = await context.newPage();
    const resumed = await openMedia(reopened);
    release();
    await expect(resumed.getByText('已保存到本机', { exact: true })).toBeVisible();
    expect(fixture.calls).toBe(1);
    expect(fixture.account.balance).toBe(998);
    expect(fixture.account.reserved).toBe(0);
    await reopened.close();
  });

  test('音乐和视频分别使用目录参数，并能播放和保存结果', async ({ context, page }) => {
    const fixture = await installMediaFixture(context);
    const panel = await openMedia(page);

    await panel.getByRole('tab', { name: '生成音乐', exact: true }).click();
    await panel.locator('#media-prompt').fill('轻快的电子氛围音乐');
    await panel.locator('#media-music-duration').selectOption('5');
    await panel.getByRole('button', { name: '生成媒体', exact: true }).click();
    await expect(panel.getByText('已保存到本机', { exact: true })).toBeVisible();
    await expect(panel.locator('audio')).toHaveAttribute('src', /^blob:/);

    await panel.getByRole('tab', { name: '生成视频', exact: true }).click();
    await panel.locator('#media-prompt').fill('一块蓝色玻璃在阳光下旋转');
    await panel.locator('#media-video-ratio').selectOption('16:9');
    await panel.locator('#media-video-duration').selectOption('5');
    await panel.locator('#media-video-resolution').selectOption('768P');
    await panel.getByRole('button', { name: '生成媒体', exact: true }).click();
    await expect(panel.getByText('已保存到本机', { exact: true })).toBeVisible();
    const video = panel.locator('video');
    await expect(video).toHaveAttribute('src', /^blob:/);
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).readyState)).toBeGreaterThan(0);
    await expect(panel.getByRole('link', { name: /下载 video-.*\.mp4/ })).toBeVisible();

    expect(fixture.calls).toBe(2);
    expect(fixture.confirmCalls).toBe(2);
    expect(fixture.account.balance).toBe(988);
    expect(fixture.account.reserved).toBe(0);
  });

  test('平台待核查结果可记录且不会自动重发', async ({ context, page }) => {
    const fixture = await installMediaFixture(context, async () => ({ status: 502 }));
    const panel = await openMedia(page);
    await panel.locator('#media-prompt').fill('这次任务用于验证待核查状态');
    await panel.getByRole('button', { name: '生成媒体', exact: true }).click();
    await expect(panel.getByText('待核查平台任务', { exact: true })).toBeVisible();
    await page.reload();
    const reloaded = await openMedia(page);
    await expect(reloaded.getByText('待核查平台任务', { exact: true })).toBeVisible();
    expect(fixture.calls).toBe(1);
    await reloaded.getByRole('button', { name: '记录已核查', exact: true }).click();
    await expect(reloaded.getByText('已记录待核查结果，不会自动重新生成。', { exact: true })).toBeVisible();
    expect(fixture.calls).toBe(1);
    expect(fixture.confirmCalls).toBe(0);
    expect(fixture.account.balance).toBe(1000);
    expect(fixture.account.reserved).toBe(0);
  });
});
