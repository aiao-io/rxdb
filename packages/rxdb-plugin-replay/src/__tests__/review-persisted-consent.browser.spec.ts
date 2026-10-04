import type { RxDB } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { ReplayEventRecord } from '../entities.js';
import { rxDBPluginReplay } from '../plugin.js';
import { createAppDb, createRecordingDbFactory } from './fixtures/dbs.js';

const apps: RxDB[] = [];
const roots: HTMLElement[] = [];
const SECRET = 'review-consent-secret';

async function createRecording(maskAllInputs?: boolean) {
  const recording = createRecordingDbFactory();
  const app = createAppDb();
  apps.push(app);
  app.use(rxDBPluginReplay, {
    createRecordingDb: recording.factory,
    flush: { intervalMs: 60_000, maxEvents: 1_000 },
    record: maskAllInputs === undefined ? undefined : { maskAllInputs }
  });
  await app.connect('pglite');
  const root = document.createElement('section');
  root.innerHTML = '<label>Review input <input type="text" /></label>';
  document.body.append(root);
  roots.push(root);
  const input = root.querySelector('input');
  if (!input) throw new Error('review fixture input is missing');
  return { app, recording, input };
}

afterEach(async () => {
  for (const app of apps.splice(0)) await app.destroy();
  for (const root of roots.splice(0)) root.remove();
});

describe('评审：真实 rrweb 与录制库的同意/脱敏边界', () => {
  it('显式 start 前不建录制库，默认脱敏写入数据库，stop 后不再增加事件', async () => {
    const { app, recording, input } = await createRecording();
    await userEvent.type(input, 'before-consent');
    expect(recording.created).toHaveLength(0);
    const sessionId = await app.replay.start();
    await userEvent.clear(input);
    await userEvent.type(input, SECRET);
    await app.replay.stop();
    const events = await app.replay.readEvents(sessionId);
    expect(events.length).toBeGreaterThan(2);
    expect(recording.created).toHaveLength(1);
    expect(recording.created[0]).not.toBe(app);
    const adapter = await firstValueFrom(recording.created[0]!.localAdapter$);
    const rows = await adapter.transaction(
      executor =>
        executor.getRepository(ReplayEventRecord).find({
          where: { combinator: 'and', rules: [{ field: 'sessionId', operator: '=', value: sessionId }] }
        }),
      false
    );
    const persisted = JSON.stringify(rows.map(row => row.data));
    expect(persisted).not.toContain(SECRET);
    expect(persisted).toContain('*'.repeat(SECRET.length));
    await userEvent.type(input, 'after-stop');
    expect(await app.replay.readEvents(sessionId)).toEqual(events);
  });

  it('对照：显式关闭 maskAllInputs 时，同一真实存储链路确实收到输入内容', async () => {
    const { app, recording, input } = await createRecording(false);
    const sessionId = await app.replay.start();
    await userEvent.type(input, SECRET);
    await app.replay.stop();
    const adapter = await firstValueFrom(recording.created[0]!.localAdapter$);
    const rows = await adapter.transaction(
      executor =>
        executor.getRepository(ReplayEventRecord).find({
          where: { combinator: 'and', rules: [{ field: 'sessionId', operator: '=', value: sessionId }] }
        }),
      false
    );
    expect(JSON.stringify(rows.map(row => row.data))).toContain(SECRET);
  });
});
