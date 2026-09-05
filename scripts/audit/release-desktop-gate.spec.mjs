import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { extractJob, extractSteps } from './release-desktop-gate.mjs';

/**
 * US-905 AC#17：三平台 dev/release 构建里开关调试窗口的门禁**确实接在了发布链路上**。
 *
 * @remarks
 * 为什么这条检查落在 `scripts/`（PR 门禁的 `pnpm test-scripts`）而不是
 * `apps/dev-rxdb-tauri-e2e/src/`：那个目录下的 `*.spec.ts` 会被 `vitest.smoke.mts` 的
 * `src/**` 收进 `desktop-smoke`，而 `desktop-smoke` 只在发布链路上跑。把「门禁是否存在」
 * 的判据放进只有发布才跑的套件里，等于让「删掉这一步」的 PR 全绿通过——判据自己被判据
 * 保护的那件事挡在了外面。
 *
 * 这里只证**接线**，不证三平台真的跑通：后者只有 GitHub 托管的三种 runner 才给得出，
 * 本文件在任何机器上都能跑。`release-desktop.yml` 自带 `pull_request.paths` 触发，
 * 改动这份 workflow 的 PR 上会有一次真实的三平台运行——那是 AC#17 的另一半。
 */

/** `.github/workflows/release-desktop.yml` 按行拆开。 */
const workflow = readFileSync(
  path.join(import.meta.dirname, '..', '..', '.github', 'workflows', 'release-desktop.yml'),
  'utf8'
).split('\n');

/** `tauri-smoke` job 的正文。 */
const tauriSmoke = extractJob(workflow, 'tauri-smoke');

/** 跑 devtools-smoke 的那一步；找不到就是 AC#17 的门禁根本不存在。 */
const devtoolsStep = extractSteps(tauriSmoke).find(step =>
  step.some(line => line.includes('dev-rxdb-tauri-e2e:devtools-smoke'))
);

test('extractJob 只取该 job 的正文，到下一个 job 为止', () => {
  const lines = ['jobs:', '  a:', '    runs-on: x', '', '    steps: []', '  b:', '    runs-on: y'];

  assert.deepEqual(extractJob(lines, 'a'), ['    runs-on: x', '', '    steps: []']);
});

test('extractJob 找不到 job 时抛错 —— 静默返回空数组会让下游断言全部变成真空真', () => {
  assert.throws(() => extractJob(['jobs:', '  a:', '    runs-on: x'], 'missing'), /missing/);
});

test('extractSteps 按列表项切分，每一步带上自己的键', () => {
  const job = ['    steps:', '      - name: one', '        run: echo 1', '      - name: two', '        run: echo 2'];

  assert.deepEqual(extractSteps(job), [
    ['      - name: one', '        run: echo 1'],
    ['      - name: two', '        run: echo 2']
  ]);
});

test('extractSteps 在没有 steps: 的 job 上返回空数组', () => {
  assert.deepEqual(extractSteps(['    uses: ./.github/workflows/ci-template.yml']), []);
});

test('AC#17：tauri-smoke 在三平台上跑 devtools-smoke', () => {
  assert.notEqual(devtoolsStep, undefined, 'tauri-smoke 里没有跑 devtools-smoke 的步骤');

  // 三个 OS 一个都不能少：AC#17 要的是**矩阵**，少一列就只是「某一个平台上能开调试窗口」。
  for (const os of ['ubuntu-latest', 'macos-latest', 'windows-latest']) {
    assert.ok(
      tauriSmoke.some(line => line.includes(os)),
      `tauri-smoke 的矩阵里缺 ${os}`
    );
  }
});

test('AC#17：devtools 那一步不会被同 job 里前一步的失败跳过', () => {
  // 默认语义是「前一步失败就跳过后续步骤」。desktop-smoke 排在前面，它一红，
  // devtools-smoke 就整个不跑，而 job 只报一个红——三平台矩阵里因此会缺掉
  // 「调试窗口在这个平台上到底行不行」的结论，且缺得毫无痕迹。
  assert.ok(
    devtoolsStep?.some(line => /if:\s*\$\{\{\s*!cancelled\(\)\s*\}\}/.test(line)),
    'devtools-smoke 步骤缺 `if: ${{ !cancelled() }}`'
  );
});

test('AC#17：tauri-smoke 的 timeout 给到 90 分钟以上', () => {
  const declared = tauriSmoke.find(line => line.includes('timeout-minutes:'));
  const minutes = Number(declared?.split(':')[1]);

  // 这个 job 现在要冷编译**两份** Rust 产物（release + dev debug，profile 不同不共享），
  // Windows 上单份实测就是 20-30 分钟。原来的 60 是给一份用的下界。
  assert.ok(minutes >= 90, `tauri-smoke 的 timeout-minutes 是 ${String(minutes)}，两份冷编译不够`);
});

test('AC#17：WEBKIT_DISABLE_DMABUF_RENDERER 设在 job 级，两步都盖得到', () => {
  const stepIndents = extractSteps(tauriSmoke).flat();
  const atJobLevel = tauriSmoke.filter(
    line => line.includes('WEBKIT_DISABLE_DMABUF_RENDERER') && !stepIndents.includes(line)
  );

  // 只设在某一步上时，另一步在 Xvfb 下会白屏——而白屏的表征与「应用真有 bug」不可区分。
  assert.equal(atJobLevel.length, 1, 'WEBKIT_DISABLE_DMABUF_RENDERER 不在 job 级 env 上');
});

test('AC#17：高成本打包 smoke 只在 release / 手动 / 改本文件的 PR 上触发', () => {
  const triggers = extractJob(workflow, 'on');

  assert.ok(
    triggers.some(line => line.trimStart().startsWith('release:')),
    '缺 release 触发'
  );
  // 裸 `push:` 会把三平台冷编译挂到每一次推送上；`pull_request:` 必须带 paths 收窄到
  // 本 workflow 自身，否则每个 PR 都要付这份墙钟。
  assert.ok(!triggers.some(line => line.trimStart().startsWith('push:')), '不该有 push 触发');
  const pullRequest = triggers.findIndex(line => line.trimStart().startsWith('pull_request:'));
  assert.ok(
    pullRequest === -1 || triggers.slice(pullRequest).some(line => line.trimStart().startsWith('paths:')),
    'pull_request 触发缺 paths 收窄'
  );
});
