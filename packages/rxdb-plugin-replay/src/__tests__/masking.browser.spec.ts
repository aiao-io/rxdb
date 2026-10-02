/**
 * @fileoverview 脱敏默认（AC#16，research D6）：经 `resolveReplayOptions` 解析出的 `record` 选项交给真 rrweb，
 * 落库的事件里不能出现敏感原文。
 *
 * @remarks
 * 录制器接一个只收集批次的假落库端，断言直接看序列化后的事件——那就是写进录制库的字节。
 * 最后一条反证：显式关掉 `maskAllInputs` 时原文确实出现，说明前面的遮蔽来自默认值而不是别处。
 */

import { record } from 'rrweb';
import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { resolveReplayOptions, type RxDBReplayRecordOptions } from '../options.js';
import { ReplayRecorder } from '../recorder.js';
import type { ReplayEventEntry } from '../store.js';

const SECRET = 'secret-4242';

const fixtures: HTMLElement[] = [];

const mountFixture = (html: string): HTMLElement => {
  const root = document.createElement('section');
  root.innerHTML = html;
  document.body.append(root);
  fixtures.push(root);
  return root;
};

afterEach(() => {
  for (const root of fixtures.splice(0)) root.remove();
});

/** 用插件解析后的 `record` 选项录一段，`act` 里做页面操作，返回落库的事件 JSON。 */
const recordWith = async (recordOptions: RxDBReplayRecordOptions, act: () => Promise<void>) => {
  const resolved = resolveReplayOptions({
    createRecordingDb: () => {
      throw new Error('masking spec does not open a recording db');
    },
    record: recordOptions
  });
  const written: ReplayEventEntry[] = [];
  const recorder = new ReplayRecorder({
    sink: {
      appendBatch: async (_, entries) => {
        written.push(...entries);
        return { kind: 'written', nextSeq: written.length };
      },
      markStopped: async () => undefined
    },
    record,
    sessionId: 's1',
    nextSeq: 0,
    flush: { intervalMs: 50, maxEvents: 1000 },
    recordOptions: resolved.record,
    onEnd: end => {
      throw new Error(`recorder ended: ${end.kind}`);
    }
  });
  recorder.start();
  await act();
  await recorder.stop();
  return JSON.stringify(written.map(entry => entry.event));
};

const typeSecret = async (root: HTMLElement) => {
  const input = root.querySelector('input');
  if (!input) throw new Error('fixture has no input');
  await userEvent.type(input, SECRET);
};

describe('脱敏默认（AC#16）', () => {
  it('默认 maskAllInputs：输入的原文不进事件，落的是遮蔽字符', async () => {
    const root = mountFixture('<label>Card <input type="text" /></label>');

    const json = await recordWith({}, () => typeSecret(root));

    expect(json).not.toContain(SECRET);
    expect(json).toContain('*'.repeat(SECRET.length));
  });

  it('[data-rxdb-replay-block] 与 record.blockSelector 合并生效：两处内容都不进事件', async () => {
    const recordOptions = { blockSelector: '.app-private' };

    const json = await recordWith(recordOptions, async () => {
      mountFixture(
        `<div data-rxdb-replay-block>block-by-attr ${SECRET}</div><div class="app-private">block-by-app ${SECRET}</div>`
      );
      // 让 rrweb 的 MutationObserver 收到这批新增节点
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    expect(json).not.toContain('block-by-attr');
    expect(json).not.toContain('block-by-app');
    expect(json).not.toContain(SECRET);
    expect(json).toContain('"rr_width"');
  });

  it('maskTextSelector 透传：命中元素的文本被遮蔽', async () => {
    const json = await recordWith({ maskTextSelector: '.mask-me' }, async () => {
      mountFixture(`<p class="mask-me">${SECRET}</p>`);
      await new Promise(resolve => setTimeout(resolve, 20));
    });

    expect(json).not.toContain(SECRET);
  });

  it('反证：显式 maskAllInputs: false 时原文出现', async () => {
    const root = mountFixture('<label>Note <input type="text" /></label>');

    const json = await recordWith({ maskAllInputs: false }, () => typeSecret(root));

    expect(json).toContain(SECRET);
  });
});
