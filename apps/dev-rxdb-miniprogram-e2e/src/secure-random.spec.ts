import { expect, test } from './fixtures';
import { drawRandomValues, RANDOM_DRAW_REGISTRY_KEY, type RandomDrawReport } from './runtime-probes';

/** 默认随机池字节数，与 `DEFAULT_MINI_PROGRAM_RANDOM_POOL_SIZE` 对齐。 */
const POOL_SIZE = 65_536;

const BYTES_PER_DRAW = 16;

/** 一池之内能安全同步连发的取样数；留出引导期已消耗的余量，只取半池。 */
const WITHIN_POOL_DRAWS = POOL_SIZE / 2 / BYTES_PER_DRAW;

/** 一次跨池取样的批量与批次；两者相乘约两池，必然触发轮换。 */
const CROSS_POOL_DRAWS_PER_BATCH = POOL_SIZE / 4 / BYTES_PER_DRAW;
const CROSS_POOL_BATCHES = 8;

/** 一次同步内超出整池容量的取样数，用来验证耗尽路径。 */
const OVERDRAW_DRAWS = (POOL_SIZE / BYTES_PER_DRAW) * 2;

/**
 * 随机池在真实微信运行时上的行为。
 *
 * `random-pool-endurance.spec.ts` 已经用计数器桩证明了池的调度逻辑；这里换成真的
 * `wx.getRandomValues`，验的是单测证明不了的那一半：桥接往返的真实时序下，
 * 后台补给来不来得及、跨池轮换会不会发出重复或全零字节。
 */
test.describe('安全随机池', () => {
  test('单池之内同步连发不耗尽，且每次取样都不同', async ({ demoPage }) => {
    const report = await demoPage.evaluate(
      drawRandomValues,
      RANDOM_DRAW_REGISTRY_KEY,
      WITHIN_POOL_DRAWS,
      BYTES_PER_DRAW
    );

    expect(report.error).toBe('');
    expect(report.draws).toBe(WITHIN_POOL_DRAWS);
    expect(report.duplicates).toBe(0);
    expect(report.zeroDraws).toBe(0);
  });

  test('跨池轮换全程无重复、无全零字节', async ({ demoPage }) => {
    const reports: RandomDrawReport[] = [];
    // 分批的意义不在于减小单批体积，而在于**交还事件循环**：
    // 池的补给是异步的，同步路径不让位就永远等不到备池。
    // 两次 evaluate 之间的 WebSocket 往返正好提供了这个让位时机。
    for (let batch = 0; batch < CROSS_POOL_BATCHES; batch += 1) {
      reports.push(
        await demoPage.evaluate(drawRandomValues, RANDOM_DRAW_REGISTRY_KEY, CROSS_POOL_DRAWS_PER_BATCH, BYTES_PER_DRAW)
      );
    }

    const totalDraws = reports.reduce((sum, report) => sum + report.draws, 0);
    expect(reports.map(report => report.error)).toEqual(reports.map(() => ''));
    expect(totalDraws).toBe(CROSS_POOL_DRAWS_PER_BATCH * CROSS_POOL_BATCHES);
    // 取样总量约两池，中间必然发生过轮换；指纹表跨批次存活，重复会被抓到。
    expect(totalDraws * BYTES_PER_DRAW).toBeGreaterThan(POOL_SIZE);
    expect(reports.reduce((sum, report) => sum + report.duplicates, 0)).toBe(0);
    expect(reports.reduce((sum, report) => sum + report.zeroDraws, 0)).toBe(0);
  });

  test('一次同步超出整池容量时抛错，而不是发出弱随机', async ({ demoPage }) => {
    const report = await demoPage.evaluate(drawRandomValues, RANDOM_DRAW_REGISTRY_KEY, OVERDRAW_DRAWS, BYTES_PER_DRAW);

    // 这是铁律「宁可抛错也不降级」在真机上的样子：
    // 同步连发超过一池就是拿不到熵，此时唯一正确的行为是抛错。
    expect(report.error).toContain('安全随机池已耗尽');
    expect(report.draws).toBeLessThan(OVERDRAW_DRAWS);
    // 抛错之前发出去的那些字节必须仍然是合格的随机，不能是补零凑数的。
    expect(report.duplicates).toBe(0);
    expect(report.zeroDraws).toBe(0);
  });
});
