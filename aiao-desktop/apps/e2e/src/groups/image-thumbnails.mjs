import { expect as playwrightExpect } from 'playwright/test';

import { surgery } from '../harness/database.mjs';
import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });
const name = 'thumbnail-test.png';
const replacement = 'thumbnail-replacement.png';

async function imageFile(page, name, height, color) {
  const base64 = await page.evaluate(
    ([height, color]) => {
      const canvas = new OffscreenCanvas(1600, height);
      const context = canvas.getContext('2d');
      context.fillStyle = color;
      context.fillRect(0, 0, 800, height);
      return canvas.convertToBlob().then(async blob => new Uint8Array(await blob.arrayBuffer()).toBase64());
    },
    [height, color]
  );
  return { name, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

async function contentId(session) {
  const rows = await surgery(session, db =>
    db.shell.rows('SELECT content_id FROM "desktop$desktop_file" WHERE name = ?', [name])
  );
  return rows[0]?.[0];
}

async function storedThumbnail(page, id) {
  return page.evaluate(async id => {
    const root = await navigator.storage.getDirectory();
    const selection = JSON.parse(localStorage.getItem('aiao-desktop:data-location') ?? 'null');
    const files = `aiao-desktop-files${selection?.active ? `-${selection.active}` : ''}`;
    try {
      let directory = root;
      for (const segment of [files, 'Library', 'Caches', 'Thumbnails']) {
        directory = await directory.getDirectoryHandle(segment);
      }
      const file = await (await directory.getFileHandle(`v1-${encodeURIComponent(id)}.png`)).getFile();
      return `data:image/png;base64,${new Uint8Array(await file.arrayBuffer()).toBase64()}`;
    } catch (error) {
      if (error.name === 'NotFoundError') return null;
      throw error;
    }
  }, id);
}

export const imageThumbnails = {
  name: 'image-thumbnails',
  description: '图片缩略图的实际像素、Finder 视图、OPFS 复用和清理',
  keys: [
    'imageThumbnails.showsActualImage',
    'imageThumbnails.allFinderViews',
    'imageThumbnails.keepsOriginalResolution',
    'imageThumbnails.reusesOpfsAfterReload',
    'imageThumbnails.replacesAndRemovesCache'
  ],
  async run(session) {
    const { page, helpers } = session;
    const result = traced('image-thumbnails');
    await session.openDesktop();
    await helpers.closeAll();
    const desktop = page.locator('#desktop');
    const icon = helpers.desktopIcon(name);
    const thumbnail = icon.locator('[data-thumbnail]');
    const original = await imageFile(page, name, 800, '#ff0000');
    await desktop.drop({ files: original });
    await expect(thumbnail).toHaveJSProperty('naturalWidth', 512);
    await expect(thumbnail).toHaveJSProperty('naturalHeight', 256);
    const pixels = await thumbnail.evaluate(image => {
      const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      return [100, 400].map(x => [...context.getImageData(x, 100, 1, 1).data]);
    });
    expect(pixels).toEqual([
      [255, 0, 0, 255],
      [0, 0, 0, 0]
    ]);
    result.showsActualImage = true;

    const id = await contentId(session);
    const src = await thumbnail.getAttribute('src');
    expect(await storedThumbnail(page, id)).toBe(src);
    await icon.dblclick();
    const fullImage = helpers.win('preview').locator('[data-pv-image]');
    await expect(fullImage).toHaveJSProperty('naturalWidth', 1600);
    result.keepsOriginalResolution = true;

    await helpers.launch('Finder');
    const finder = helpers.win('finder').last();
    await finder.locator('[data-place="Desktop"]').click();
    const views = { Icons: 'icon', List: 'list', Columns: 'col', Gallery: 'gal' };
    for (const [view, mode] of Object.entries(views)) {
      await finder.getByRole('button', { name: view, exact: true }).click();
      const item = finder.locator(`.fv-${mode} [role="option"][data-name="${name}"]`);
      await item.click();
      await expect(item.locator('[data-thumbnail]')).toHaveAttribute('src', src);
      if (view === 'Columns') {
        await expect(
          finder.getByRole('group', { name: `Preview of ${name}` }).locator('[data-thumbnail]')
        ).toHaveAttribute('src', src);
      }
      if (view === 'Gallery') {
        await expect(finder.locator('.stage [data-thumbnail]')).toHaveAttribute('src', src);
      }
    }
    result.allFinderViews = true;

    await page.addInitScript(size => {
      const decode = window.createImageBitmap.bind(window);
      window.createImageBitmap = (source, ...options) => {
        if (source instanceof Blob && source.type === 'image/png' && source.size === size) {
          return Promise.reject(new Error('Original image decoding is disabled for the cache check.'));
        }
        return decode(source, ...options);
      };
    }, original.buffer.length);
    await session.reloadDesktop(page, { finder: false });
    await expect(thumbnail).toHaveAttribute('src', src);
    await expect(thumbnail).toHaveJSProperty('naturalWidth', 512);
    result.reusesOpfsAfterReload = true;

    await desktop.drop({ files: await imageFile(page, replacement, 1200, '#0000ff') });
    await expect(helpers.desktopIcon(replacement)).toBeVisible();
    await helpers.openTerminal();
    await helpers.runInShell(`cp ~/Desktop/${replacement} ~/Desktop/${name}`);
    await expect(thumbnail).toHaveJSProperty('naturalHeight', 384);
    const nextId = await contentId(session);
    expect(nextId).not.toBe(id);
    expect(await storedThumbnail(page, nextId)).toBe(await thumbnail.getAttribute('src'));
    expect(await storedThumbnail(page, id)).toBeNull();
    await helpers.runInShell(`rm ~/Desktop/${name}`);
    await expect(icon).toHaveCount(0);
    await expect.poll(() => storedThumbnail(page, nextId)).toBeNull();
    result.replacesAndRemovesCache = true;
    return { imageThumbnails: result };
  }
};
