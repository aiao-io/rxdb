/**
 * fake 档的固定 provider 装配（US-905 阶段 1 AC#2）。
 *
 * @remarks
 * `DEV_RXDB_DEVTOOLS_PROVIDER_SOURCE=fake` 时，连接器不再装配真实桌面后端，而是把这一组
 * fake provider 当作整份 registry 注入（`providerRegistry` 注入口）。档位矩阵——源档、
 * snapshot 场景、VFS 强制——全部由 Rust 侧的 env 面控制，这里剩下的每个值因此都是
 * AC#2 / AC#6 判据的**固定前提**，不做成可配置：
 *
 * 1. **descriptors 镜像真实档**（database: rxdb / files: native-files / settings: sqlite，
 *    runtime: tauri，限额同 `DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT`）：五类操作在 fake 上走查，
 *    面板看到的能力面与真实档一致，差别只在行为注入。
 * 2. **`database.inspect` 注入平台失败**（rust `NotConnected` → `provider_unavailable`）：
 *    驱动走查时报告的是**映射码**，证明 fake 集合上的错误也走共享映射，不是编一个码了事。
 * 3. **播种三个文件**：`/db.sqlite` 与 `/notes/a.md` 供 list 断言，`/drv-bytes.bin`（700 字节）
 *    供三块上传与按 `requestId` 下载——700 不是整块大小，块序错乱时断言必然红。
 * 4. **snapshot 源与时钟按场景给**（ok / busy / expired / too_large）：状态机本体是共享包的
 *    `DevToolsSnapshotStore`，这里只换物化来源——busy 恒 invalidated、too_large 超上限；
 *    expired 换的是**时钟**：cursor idle 一挂上就到期，首页交付后快照立即释放，同 cursor
 *    的下一次翻页答 `snapshot_expired`，不必像真实档那样双开。
 *
 * AC#13 的回显禁令在这里同样生效：驱动只报结果码与计数，本模块不向报告回传路径、
 * 记录、快照 ID 或字节内容。
 */
import {
  DEVTOOLS_MAX_SNAPSHOT_RECORDS,
  DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT,
  DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS,
  createSystemClock,
  type DevToolsClock,
  type DevToolsSnapshotCaptureResult,
  type DevToolsSnapshotRecord,
  type DevToolsSnapshotSource
} from '@aiao/rxdb-devtools';
import { createFakeProviders, type DevToolsFakeProviderSet } from '@aiao/rxdb-devtools/testing-providers';
import type { DevToolsSnapshotScenario } from './devtools-runtime-config';

/** ok / expired 场景共用的合成快照：120 条，默认页大小（100）下恰好两页。 */
const OK_RECORDS: readonly DevToolsSnapshotRecord[] = Array.from(
  { length: 120 },
  (_, index): DevToolsSnapshotRecord => ['meta', `/m/${index}`, `id-${index}`, 1, 'v1']
);

/**
 * 按场景合成快照物化来源。
 *
 * @remarks
 * 记录内容与真实文件无关——驱动只走查分页行为与错误码，不比对记录内容。`too_large` 的
 * 10 万零 1 条只在它自己的场景里造，不为 ok 档的每次装配买单。
 */
const createScenarioSource = (scenario: DevToolsSnapshotScenario): DevToolsSnapshotSource => {
  const tooLarge =
    scenario === 'too_large' ?
      Array.from({ length: DEVTOOLS_MAX_SNAPSHOT_RECORDS + 1 }, (_, index): DevToolsSnapshotRecord => [
        'meta',
        `/m/${index}`,
        `id-${index}`,
        1,
        'v1'
      ])
    : undefined;

  return {
    async capture(): Promise<DevToolsSnapshotCaptureResult> {
      // busy：恒 invalidated，epoch 重试（共享 store 的逻辑）耗尽后收敛成 snapshot_busy。
      if (scenario === 'busy') return { outcome: 'invalidated' };
      return { outcome: 'captured', records: tooLarge ?? OK_RECORDS };
    }
  };
};

/**
 * 按场景给快照仓库的时钟。
 *
 * @remarks
 * expired 场景缩短 cursor idle：物化照常交付首页，idle 计时器一挂上就到期，快照随即被
 * 释放——同 cursor 的下一次翻页拿到 `snapshot_expired`，不必像真实档那样双开。计时器按
 * 时长区分（idle 60 s / deadline 15 s，两值互异）：deadline 必须照常走，它提前到期会把
 * open() 打成 `snapshot_busy`，档位就串了。这是 fake 装配面的模拟语义，store 本体不动。
 */
const createScenarioClock = (scenario: DevToolsSnapshotScenario): DevToolsClock => {
  if (scenario !== 'expired') return createSystemClock();
  return {
    now: () => Date.now(),
    setTimeout: (handler, delayMs) => {
      const delay = delayMs === DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS ? 0 : delayMs;
      const timer = setTimeout(handler, delay);
      return () => clearTimeout(timer);
    }
  };
};

/**
 * 装配 fake 档的 provider registry。
 *
 * @param scenario - 本次运行的 snapshot 场景档（ok / busy / expired / too_large）
 * @returns 结构上即 `DevToolsProviderRegistry` 的 fake 集合，可直接经
 *   `providers.providerRegistry` 交给连接器
 */
export function createFakeProviderGear(scenario: DevToolsSnapshotScenario): DevToolsFakeProviderSet {
  return createFakeProviders({
    runtime: 'tauri',
    kinds: { database: 'rxdb', files: 'native-files', settings: 'sqlite' },
    maxTransferBytes: DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT,
    failures: {
      'database.inspect': { origin: 'rust', error: { kind: 'NotConnected' } }
    },
    files: { '/db.sqlite': 4096, '/notes/a.md': 12, '/drv-bytes.bin': 700 },
    snapshot: { clock: createScenarioClock(scenario), source: createScenarioSource(scenario) }
  });
}
