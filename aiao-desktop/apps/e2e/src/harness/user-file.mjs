import { expect as playwrightExpect } from 'playwright/test';

const expect = playwrightExpect.configure({ timeout: 15_000 });

/** 经真实终端复制非空文件，作为域名隔离与旧库升级的用户文件；等命令结束再 open，避免忙碌的 shell 丢掉后续输入。 */
export async function copyUserFile(page, helpers, name) {
  await helpers.closeAll();
  await helpers.openTerminal();
  const command = `cp ~/Desktop/prasenx.txt ~/Desktop/${name}`;
  await helpers.runInShell(command);
  await page.waitForFunction(input => {
    const text = document.querySelector('.win[data-app="terminal"] .xterm-rows')?.textContent ?? '';
    return text.includes(input) && /~\$\s*$/.test(text);
  }, command);
  await helpers.desktopIcon(name).waitFor();
  await helpers.runInShell(`open ~/Desktop/${name}`);
  const editor = helpers.win('textedit').locator('[data-te-doc]');
  await expect(editor).toContainText('Scratchpad');
  const body = await editor.innerText();
  await helpers.closeAll();
  return body;
}

/** 从桌面重开验收用的非空文本文件，验证文件体可被应用读回。 */
export async function readUserFile(page, helpers, name) {
  await helpers.closeAll();
  await helpers.desktopIcon(name).dblclick();
  const editor = helpers.win('textedit').locator('[data-te-doc]');
  await expect(editor).not.toBeEmpty();
  return editor.innerText();
}
