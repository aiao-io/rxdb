import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { describe, it } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { untilStopped } from './lifecycle.mjs';

describe('常驻脚本的生命周期', () => {
  it('启动者没变时一直运行；启动者消失（进程被系统收养）后停止，且只停一次', async () => {
    let parent = 4321;
    let stops = 0;
    const events = new EventEmitter();
    untilStopped(() => (stops += 1), { events, parent: 4321, currentParent: () => parent, pollMs: 5 });
    await delay(30);
    assert.equal(stops, 0);
    parent = 1;
    await delay(30);
    assert.equal(stops, 1);
    await delay(30);
    assert.equal(stops, 1);
    assert.equal(events.listenerCount('SIGTERM'), 0);
  });

  it('收到 SIGINT 或 SIGTERM 即停止，之后不再响应信号', () => {
    let stops = 0;
    const events = new EventEmitter();
    untilStopped(() => (stops += 1), { events, parent: 1, currentParent: () => 1, pollMs: 1000 });
    events.emit('SIGTERM');
    events.emit('SIGINT');
    assert.equal(stops, 1);
    assert.equal(events.listenerCount('SIGINT'), 0);
    assert.equal(events.listenerCount('SIGTERM'), 0);
  });

  it('返回的函数可以主动停止', () => {
    let stops = 0;
    const events = new EventEmitter();
    const stop = untilStopped(() => (stops += 1), { events, parent: 1, currentParent: () => 1, pollMs: 1000 });
    stop();
    stop();
    assert.equal(stops, 1);
  });
});
