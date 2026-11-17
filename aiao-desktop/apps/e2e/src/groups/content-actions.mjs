import AxeBuilder from '@axe-core/playwright';
import { expect as playwrightExpect } from 'playwright/test';

import { pressUntil } from '../harness/a11y.mjs';
import { traced } from '../harness/host-calls.mjs';

const expect = playwrightExpect.configure({ timeout: 15_000 });

export const contentActions = {
  name: 'content-actions',
  description: 'Preview/Mail/Photos 真实剪贴板、选定内容打印、权限拒绝与键盘路径',
  keys: [
    'contentActions.unavailableContentDisabled',
    'contentActions.pdfTextInClipboard',
    'contentActions.copyFailureAndRecovery',
    'contentActions.selectedDocumentPrint',
    'contentActions.printFailureAndCleanup',
    'contentActions.imageNameAndPrint',
    'contentActions.mailTextAndPrint',
    'contentActions.photoAddressInClipboard',
    'contentActions.keyboardMenu',
    'contentActions.noViolations'
  ],
  async run(session) {
    const { page, context, helpers } = session;
    const result = traced('content-actions');
    await session.openDesktop();
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(page.url()).origin });
    await helpers.closeAll();
    await page.evaluate(() => {
      window.__contentPrints = [];
      window.__failContentPrint = false;
      const append = Element.prototype.append;
      Element.prototype.append = function (...nodes) {
        const returned = append.apply(this, nodes);
        for (const node of nodes) {
          if (!(node instanceof HTMLIFrameElement) || !node.hasAttribute('data-content-print')) continue;
          const frame = node.contentWindow;
          const nativePrint = frame.print.bind(frame);
          frame.print = () => {
            const document = frame.document;
            const record = {
              title: document.title,
              text: [...document.body.querySelectorAll('h1,p')].map(element => element.textContent).join('\n\n'),
              scripts: document.scripts.length,
              image: document.querySelector('img')?.naturalWidth ?? null,
              beforePrint: false
            };
            window.__contentPrints.push(record);
            if (window.__failContentPrint) throw new Error('Print dialog denied for this check');
            frame.addEventListener(
              'beforeprint',
              () => {
                record.beforePrint = true;
              },
              { once: true }
            );
            nativePrint();
          };
        }
        return returned;
      };
    });
    const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
    const prints = () => page.evaluate(() => window.__contentPrints);
    const choose = async (window, button, command) => {
      await window.locator(button).click();
      await page.getByRole('menuitem', { name: command, exact: true }).click();
    };

    await helpers.launch('Preview');
    let preview = helpers.win('preview');
    await expect(preview.locator('[data-pv-failed]')).toBeVisible();
    await preview.locator('[data-pvshare]').click();
    await expect(page.getByRole('menuitem', { name: 'Copy File Name', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await expect(page.getByRole('menuitem', { name: 'Print…', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    result.unavailableContentDisabled = true;
    await helpers.closeAll();

    await helpers.desktopIcon('Interface Guidelines.pdf').dblclick();
    preview = helpers.win('preview');
    await expect(preview.locator('[data-pv-sheet]')).toBeVisible();
    const pdfText = await preview
      .locator('[data-pv-sheet]')
      .evaluate(element => [...element.children].map(child => child.textContent).join('\n\n'));
    const stop = await pressUntil(page, focus => focus.app === 'preview' && focus.name === 'Share');
    expect(stop.found).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Mail Draft', exact: true })).toBeFocused();
    await page.keyboard.press('c');
    await expect(page.getByRole('menuitem', { name: 'Copy Text', exact: true })).toBeFocused();
    const accessibility = await new AxeBuilder({ page }).include('app-menu-list').analyze();
    result.noViolations = accessibility.violations;
    await page.screenshot({ path: '/tmp/aiao-content-actions-menu.png' });
    await page.keyboard.press('Enter');
    await expect.poll(clipboard).toBe(pdfText);
    await expect(page.getByRole('menu', { name: 'preview sharing' })).toHaveCount(0);
    result.pdfTextInClipboard = true;
    result.keyboardMenu = true;

    await page.evaluate(() => {
      window.__originalContentCopy = navigator.clipboard.writeText.bind(navigator.clipboard);
      navigator.clipboard.writeText = () =>
        Promise.reject(new DOMException('Clipboard permission denied for this check', 'NotAllowedError'));
    });
    await choose(preview, '[data-pvshare]', 'Copy Text');
    await expect(preview.getByRole('alert')).toContainText('Copy failed: Clipboard permission denied');
    await expect(page.locator('app-menu-list')).toHaveCount(0);
    await expect(page.locator('#toast')).toContainText('Copy failed: Clipboard permission denied');
    expect(await preview.getByRole('alert').evaluate(element => getComputedStyle(element).backgroundColor)).toBe(
      'rgb(255, 255, 255)'
    );
    await page.screenshot({ path: '/tmp/aiao-content-actions-error.png' });
    expect(await clipboard()).toBe(pdfText);
    await page.evaluate(() => {
      navigator.clipboard.writeText = window.__originalContentCopy;
    });
    await choose(preview, '[data-pvshare]', 'Copy Text');
    await expect(preview.getByRole('alert')).toHaveCount(0);
    await expect.poll(clipboard).toBe(pdfText);
    result.copyFailureAndRecovery = true;

    await choose(preview, '[data-pvshare]', 'Print…');
    await expect.poll(async () => (await prints()).length).toBe(1);
    await expect.poll(async () => (await prints())[0].beforePrint).toBe(true);
    expect((await prints())[0]).toMatchObject({ text: pdfText, scripts: 0 });
    await expect(page.locator('[data-content-print]')).toHaveCount(0);
    result.selectedDocumentPrint = true;
    await page.evaluate(() => {
      window.__failContentPrint = true;
    });
    await choose(preview, '[data-pvshare]', 'Print…');
    await expect(preview.getByRole('alert')).toContainText('Print failed: Print dialog denied');
    await expect(page.locator('[data-content-print]')).toHaveCount(0);
    await page.evaluate(() => {
      window.__failContentPrint = false;
    });
    await choose(preview, '[data-pvshare]', 'Print…');
    await expect(preview.getByRole('alert')).toHaveCount(0);
    await expect.poll(async () => (await prints()).length).toBe(3);
    result.printFailureAndCleanup = true;
    await helpers.closeAll();

    const imageName = 'Screenshot 2026-07-27 at 4.34.11 PM.png';
    await helpers.desktopIcon(imageName).dblclick();
    preview = helpers.win('preview');
    await expect(preview.locator('[data-pv-image]')).toBeVisible();
    await choose(preview, '[data-pvshare]', 'Copy File Name');
    await expect.poll(clipboard).toBe(imageName);
    await choose(preview, '[data-pvshare]', 'Print…');
    await expect.poll(async () => (await prints()).length).toBe(4);
    expect((await prints())[3].image).toBeGreaterThan(0);
    expect((await prints())[3].title).toBe(imageName);
    await expect(page.locator('[data-content-print]')).toHaveCount(0);
    result.imageNameAndPrint = true;
    await helpers.closeAll();

    await helpers.launch('Mail');
    const mail = helpers.win('mail');
    await mail.locator('[data-box="Drafts"]').click();
    await mail.locator('[data-mshare]').click();
    await expect(page.getByRole('menuitem', { name: 'Copy Message', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await expect(page.getByRole('menuitem', { name: 'Print…', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('Escape');
    await mail.locator('[data-box="Inbox"]').click();
    await expect(mail.locator('[data-mread] h2')).toBeVisible();
    const subject = await mail.locator('[data-mread] h2').innerText();
    const body = await mail.locator('[data-mread] p').first().innerText();
    await choose(mail, '[data-mshare]', 'Copy Message');
    await expect.poll(clipboard).toContain(body);
    const message = await clipboard();
    expect(message).toContain(subject);
    expect(message).toMatch(/\n\nFrom: .+\n\nTo: .+/);
    await choose(mail, '[data-mshare]', 'Print…');
    await expect.poll(async () => (await prints()).length).toBe(5);
    expect((await prints())[4].text).toBe(message);
    expect((await prints())[4].beforePrint).toBe(true);
    await expect(page.locator('[data-content-print]')).toHaveCount(0);
    result.mailTextAndPrint = true;
    await helpers.closeAll();

    await helpers.launch('Photos');
    const photos = helpers.win('photos');
    await photos.locator('[data-pshare]').click();
    await expect(page.getByRole('menuitem', { name: 'Copy Image Address', exact: true })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    await page.keyboard.press('Escape');
    await photos.locator('[data-pi]').first().dblclick();
    await expect(photos.locator('.stage img')).toBeVisible();
    const imageSource = await photos.locator('.stage img').getAttribute('src');
    await choose(photos, '[data-pshare]', 'Copy Image Address');
    await expect.poll(clipboard).toMatch(/^https:\/\/upload\.wikimedia\.org\//);
    expect((await clipboard()).replace(/\/\d+px-/, '/')).toBe(imageSource.replace(/\/\d+px-/, '/'));
    result.photoAddressInClipboard = true;
    await helpers.closeAll();
    return { contentActions: result };
  }
};
