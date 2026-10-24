import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  downloadBackup,
  endpoint,
  importBackup,
  key,
  pngFixture,
  profile,
  prompt,
  provider
} from './local-first.helpers';

const generate = async (page: Page) => {
  const result = page.getByRole('link', { name: '下载图片' });
  const previous = (await result.count()) ? await result.getAttribute('href') : null;
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(result).toBeVisible();
  if (previous) await expect(result).not.toHaveAttribute('href', previous);
  await expect(page.getByRole('button', { name: '✧ 生成图片' })).toBeEnabled();
  await expect(page.getByText('已保存到本机', { exact: true })).toBeVisible();
};

test('记住、替换和移除 Key 后只保留非敏感配置，刷新不复用旧凭据', async ({ page }) => {
  await provider(page);
  await page.reload();
  await page.getByRole('button', { name: '编辑 / 填写 Key' }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue(key);
  const replacement = 'fixture-replacement-key';
  await page.getByLabel('API Key', { exact: true }).fill(replacement);
  await page.getByRole('button', { name: '保存到本机', exact: true }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
  await page.reload();
  await page.getByRole('button', { name: '编辑 / 填写 Key' }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue(replacement);
  const png = await pngFixture();
  let calls = 0;
  await page.route(endpoint, route => {
    calls++;
    expect(route.request().headers()['authorization']).toBe(`Bearer ${replacement}`);
    return route.fulfill({
      json: { data: [{ b64_json: png.toString('base64') }] }
    });
  });
  await prompt(page);
  await generate(page);
  const backup = await downloadBackup(page);
  expect(backup.toString()).not.toContain(key);
  expect(backup.toString()).not.toContain(replacement);
  await page.getByRole('button', { name: '移除 Key', exact: true }).click();
  await expect(page.getByText('已移除 Key，供应商配置已保留。')).toBeVisible();
  await prompt(page);
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
  await page.reload();
  await page.getByRole('button', { name: '编辑 / 填写 Key' }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('在此设备记住 Key')).not.toBeChecked();
  expect(calls).toBe(1);
});

test('非法配置和损坏 PNG 被拒绝，不泄露 Key、不创建假作品或自动重发', async ({ page }) => {
  await provider(page);
  await page.getByRole('button', { name: '编辑 / 填写 Key' }).click();
  await page.getByLabel('HTTPS Base URL').fill(`https://user:${key}@images.example.test/v1`);
  await page.getByRole('button', { name: '保存到本机', exact: true }).click();
  await expect(page.getByText('Base URL 需要使用 HTTPS，且不能包含账号、查询参数或片段。')).toBeVisible();
  await page.getByLabel('HTTPS Base URL').fill('https://images.example.test/v1');
  await page.getByLabel('图片模型 ID').fill('invalid/model');
  await page.getByRole('button', { name: '保存到本机', exact: true }).click();
  await expect(page.locator('.provider-form .notice')).toContainText('有效的名称、模型');
  const png = await pngFixture();
  let calls = 0;
  await page.route(endpoint, route => {
    calls++;
    return route.fulfill({
      json: { data: [{ b64_json: png.subarray(0, 33).toString('base64') }] }
    });
  });
  await prompt(page);
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(page.getByRole('heading', { name: '请核对供应商记录' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(key);
  await page.goto('/images');
  await expect(page.getByAltText('本机生成作品')).toHaveCount(0);
  await page.reload();
  await expect(page.getByAltText('本机生成作品')).toHaveCount(0);
  expect(calls).toBe(1);
});

test('跨 origin 图片读取不带凭据，原图信息、下载、复用和删除与实际文件一致', async ({ page }) => {
  const png = await pngFixture();
  let calls = 0;
  await page.route(endpoint, route => {
    calls++;
    return route.fulfill({
      json: { data: [{ url: 'https://results.example.test/image.png' }] }
    });
  });
  await page.route('https://results.example.test/image.png', route => {
    const headers = route.request().headers();
    for (const name of ['authorization', 'cookie', 'referer']) expect(headers[name]).toBeUndefined();
    return route.fulfill({ contentType: 'image/png', body: png });
  });
  await provider(page);
  await prompt(page, '可复用的原始提示词');
  await generate(page);
  await prompt(page, '另一张图片');
  await generate(page);
  await page.goto('/images');
  const cards = page.locator('.library-card');
  await expect(cards).toHaveCount(2);
  const original = cards.filter({ hasText: '可复用的原始提示词' });
  await original.getByText('生成信息', { exact: true }).click();
  await expect(original).toContainText('test-image');
  await expect(original).toContainText(`image/png · 64 × 64 · ${png.length} bytes`);
  await expect(original).toContainText(createHash('sha256').update(png).digest('hex'));
  const download = page.waitForEvent('download');
  await original.getByRole('link', { name: '下载图片' }).click();
  expect(await readFile((await (await download).path()) as string)).toEqual(png);
  page.once('dialog', dialog => dialog.accept());
  await original.getByRole('button', { name: '复用提示词' }).click();
  await expect(page.locator('[contenteditable=true]')).toContainText('可复用的原始提示词');
  await page.goto('/images');
  page.once('dialog', dialog => dialog.accept());
  await original.getByRole('button', { name: '删除本机图片' }).click();
  await expect(cards).toHaveCount(1);
  await expect
    .poll(() => page.getByAltText('本机生成作品').evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(64);
  const remainingDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: '下载图片' }).click();
  expect(await readFile((await (await remainingDownload).path()) as string)).toEqual(png);
  await page.reload();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText('另一张图片');
  await page.getByText('本机任务记录', { exact: false }).click();
  await expect(page.locator('.task-history')).toContainText('本机无副本');
  const backup = JSON.parse((await downloadBackup(page)).toString());
  expect(backup.images).toHaveLength(1);
  expect(backup.images[0].job.request.prompt).toBe('另一张图片');
  expect(calls).toBe(2);
});

test('另一标签页保存草稿不重新读取作品，新增作品通过原生活查询出现', async ({ page, context }) => {
  const png = await pngFixture();
  await context.route(endpoint, route => route.fulfill({ json: { data: [{ b64_json: png.toString('base64') }] } }));
  await provider(page);
  await prompt(page, '第一张图片');
  await generate(page);
  await page.goto('/images');
  await expect(page.locator('.library-card')).toHaveCount(1);
  const other = await context.newPage();
  await other.goto('/create');
  await expect(other.locator('[contenteditable=true]')).toContainText('第一张图片');
  await page.evaluate(() => {
    const read = FileSystemFileHandle.prototype.getFile;
    document.documentElement.dataset['imageReads'] = '0';
    FileSystemFileHandle.prototype.getFile = async function () {
      if (this.name.endsWith('.png'))
        document.documentElement.dataset['imageReads'] = String(
          Number(document.documentElement.dataset['imageReads']) + 1
        );
      return read.call(this);
    };
  });
  await other.locator('[contenteditable=true]').fill('第二个窗口的新草稿');
  await expect(other.getByText('输入已保存到本机', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '生成图片', exact: true }).click();
  await expect(page.locator('[contenteditable=true]')).toContainText('第二个窗口的新草稿');
  await expect(page.locator('html')).toHaveAttribute('data-image-reads', '0');
  await page.goto('/images');
  await expect(page.locator('.library-card')).toHaveCount(1);
  await generate(other);
  await expect(page.locator('.library-card')).toHaveCount(2);
});

test('保存完成文件但关联确认前关闭页面，重开从 journal 恢复而不重新生成', async ({ page, context }) => {
  const png = await pngFixture();
  let calls = 0;
  await context.route(endpoint, route => {
    calls++;
    return route.fulfill({
      json: { data: [{ b64_json: png.toString('base64') }] }
    });
  });
  await provider(page);
  await prompt(page);
  await page.evaluate(() => {
    const original = FileSystemFileHandle.prototype.getFile;
    FileSystemFileHandle.prototype.getFile = async function () {
      const file = await original.call(this);
      if (this.name.endsWith('.png')) {
        document.documentElement.dataset['fileReadHeld'] = 'true';
        return new Promise<File>(() => undefined);
      }
      return file;
    };
  });
  await page.getByRole('button', { name: '✧ 生成图片' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-file-read-held', 'true');
  await expect(page.getByText('已保存到本机', { exact: true })).toHaveCount(0);
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/images');
  await expect(reopened.getByAltText('本机生成作品')).toHaveCount(1);
  await reopened.getByText('本机任务记录', { exact: false }).click();
  await expect(reopened.locator('.task-history')).toContainText('已保存到本机');
  await expect(reopened.locator('body')).not.toContainText('本机无副本');
  const download = reopened.waitForEvent('download');
  await reopened.getByRole('link', { name: '下载图片' }).click();
  expect(await readFile((await (await download).path()) as string)).toEqual(png);
  expect(calls).toBe(1);
});

test('删除文件被中断后重开会继续清理，不影响其他作品', async ({ page }) => {
  const png = await pngFixture();
  await page.route(endpoint, route => route.fulfill({ json: { data: [{ b64_json: png.toString('base64') }] } }));
  await provider(page);
  await prompt(page, '应当删除');
  await generate(page);
  await prompt(page, '应当保留');
  await generate(page);
  await page.goto('/images');
  await expect(page.locator('.library-card')).toHaveCount(2);
  await page.evaluate(() => {
    const original = FileSystemDirectoryHandle.prototype.removeEntry;
    FileSystemDirectoryHandle.prototype.removeEntry = async function (name, options) {
      if (name.endsWith('.png')) throw new DOMException('fixture interrupted deletion', 'NotAllowedError');
      return original.call(this, name, options);
    };
  });
  page.once('dialog', dialog => dialog.accept());
  await page
    .locator('.library-card')
    .filter({ hasText: '应当删除' })
    .getByRole('button', { name: '删除本机图片' })
    .click();
  await expect(page.getByText('删除未完成，请刷新后重试。')).toBeVisible();
  await page.reload();
  await expect(page.locator('.library-card')).toHaveCount(1);
  await expect(page.locator('.library-card')).toContainText('应当保留');
  await page.reload();
  await expect(page.locator('.library-card')).toHaveCount(1);
});

test('备份的超限、摘要损坏和重复图片 ID 不会切换或覆盖现有工作区', async ({ page }) => {
  const png = await pngFixture();
  await page.route(endpoint, route => route.fulfill({ json: { data: [{ b64_json: png.toString('base64') }] } }));
  await provider(page);
  await prompt(page);
  await generate(page);
  const contents = await downloadBackup(page);
  const original = await profile(page);
  const broken = JSON.parse(contents.toString());
  broken.images[0].sha256 = '0'.repeat(64);
  await importBackup(page, Buffer.from(JSON.stringify(broken)));
  await expect(page.getByText('备份图片校验失败，原数据未更改。')).toBeVisible();
  const duplicate = JSON.parse(contents.toString());
  duplicate.images.push(duplicate.images[0]);
  await importBackup(page, Buffer.from(JSON.stringify(duplicate)));
  await expect(page.getByText('备份图片格式无效或 ID 重复。')).toBeVisible();
  await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(64 * 1024 * 1024 + 1)], 'oversized.json'));
    const input = document.querySelector<HTMLInputElement>('input[type=file]');
    if (!input) throw new Error('Missing import input');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByText('备份文件不能超过 64 MiB。')).toBeVisible();
  expect(await profile(page)).toBe(original);
  const after = JSON.parse((await downloadBackup(page)).toString());
  expect(after.images).toEqual(JSON.parse(contents.toString()).images);
});

test('导入中断保留原库，同一备份重试复用隔离暂存区并恢复全部原图', async ({ page }) => {
  const png = await pngFixture();
  await page.route(endpoint, route => route.fulfill({ json: { data: [{ b64_json: png.toString('base64') }] } }));
  await provider(page);
  await prompt(page, '备份图片一');
  await generate(page);
  await prompt(page, '备份图片二');
  await generate(page);
  const contents = await downloadBackup(page);
  const original = await profile(page);
  await page.evaluate(() => {
    const original = FileSystemDirectoryHandle.prototype.getFileHandle;
    const seen = new Set<string>();
    FileSystemDirectoryHandle.prototype.getFileHandle = async function (name, options) {
      if (name.endsWith('.png') && options?.create) {
        seen.add(name);
        if (seen.size > 1) throw new DOMException('fixture interrupted import', 'QuotaExceededError');
      }
      return original.call(this, name, options);
    };
  });
  await importBackup(page, contents);
  await expect(page.getByText('本地图片写入或关联失败，未确认保存；可在交付期限内重试。')).toBeVisible();
  expect(await profile(page)).toBe(original);
  const staging = await page.evaluate(() => JSON.parse(localStorage.getItem('aiao-local-import-staging-v1') || 'null'));
  expect(staging.id).not.toBe(original);
  await page.reload();
  await expect(page.getByRole('heading', { name: '本机供应商 · 默认' })).toBeVisible();
  const reloaded = page.waitForEvent('load');
  await importBackup(page, contents);
  await reloaded;
  await expect.poll(() => profile(page)).toBe(staging.id);
  expect(await page.evaluate(() => localStorage.getItem('aiao-local-previous-profile-v1'))).toBe(original);
  await page.goto('/images');
  await expect(page.getByAltText('本机生成作品')).toHaveCount(2);
  const restored = JSON.parse((await downloadBackup(page)).toString());
  expect(restored.images.map((image: { base64: string }) => image.base64)).toEqual([
    png.toString('base64'),
    png.toString('base64')
  ]);
  await page.evaluate(id => localStorage.setItem('aiao-local-profile-v1', id as string), original);
  await page.reload();
  await page.getByRole('button', { name: '编辑 / 填写 Key' }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue(key);
  await page.goto('/images');
  await expect(page.getByAltText('本机生成作品')).toHaveCount(2);
});

test('不兼容 schema 阻止已有标签页写入和重开，恢复兼容版本后原数据可读', async ({ page }) => {
  await provider(page);
  await prompt(page, '兼容版本的原始草稿');
  const original = await profile(page);
  await page.evaluate(id => localStorage.setItem(`aiao-local-schema-${id}`, '2'), original);
  await page.locator('[contenteditable=true]').fill('不应写入的新草稿');
  await expect(page.locator('.draft-status')).toContainText('失败');
  await page.reload();
  await expect(page.getByText('本机数据版本与此应用不兼容，请更新应用后重试；原数据未更改。')).toBeVisible();
  expect(await profile(page)).toBe(original);
  await page.evaluate(id => localStorage.setItem(`aiao-local-schema-${id}`, '1'), original);
  await page.reload();
  await expect(page.locator('[contenteditable=true]')).toContainText('兼容版本的原始草稿');
  await page.goto('/providers');
  await page.getByRole('button', { name: '编辑 / 填写 Key' }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue(key);
});

test('两个标签页的草稿冲突保留各自输入，明确选择保留或载入后才覆盖', async ({ page, context }) => {
  await provider(page);
  await prompt(page, '初始草稿');
  const other = await context.newPage();
  await other.goto('/create');
  await expect(other.locator('[contenteditable=true]')).toContainText('初始草稿');
  for (const choice of ['保留本页输入', '载入另一标签页的草稿']) {
    await page.evaluate(() => {
      const id = localStorage.getItem('aiao-local-profile-v1');
      void navigator.locks.request(`aiao-media-account-${id}`, async () => {
        document.documentElement.dataset['draftLocked'] = 'true';
        await new Promise<void>(resolve =>
          document.addEventListener('release-draft-lock', () => resolve(), {
            once: true
          })
        );
      });
    });
    await expect(page.locator('html')).toHaveAttribute('data-draft-locked', 'true');
    await page.locator('[contenteditable=true]').fill(`标签一：${choice}`);
    await other.locator('[contenteditable=true]').fill(`标签二：${choice}`);
    await expect(page.locator('.draft-status')).not.toContainText('已保存');
    await expect(other.locator('.draft-status')).not.toContainText('已保存');
    await page.evaluate(() => document.dispatchEvent(new Event('release-draft-lock')));
    await expect
      .poll(
        async () =>
          (await page.locator('.conflict-actions').count()) + (await other.locator('.conflict-actions').count())
      )
      .toBe(1);
    await expect(page.locator('[contenteditable=true]')).toContainText(`标签一：${choice}`);
    await expect(other.locator('[contenteditable=true]')).toContainText(`标签二：${choice}`);
    const conflict = (await page.locator('.conflict-actions').count()) ? page : other;
    await conflict.getByRole('button', { name: choice, exact: true }).click();
    await expect(conflict.locator('.conflict-actions')).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await page.locator('[contenteditable=true]').textContent()) ===
          (await other.locator('[contenteditable=true]').textContent())
      )
      .toBe(true);
    await page.evaluate(() => delete document.documentElement.dataset['draftLocked']);
  }
});

test('编辑器资源失败不丢草稿、不允许提交，重试加载后可继续编辑', async ({ page }) => {
  await provider(page);
  await prompt(page, '编辑器重试后仍保留的输入');
  await page.evaluate(async () => {
    for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
  });
  // A fresh page is no longer controlled by the installed offline cache.
  await page.goto('about:blank');
  await page.route('**/prompt-runtime/editor.js', route => route.abort('failed'));
  await page.goto('/create');
  await expect(page.getByRole('button', { name: '重试输入编辑器' })).toBeVisible();
  await expect(page.locator('app-prompt-input pre')).toContainText('编辑器重试后仍保留的输入');
  await expect(page.getByRole('button', { name: '✧ 生成图片' })).toBeDisabled();
  await page.unroute('**/prompt-runtime/editor.js');
  await page.getByRole('button', { name: '重试输入编辑器' }).click();
  await expect(page.locator('[contenteditable=true]')).toContainText('编辑器重试后仍保留的输入');
  await expect(page.getByRole('button', { name: '✧ 生成图片' })).toBeEnabled();
});

test('模板字段可撤销重做，刷新恢复画幅，替换模板后撤销不串回旧内容', async ({ page }) => {
  await provider(page);
  await page.getByRole('link', { name: '发现灵感', exact: true }).click();
  await page
    .getByRole('button', {
      name: '查看把一杯咖啡，拍成一张好海报',
      exact: true
    })
    .click();
  await page.getByRole('button', { name: '用这个灵感创作' }).click();
  const product = page.getByRole('textbox', { name: '模板参数：产品' });
  await product.fill('燕麦拿铁');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(product).toHaveValue('手冲咖啡');
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(product).toHaveValue('燕麦拿铁');
  await page.getByRole('button', { name: '纵向', exact: true }).click();
  await expect(page.locator('.draft-status')).toContainText('已保存');
  await page.reload();
  await expect(product).toHaveValue('燕麦拿铁');
  await expect(page.getByRole('button', { name: '纵向', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await product.fill('不应进入下一模板的输入');
  await page.getByRole('link', { name: '发现灵感', exact: true }).click();
  await page.getByRole('button', { name: '查看一件陶器，也有自己的年轮', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '用这个灵感创作' }).click();
  const editor = page.locator('[contenteditable=true]');
  await expect(editor).toContainText('当代陶瓷展览海报');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(editor).toContainText('当代陶瓷展览海报');
  await expect(page.getByRole('textbox', { name: '模板参数：产品' })).toHaveCount(0);
});

test('示例图片加载失败有提示，仍可查看正文、套用字段和预览最终文本', async ({ page }) => {
  await page.route('**/image-examples/coffee.jpg', route => route.abort('failed'));
  await page.goto('/');
  const card = page.getByRole('button', {
    name: '查看把一杯咖啡，拍成一张好海报',
    exact: true
  });
  await expect(card).toContainText('示例图暂时无法加载');
  await card.click();
  await expect(page.getByRole('dialog')).toContainText('提示词仍可使用');
  await expect(page.getByRole('dialog').locator('blockquote')).toContainText('手冲咖啡');
  await page.getByRole('button', { name: '用这个灵感创作' }).click();
  await page.getByRole('button', { name: '预览最终提示词', exact: true }).click();
  await expect(page.getByLabel('最终提示词预览')).toContainText('手冲咖啡');
});
