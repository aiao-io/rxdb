import { chromium } from '@playwright/test';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
/** macOS 自带「简体拼音」输入模式。 */
export const PINYIN_INPUT_SOURCE = 'com.apple.inputmethod.SCIM.ITABC';
const LOCAL_ORIGIN = 'http://127.0.0.1:4399';
const TEMPLATE = '查看把一杯咖啡，拍成一张好海报';
// ANSI 物理键码：经 System Events 发出的是硬件按键，由系统输入法自行组字。
const KEY_CODES = {
  a: 0,
  b: 11,
  c: 8,
  d: 2,
  e: 14,
  f: 3,
  g: 5,
  h: 4,
  i: 34,
  j: 38,
  k: 40,
  l: 37,
  m: 46,
  n: 45,
  o: 31,
  p: 35,
  q: 12,
  r: 15,
  s: 1,
  t: 17,
  u: 32,
  v: 9,
  w: 13,
  x: 7,
  y: 16,
  z: 6
};
const SPACE = { code: 49, pause: 0.5 };
const SELECT_ALL = { code: 0, modifiers: ['command'], pause: 0.3 };
const PASTE = { code: 9, modifiers: ['command'], pause: 0.6 };
const UNDO = { code: 6, modifiers: ['command'], pause: 0.5 };
const REDO = { code: 6, modifiers: ['command', 'shift'], pause: 0.5 };
const INPUT_SOURCE_TOOL = `import Carbon
import Foundation

func identifier(_ source: TISInputSource) -> String {
  guard let raw = TISGetInputSourceProperty(source, kTISPropertyInputSourceID) else { return "" }
  return Unmanaged<CFString>.fromOpaque(raw).takeUnretainedValue() as String
}
let arguments = CommandLine.arguments
if arguments.count == 2 && arguments[1] == "current" {
  print(identifier(TISCopyCurrentKeyboardInputSource().takeRetainedValue()))
  exit(0)
}
if arguments.count == 3 && arguments[1] == "select" {
  let filter = [kTISPropertyInputSourceID as String: arguments[2]] as CFDictionary
  guard let list = TISCreateInputSourceList(filter, false)?.takeRetainedValue() as? [TISInputSource],
    let source = list.first
  else { exit(2) }
  exit(TISSelectInputSource(source) == noErr ? 0 : 1)
}
exit(64)
`;

/** 只允许本机正式产物服务或正式 origin。 */
export function imeOrigin(env) {
  const value = env.AIAO_MEDIA_IME_ORIGIN ?? LOCAL_ORIGIN;
  if (value === 'https://media.aiao.io' || /^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(value)) return value;
  throw new Error('IME_ORIGIN_INVALID');
}

/** 把拼音字母映射为物理按键；不接受字母以外的输入，避免被当作直接文本发送。 */
export function pinyinKeys(text, pause = 0.08) {
  if (!/^[a-z]+$/.test(text)) throw new Error('IME_PINYIN_INVALID');
  return [...text].map(letter => ({ code: KEY_CODES[letter], pause }));
}

/** 生成按键脚本：每一批按键之前都核对前台进程，焦点离开受测浏览器立即中止。 */
export function keyScript(pid, actions) {
  if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('IME_BROWSER_PID_INVALID');
  const lines = actions.map(({ code, modifiers = [], pause = 0.08 }) => {
    if (!Number.isInteger(code) || code < 0 || code > 127) throw new Error('IME_KEY_INVALID');
    const using = modifiers.length ? ` using {${modifiers.map(modifier => `${modifier} down`).join(', ')}}` : '';
    return `  key code ${code}${using}\n  delay ${pause}`;
  });
  return [
    'tell application "System Events"',
    `  if (unix id of first application process whose frontmost is true) is not ${pid} then error "IME_FOCUS_LOST"`,
    ...lines,
    'end tell'
  ].join('\n');
}

/** 系统输入法提交的文字只来自 compositionend。 */
export function compositionSummary(log) {
  const commits = log.filter(entry => entry.type === 'compositionend').map(entry => entry.data ?? '');
  return {
    sessions: log.filter(entry => entry.type === 'compositionstart').length,
    commits,
    committed: commits.join('')
  };
}

/** 连续两个以上拉丁字母说明拼音编码残留在内容里。 */
export function hasPinyinResidue(text) {
  return /[a-z]{2,}/i.test(text);
}

function check(name, passed, observed) {
  return observed === undefined ? { name, passed: Boolean(passed) } : { name, passed: Boolean(passed), observed };
}

async function osascript(script) {
  const { stdout } = await execute('osascript', ['-e', script]);
  return stdout.trim();
}

async function frontmostPid() {
  return Number(
    await osascript(
      'tell application "System Events" to get unix id of first application process whose frontmost is true'
    )
  );
}

async function bringToFront(pid) {
  await osascript(
    `tell application "System Events" to set frontmost of (first application process whose unix id is ${pid}) to true`
  );
  for (let attempt = 0; attempt < 20 && (await frontmostPid()) !== pid; attempt++)
    await new Promise(done => setTimeout(done, 100));
  if ((await frontmostPid()) !== pid) throw new Error('IME_FOCUS_LOST');
}

async function inputSourceTool(directory) {
  const source = resolve(directory, 'input-source.swift');
  const binary = resolve(
    directory,
    'input-source-' + createHash('sha256').update(INPUT_SOURCE_TOOL).digest('hex').slice(0, 12)
  );
  if (!existsSync(binary)) {
    await writeFile(source, INPUT_SOURCE_TOOL, { mode: 0o600 });
    await execute('xcrun', ['swiftc', '-O', '-o', binary, source]);
  }
  return {
    current: async () => (await execute(binary, ['current'])).stdout.trim(),
    select: async id => {
      await execute(binary, ['select', id]);
    }
  };
}

async function clipboard() {
  const env = { ...process.env, LANG: 'en_US.UTF-8' };
  return {
    read: async () => (await execute('pbpaste', [], { env })).stdout,
    write: text =>
      new Promise((done, fail) => {
        const child = spawn('pbcopy', [], { env, stdio: ['pipe', 'ignore', 'ignore'] });
        child.on('error', fail);
        child.on('exit', code => (code === 0 ? done() : fail(new Error('IME_CLIPBOARD_FAILED'))));
        child.stdin.end(text, 'utf8');
      })
  };
}

async function waitForOrigin(origin, attempts = 120) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const ready = await fetch(origin + '/create').then(
      response => response.ok,
      () => false
    );
    if (ready) return;
    await new Promise(done => setTimeout(done, 250));
  }
  throw new Error('IME_SERVER_UNAVAILABLE');
}

function startLocalServer(origin) {
  const port = new URL(origin).port;
  const server = spawn(
    'pnpm',
    [
      'exec',
      'wrangler',
      'dev',
      '--config',
      'deploy/wrangler.json',
      '--local',
      '--port',
      port,
      '--show-interactive-dev-session',
      'false'
    ],
    { cwd: resolve(import.meta.dirname, '../../aiao-media'), detached: true, stdio: 'ignore' }
  );
  return {
    close: () => {
      try {
        process.kill(-server.pid, 'SIGTERM');
      } catch {
        // 进程组已退出。
      }
    }
  };
}

async function browserPid() {
  const { stdout } = await execute('ps', ['-A', '-o', 'pid=,ppid=,command=']);
  const row = stdout
    .split('\n')
    .map(line => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .find(match => match && Number(match[2]) === process.pid && match[3].includes('/Contents/MacOS/Google Chrome'));
  if (!row) throw new Error('IME_BROWSER_PID_UNAVAILABLE');
  return Number(row[1]);
}

/** 只观察系统输入法派发的事件，不调用 preventDefault，也不合成任何事件。 */
function observeInput() {
  const log = [];
  Object.defineProperty(window, '__aiaoImeLog', { value: log });
  const describe = element => {
    if (!(element instanceof Element)) return null;
    return element.id ? '#' + element.id : (element.getAttribute('aria-label') ?? element.tagName.toLowerCase());
  };
  for (const type of ['compositionstart', 'compositionupdate', 'compositionend'])
    window.addEventListener(type, event => log.push({ type, data: event.data, target: describe(event.target) }), true);
  window.addEventListener(
    'beforeinput',
    event =>
      log.push({
        type: 'beforeinput',
        inputType: event.inputType,
        composing: event.isComposing,
        target: describe(event.target)
      }),
    true
  );
  for (const type of ['focusin', 'focusout'])
    window.addEventListener(type, event => log.push({ type, target: describe(event.target) }), true);
}

function readPage() {
  const editor = document.querySelector('#image-prompt');
  const bounds = editor?.getBoundingClientRect();
  const inputs = [...document.querySelectorAll('.prompt-field input')];
  const active = document.activeElement;
  const root = document.documentElement;
  return {
    final: document.querySelector('pre[aria-label="最终提示词预览"]')?.textContent ?? null,
    fields: Object.fromEntries(inputs.map(input => [input.getAttribute('aria-label'), input.value])),
    markup: editor ? editor.querySelectorAll('b, i, strong, em, a, img, script').length : null,
    active:
      active?.id ? '#' + active.id : (active?.getAttribute('aria-label') ?? active?.tagName.toLowerCase() ?? null),
    windowFocused: document.hasFocus(),
    draft: document.querySelector('.draft-status')?.textContent?.trim() ?? null,
    overflow: {
      page: root.scrollWidth - root.clientWidth,
      editor: editor ? editor.scrollWidth - editor.clientWidth : null,
      fieldsOutside:
        bounds ?
          inputs.filter(input => {
            const rect = input.getBoundingClientRect();
            return rect.left < bounds.left - 1 || rect.right > bounds.right + 1;
          }).length
        : null
    },
    log: window.__aiaoImeLog.splice(0)
  };
}

async function waitForDraftSaved(page) {
  await page.waitForFunction(
    () => document.querySelector('.draft-status')?.textContent?.trim() === '输入已保存到本机',
    undefined,
    { timeout: 10000 }
  );
}

async function openPreview(page) {
  const preview = page.locator('pre[aria-label="最终提示词预览"]');
  if (!(await preview.isVisible())) await page.getByRole('button', { name: '预览最终提示词' }).click();
  await preview.waitFor();
}

function layoutChecks(state) {
  return [
    check('页面无横向溢出', state.overflow.page <= 1, state.overflow.page),
    check('编辑器无横向溢出', state.overflow.editor !== null && state.overflow.editor <= 1, state.overflow.editor),
    check('参数输入框未超出编辑器', state.overflow.fieldsOutside === 0, state.overflow.fieldsOutside)
  ];
}

function focusChecks(state, expected, log) {
  return [
    check('焦点保持在输入位置', state.active === expected, state.active),
    check('浏览器窗口保持系统焦点', state.windowFocused),
    check(
      '输入期间没有失焦',
      !log.some(entry => entry.type === 'focusout' && entry.target === expected),
      log.filter(entry => entry.type === 'focusout').map(entry => entry.target)
    )
  ];
}

async function sampleDraft(page, milliseconds) {
  const samples = [];
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 100) {
    const draft = await page.evaluate(() => document.querySelector('.draft-status')?.textContent?.trim() ?? null);
    if (samples.at(-1) !== draft) samples.push(draft);
    await page.waitForTimeout(100);
  }
  return samples;
}

async function bodyInput(context) {
  const { page, press } = context;
  await page.locator('#image-prompt').click();
  await page.evaluate(() => window.__aiaoImeLog.splice(0));
  await press([...pinyinKeys('nihao'), SPACE, ...pinyinKeys('shijie'), SPACE]);
  await page.waitForTimeout(800);
  const state = await page.evaluate(readPage);
  const ime = compositionSummary(state.log);
  context.body = state.final;
  return {
    id: 'body-ime',
    checks: [
      check('两段拼音各产生一次系统组字', ime.sessions === 2 && ime.commits.length === 2, ime.commits),
      check(
        '提交内容为中文',
        ime.commits.every(text => /^[一-鿿]+$/.test(text)),
        ime.commits
      ),
      check('最终提示词与输入法提交一致，不丢字不重字', state.final === ime.committed, state.final),
      ...focusChecks(state, '#image-prompt', state.log),
      ...layoutChecks(state)
    ]
  };
}

async function bodyAutosave(context) {
  const { page, press } = context;
  const before = context.body;
  await press(pinyinKeys('zhong'));
  const samples = await sampleDraft(page, 1500);
  await press([...pinyinKeys('guo'), SPACE]);
  await page.waitForTimeout(500);
  await waitForDraftSaved(page);
  const state = await page.evaluate(readPage);
  const ime = compositionSummary(state.log);
  context.body = state.final;
  return {
    id: 'body-ime-across-autosave',
    draftDuringComposition: samples,
    checks: [
      check('停顿 1.5 秒仍是同一次组字', ime.sessions === 1 && ime.commits.length === 1, ime.commits),
      check('组字结果追加在原文之后', state.final === before + ime.committed, state.final),
      check('没有拼音残留', !hasPinyinResidue(state.final ?? ''), state.final),
      check('组字结束后草稿已保存', state.draft === '输入已保存到本机', state.draft),
      ...focusChecks(state, '#image-prompt', state.log),
      ...layoutChecks(state)
    ]
  };
}

async function bodyPaste(context) {
  const { page, press, clip } = context;
  const before = context.body;
  const text = '粘贴：{{产品}} <b>不是标签</b>';
  await clip.write(text);
  await press([PASTE]);
  const state = await page.evaluate(readPage);
  context.beforePaste = before;
  context.body = state.final;
  return {
    id: 'body-paste',
    checks: [
      check('粘贴内容按纯文字追加', state.final === before + text, state.final),
      check('花括号没有变成参数', Object.keys(state.fields).length === 0, Object.keys(state.fields)),
      check('HTML 没有变成格式', state.markup === 0, state.markup),
      ...focusChecks(state, '#image-prompt', state.log),
      ...layoutChecks(state)
    ]
  };
}

async function finalText(page) {
  return page.evaluate(() => document.querySelector('pre[aria-label="最终提示词预览"]')?.textContent ?? null);
}

async function stepUntil(context, action, target) {
  const visited = [];
  for (let step = 0; step < 12; step++) {
    const current = await finalText(context.page);
    visited.push(current);
    if (current === target) return visited;
    await context.press([action]);
  }
  visited.push(await finalText(context.page));
  return visited;
}

async function bodyUndo(context) {
  const { page, press } = context;
  const full = context.body;
  await press([UNDO]);
  const undone = await finalText(page);
  await press([REDO]);
  const redone = await finalText(page);
  const down = await stepUntil(context, UNDO, '');
  const up = await stepUntil(context, REDO, full);
  const state = await page.evaluate(readPage);
  return {
    id: 'body-undo-redo',
    checks: [
      check('撤销一次撤掉整段粘贴', undone === context.beforePaste, undone),
      check('重做一次恢复粘贴', redone === full, redone),
      check('连续撤销回到空白', down.at(-1) === '', down.length),
      check('连续重做回到完整内容', up.at(-1) === full, up.length),
      check(
        '撤销重做的中间状态没有拼音残留',
        ![...down, ...up].some(text => hasPinyinResidue((text ?? '').replace('<b>', '').replace('</b>', ''))),
        [...down, ...up]
      ),
      ...focusChecks(state, '#image-prompt', state.log),
      ...layoutChecks(state)
    ]
  };
}

async function applyTemplate(page) {
  await page.getByRole('link', { name: '发现灵感', exact: true }).click();
  await page.getByRole('button', { name: TEMPLATE, exact: true }).click();
  page.once('dialog', dialog => void dialog.accept());
  await page.getByRole('button', { name: '用这个灵感创作' }).click();
  await page.getByRole('textbox', { name: '模板参数：产品' }).waitFor();
  await openPreview(page);
}

async function fieldInput(context) {
  const { page, press } = context;
  await applyTemplate(page);
  const product = page.getByRole('textbox', { name: '模板参数：产品' });
  const initial = await product.inputValue();
  await product.click();
  await page.evaluate(() => window.__aiaoImeLog.splice(0));
  await press([SELECT_ALL, ...pinyinKeys('natie'), SPACE]);
  const typed = await page.evaluate(readPage);
  const ime = compositionSummary(typed.log);
  const value = typed.fields['模板参数：产品'];
  await press([UNDO]);
  const undone = await product.inputValue();
  await press([REDO]);
  const state = await page.evaluate(readPage);
  const log = [...typed.log, ...state.log];
  return {
    id: 'field-ime-undo-redo',
    checks: [
      check('字段内一次系统组字', ime.sessions === 1 && ime.commits.length === 1, ime.commits),
      check('字段值与输入法提交一致', value === ime.committed && /^[一-鿿]+$/.test(value), value),
      check('最终提示词展开字段值', typed.final?.includes('主体是' + value + '，'), typed.final),
      check('撤销回到模板默认值', undone === initial, undone),
      check('重做恢复输入法提交的值', state.fields['模板参数：产品'] === value, state.fields['模板参数：产品']),
      ...focusChecks(state, '模板参数：产品', log),
      ...layoutChecks(state)
    ]
  };
}

async function fieldAutosaveAndPaste(context) {
  const { page, press, clip } = context;
  const headline = page.getByRole('textbox', { name: '模板参数：标题' });
  await headline.click();
  await page.evaluate(() => window.__aiaoImeLog.splice(0));
  await press([SELECT_ALL, ...pinyinKeys('zao')]);
  const samples = await sampleDraft(page, 1500);
  await press([...pinyinKeys('an'), SPACE]);
  await waitForDraftSaved(page);
  const typed = await page.evaluate(readPage);
  const ime = compositionSummary(typed.log);
  const value = typed.fields['模板参数：标题'];
  const pasted = '「粘贴」{{标题}}<b>字段</b>';
  await clip.write(pasted);
  await press([SELECT_ALL, PASTE]);
  await waitForDraftSaved(page);
  const state = await page.evaluate(readPage);
  context.final = state.final;
  context.fields = state.fields;
  return {
    id: 'field-ime-across-autosave-and-paste',
    draftDuringComposition: samples,
    checks: [
      check('停顿 1.5 秒仍是同一次组字', ime.sessions === 1 && ime.commits.length === 1, ime.commits),
      check('字段值与输入法提交一致', value === ime.committed && /^[一-鿿]+$/.test(value), value),
      check('最终提示词展开字段值', typed.final?.includes('「' + value + '」'), typed.final),
      check('字段粘贴按纯文字保存', state.fields['模板参数：标题'] === pasted, state.fields['模板参数：标题']),
      check('字段粘贴没有新增参数', Object.keys(state.fields).length === 2, Object.keys(state.fields)),
      check('最终提示词原样包含粘贴文字', state.final?.includes('「' + pasted + '」'), state.final),
      ...focusChecks(state, '模板参数：标题', [...typed.log, ...state.log]),
      ...layoutChecks(state)
    ]
  };
}

async function reloadRestore(context) {
  const { page } = context;
  await page.reload();
  await page.locator('#image-prompt').waitFor();
  await page.waitForFunction(() => document.querySelector('.draft-status')?.textContent?.trim() === '输入已保存到本机');
  await openPreview(page);
  const state = await page.evaluate(readPage);
  return {
    id: 'reload-restore',
    checks: [
      check('刷新后最终提示词不变', state.final === context.final, state.final),
      check('刷新后字段值不变', JSON.stringify(state.fields) === JSON.stringify(context.fields), state.fields)
    ]
  };
}

async function sourceIdentity() {
  const root = resolve(import.meta.dirname, '../../..');
  const commit = (await execute('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim();
  const dirty = Boolean((await execute('git', ['status', '--porcelain'], { cwd: root })).stdout.trim());
  return { commit, dirty };
}

async function manifestSha256(origin) {
  const response = await fetch(origin + '/offline-manifest.json');
  if (!response.ok) throw new Error('IME_MANIFEST_UNAVAILABLE');
  return createHash('sha256')
    .update(new Uint8Array(await response.arrayBuffer()))
    .digest('hex');
}

/** 在真实 Chrome 与系统简体拼音上验收正文/字段输入、粘贴、撤销重做、焦点与布局。 */
export async function runDesktopImeAcceptance(origin, directory) {
  if (process.platform !== 'darwin') throw new Error('IME_MACOS_REQUIRED');
  const tool = await inputSourceTool(directory);
  const clip = await clipboard();
  const originalSource = await tool.current();
  const originalClipboard = await clip.read();
  const originalFront = await frontmostPid();
  const profile = await mkdtemp(resolve(tmpdir(), 'aiao-media-ime-'));
  const server = origin === LOCAL_ORIGIN ? startLocalServer(origin) : null;
  const evidence = {
    version: 1,
    startedAt: new Date().toISOString(),
    origin,
    source: await sourceIdentity(),
    keyboard: 'System Events 物理键码 → macOS 简体拼音',
    inputSource: PINYIN_INPUT_SOURCE,
    scenarios: []
  };
  let browser;
  try {
    await waitForOrigin(origin);
    evidence.manifestSha256 = await manifestSha256(origin);
    evidence.macos = (await execute('sw_vers', ['-productVersion'])).stdout.trim();
    browser = await chromium.launchPersistentContext(profile, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1280, height: 800 }
    });
    await browser.addInitScript(observeInput);
    evidence.browser = 'Google Chrome ' + (browser.browser()?.version() ?? 'unknown');
    const page = browser.pages()[0] ?? (await browser.newPage());
    await page.goto(origin + '/create');
    await page.locator('#image-prompt').waitFor();
    await page.waitForFunction(() =>
      /输入(会自动保存|已保存)到本机/.test(document.querySelector('.draft-status')?.textContent ?? '')
    );
    await openPreview(page);
    const pid = await browserPid();
    await bringToFront(pid);
    await tool.select(PINYIN_INPUT_SOURCE);
    if ((await tool.current()) !== PINYIN_INPUT_SOURCE) throw new Error('IME_INPUT_SOURCE_UNAVAILABLE');
    const press = actions => osascript(keyScript(pid, actions));
    const context = { page, press, clip };
    for (const scenario of [
      bodyInput,
      bodyAutosave,
      bodyPaste,
      bodyUndo,
      fieldInput,
      fieldAutosaveAndPaste,
      reloadRestore
    ]) {
      const result = await scenario(context);
      result.passed = result.checks.every(item => item.passed);
      evidence.scenarios.push(result);
      await page.screenshot({ path: resolve(directory, result.id + '.png') });
    }
  } catch (error) {
    evidence.error = /^IME_[A-Z_]+$/.test(error?.message) ? error.message : 'IME_RUN_FAILED';
    evidence.errorDetail = String(error?.message ?? error).slice(0, 300);
  } finally {
    await tool.select(originalSource).catch(() => undefined);
    await clip.write(originalClipboard).catch(() => undefined);
    await browser?.close();
    server?.close();
    await rm(profile, { recursive: true, force: true });
    await bringToFront(originalFront).catch(() => undefined);
  }
  evidence.finishedAt = new Date().toISOString();
  evidence.passed = !evidence.error && evidence.scenarios.length === 7 && evidence.scenarios.every(item => item.passed);
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const directory = resolve(import.meta.dirname, '../tmp/desktop-ime', String(Date.now()));
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  const evidence = await runDesktopImeAcceptance(imeOrigin(process.env), directory);
  const file = resolve(directory, 'evidence.json');
  await writeFile(file, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  console.log(
    JSON.stringify({
      passed: evidence.passed,
      error: evidence.error ?? null,
      scenarios: evidence.scenarios.map(item => ({ id: item.id, passed: item.passed })),
      evidence: file
    })
  );
  if (!evidence.passed) process.exitCode = 1;
}
