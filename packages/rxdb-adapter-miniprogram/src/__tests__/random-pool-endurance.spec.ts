import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  MiniProgramFileSystemManager,
  MiniProgramRandomValuesOptions,
  MiniProgramWechatApi
} from '../mini-program.interface.js';
import {
  DEFAULT_MINI_PROGRAM_RANDOM_POOL_SIZE,
  MAX_MINI_PROGRAM_RANDOM_POOL_SIZE,
  prepareMiniProgramRuntime
} from '../runtime-polyfills.js';

const fileSystem = {} as MiniProgramFileSystemManager;

/**
 * 把整条随机流铸成「第 i 个字节 == i & 0xff」的计数器流。
 *
 * 这样消费端能逐字节反查自己拿到的是全局第几个字节：重复供给、跳号、被擦成零，
 * 三种故障都会当场偏离期望值，而不需要去窥探闭包里的 `offset`。
 */
function createCounterSource(deliver: (hand: () => void) => void): {
  readonly wechat: MiniProgramWechatApi;
  readonly pools: () => number;
  readonly peakInFlight: () => number;
} {
  let minted = 0;
  let pools = 0;
  let inFlight = 0;
  let peakInFlight = 0;
  const getRandomValues = (options: MiniProgramRandomValuesOptions): void => {
    const start = minted;
    minted += options.length;
    pools += 1;
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    deliver(() => {
      inFlight -= 1;
      options.success?.({
        randomValues: Uint8Array.from({ length: options.length }, (_, index) => (start + index) & 0xff).buffer
      });
    });
  };
  return {
    wechat: { env: { USER_DATA_PATH: '/data' }, getFileSystemManager: () => fileSystem, getRandomValues },
    pools: () => pools,
    peakInFlight: () => peakInFlight
  };
}

/** 隔 `turns` 个宏任务轮次才交付，用来模拟 `wx.getRandomValues` 的桥接往返延迟。 */
function afterTurns(turns: number, hand: () => void): void {
  if (turns === 0) {
    hand();
    return;
  }
  setTimeout(() => afterTurns(turns - 1, hand), 0);
}

const nextTurn = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('随机池长跑', () => {
  it('连续供给 4 MiB 不耗尽，且每个字节都是新铸的', async () => {
    vi.stubGlobal('crypto', undefined);
    const mathRandom = vi.spyOn(Math, 'random');
    const source = createCounterSource(hand => hand());
    await prepareMiniProgramRuntime(source.wechat);

    // 旧的一次性池到 1 MiB 就永久报废，这里按 4 倍跑
    const totalBytes = 4 * MAX_MINI_PROGRAM_RANDOM_POOL_SIZE;
    const requestBytes = 16;
    const yieldEvery = 8_192;
    const target = new Uint8Array(requestBytes);
    let served = 0;
    let mismatches = 0;

    while (served < totalBytes) {
      globalThis.crypto.getRandomValues(target);
      for (let index = 0; index < requestBytes; index++) {
        if (target[index] !== ((served + index) & 0xff)) mismatches++;
      }
      served += requestBytes;
      if (served % yieldEvery === 0) await Promise.resolve();
    }

    expect(mismatches).toBe(0);
    // 多出来的那一池是跑完时已经补到手、还没开始用的备池
    expect(source.pools()).toBe(totalBytes / DEFAULT_MINI_PROGRAM_RANDOM_POOL_SIZE + 1);
    expect(mathRandom).not.toHaveBeenCalled();
  });

  it('桥接延迟内的消耗不超过水位余量时，跨池轮换全程无感', async () => {
    vi.stubGlobal('crypto', undefined);
    const poolBytes = 4_096;
    // 水位余量 = 4096 * 25% = 1024 字节，按 128 字节/轮能撑 8 轮，盖得住 6 轮的桥接往返
    const source = createCounterSource(hand => afterTurns(6, hand));
    await prepareMiniProgramRuntime(source.wechat, { randomPoolSize: poolBytes });

    const burst = new Uint8Array(128);
    for (let turn = 0; turn < poolBytes * 3; turn += burst.byteLength) {
      globalThis.crypto.getRandomValues(burst);
      await nextTurn();
    }

    expect(source.pools()).toBeGreaterThan(3);
    expect(source.peakInFlight()).toBe(1);
  });

  it('桥接延迟内的消耗超过水位余量时抛错，而不是悄悄发重复字节', async () => {
    vi.stubGlobal('crypto', undefined);
    // 同样 1024 字节余量，但每轮吃 512 字节：只撑得住 2 轮，6 轮的桥接往返追不上
    const source = createCounterSource(hand => afterTurns(6, hand));
    await prepareMiniProgramRuntime(source.wechat, { randomPoolSize: 4_096 });

    const burst = new Uint8Array(512);
    const drain = async (): Promise<void> => {
      for (let turn = 0; turn < 64; turn++) {
        globalThis.crypto.getRandomValues(burst);
        await nextTurn();
      }
    };

    await expect(drain()).rejects.toThrow('安全随机池已耗尽');
  });
});
