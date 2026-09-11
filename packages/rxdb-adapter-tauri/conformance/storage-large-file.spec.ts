/**
 * 大文件的真实量级与内存形态（US-505 AC#5）。
 *
 * @remarks
 * 其余用例的素材都是几 KiB，跑得再绿也证明不了「≥ 50 MiB 不炸」——单帧上限是 4 MiB，
 * 几 KiB 的内容连一次分帧都触发不到，分帧循环、偏移推进、eof 判定全在覆盖之外。
 *
 * 本文件灌 52 MiB（13 帧），并把 AC#5 的后半句「内容不整体进 JS 堆」变成可证伪的断言：
 * 同一份文件读两遍，一遍走 {@link StorageFilesystem.openRead} 的流式路径（读完即弃），
 * 一遍把每帧攒进数组（一个不流式的调用方会写成的样子），比较两者的内存峰值。
 * 本机实测 4.21 MB 对 54.5 MB —— 前者正好一帧，后者正好整份内容。
 *
 * 代价：stdio 宿主走 JSON + base64（`rust/src/value.rs`），52 MiB 内容在管子上是
 * 约 70 MiB 文本，一来一回三趟，再叠上每帧一次强制 GC。本文件因此比套件里其余文件
 * 都慢一档（本机约 60 s），两条用例各自带 {@link LARGE_FILE_TIMEOUT_MS} 的单条超时。
 *
 * @vitest-environment node
 */

import { DESKTOP_HOST_MAX_FILE_CHUNK_BYTES } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import type { StorageFilesystem } from '@aiao/rxdb-plugin-storage';
import { createDesktopStorageFilesystem } from '@aiao/rxdb-plugin-storage/desktop';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TAURI_ADAPTER_NAME } from '../src/index.js';
import { createRustHostTransport } from './rust-host-transport.js';

/** 与 `rust/src/paths.rs` 的 `STORAGE_DIRECTORY` 逐字相同。 */
const STORAGE_DIRECTORY = 'rxdb-files';

/** 与 `src/app/setup_rxdb_desktop.ts` 的 `DESKTOP_STORAGE_ROOT_DIR` 逐字相同。 */
const ROOT_DIR = 'files';

/** 单帧上限；与 `desktop.ts` 的 `FRAME_BYTES` 同源。 */
const FRAME_BYTES = DESKTOP_HOST_MAX_FILE_CHUNK_BYTES;

/** 13 帧 = 52 MiB。取整帧数是为了让「最后一帧短于请求长度」之外的路径也走满。 */
const FRAME_COUNT = 13;

/** 内容总字节数，越过 AC#5 要求的 50 MiB 线。 */
const CONTENT_BYTES = FRAME_BYTES * FRAME_COUNT;

const FILE_PATH = 'bulk/large.bin';

/**
 * 流式读允许的内存峰值上限：四帧。
 *
 * @remarks
 * 定成帧的倍数而不是内容的比例，是因为「与内容体积无关」正是这条 AC 要证的性质 ——
 * 按比例定的阈值会随素材变大而自动放宽，把回归一起放过去。
 *
 * 真实工作集是「当前帧 + 流预取的下一帧」：`openRead` 的 `pull` 把第 N 帧交出去之后就去取
 * 第 N+1 帧，采样撞进这个窗口时量到的是两帧。本机 7 次实测 6 次是 1.005 帧、1 次 2.042 帧，
 * 所以四帧是留了一倍余量的上限，不是一条踩线通过的红线。
 */
const STREAMING_PEAK_CEILING = FRAME_BYTES * 4;

/**
 * 对照组每多攒一帧，采样值至少该涨的量：一帧再让出 1 MiB。
 *
 * @remarks
 * 「对照组确实攒住了整份内容」由 `held` 的字节总和逐字节坐实，这条只负责确认采样器量得到
 * 这份内容。量的是**涨幅**而不是「峰值 ≈ 整份内容」：后者要拿本趟的基线作参照，而基线是上
 * 一趟读完那一刻采的，上一趟残留多少，峰值就短多少 —— 这条在 CI 上两次判红，两次都短了
 * 整整一帧（先是 4 196 512 B，改成独立函数之后仍有 4 215 448 B），本机却一次都复现不出来。
 * 涨幅由同一趟内相邻两次采样相减得到，残留同时出现在被减数与减数里，自己抵消掉。
 *
 * 一个没攒住的实现每帧读完即弃，涨幅是 0 而不是一帧，这 1 MiB 放不过去。
 */
const ACCUMULATING_GROWTH_FLOOR = FRAME_BYTES - FRAME_BYTES / 4;

/**
 * 本文件两条用例的单条超时。
 *
 * @remarks
 * 只放宽这两条而不动全局 `testTimeout`：全局放宽会让真正挂住的用例也拖满三分钟才报。
 * 每条都要在 stdio 管子上过两三趟 70 MiB 的 base64，60 s 在慢机器上不够。
 */
const LARGE_FILE_TIMEOUT_MS = 180_000;

/**
 * 造第 `index` 帧的内容。
 *
 * @remarks
 * 帧号进内容：帧顺序错乱、重复或丢失都会改变整体摘要，而全零或全同的填充做不到这一点。
 */
const makeFrame = (index: number): Uint8Array<ArrayBuffer> => {
  const frame = new Uint8Array(new ArrayBuffer(FRAME_BYTES));
  for (let offset = 0; offset < FRAME_BYTES; offset += 1) {
    frame[offset] = (offset * 31 + index * 97 + 7) & 0xff;
  }
  return frame;
};

/** 全量内容的 sha256，边生成边喂进摘要，不在任何时刻持有整份内容。 */
const expectedDigest = (): string => {
  const hash = createHash('sha256');
  for (let index = 0; index < FRAME_COUNT; index += 1) hash.update(makeFrame(index));
  return hash.digest('hex');
};

/**
 * 当前进程持有的 JS 侧内容量。
 *
 * @remarks
 * `heapUsed` 单独看会漏掉大头：帧内容是 `ArrayBuffer`，V8 记在堆外，
 * 只看堆会得出「流式和累积一样省」的假结论。两项相加才是调用方视角的占用。
 */
const jsBytesHeld = (): number => {
  const usage = process.memoryUsage();
  return usage.heapUsed + usage.arrayBuffers;
};

/**
 * 强制回收后采样。
 *
 * @remarks
 * 不强制回收，测出来的是 GC 的调度节奏而不是代码的持有关系：同一份实现在两次运行里
 * 能差出一个数量级。`--expose-gc` 由 `vitest.conformance.mts` 的 `execArgv` 打开；
 * 拿不到就直接报错，而不是退化成一次无意义的采样。
 */
const sampleBytesHeld = (): number => {
  if (typeof globalThis.gc !== 'function') {
    throw new Error(
      'this spec needs --expose-gc; check test.execArgv in packages/rxdb-adapter-tauri/vitest.conformance.mts'
    );
  }
  globalThis.gc();
  return jsBytesHeld();
};

/** 一趟读的内存形态。 */
interface ReadMeasurement {
  /** 每收下一帧后的采样绝对值，按到达顺序。 */
  readonly samples: readonly number[];
  /** 本趟峰值，已减去本趟自己的基线。 */
  readonly peakBytes: number;
}

/**
 * 完整读一遍 {@link FILE_PATH}，记下这一趟的内存形态。
 *
 * @remarks
 * 两次读共用同一段循环，差别只在 `onChunk` 的去处：比较出来的差异因此来自同一条读通路，
 * 只可能出自调用方持不持有内容 —— 这正是 AC#5 要归因的那一项。
 *
 * 交出的是采样序列而不只是峰值：峰值要减基线，而基线是上一趟读完那一刻采的，上一趟
 * 残留多少峰值就短多少（见 {@link ACCUMULATING_GROWTH_FLOOR}）。残留确实存在——`openRead`
 * 的流在 `pull` 里用闭包变量 `pending` 存着「下一帧」，加上传输层尚未回收的缓冲，一次
 * `gc()` 不保证在采基线之前就把它们还回去。序列交给调用方，需要抗残留的断言就改看相邻
 * 采样的涨幅，只有留着一倍余量的 {@link STREAMING_PEAK_CEILING} 才继续看减了基线的峰值。
 *
 * @param onChunk - 每帧的去处：对照组推进数组，流式组丢弃。调用发生在采样之前，
 *   所以当前帧本身计入采样。
 * @returns 本趟的采样序列与峰值
 */
const readAndMeasure = async (onChunk: (chunk: Uint8Array) => void): Promise<ReadMeasurement> => {
  const baseline = sampleBytesHeld();
  const samples: number[] = [];
  const reader = (await filesystem.openRead(FILE_PATH)).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(value);
    samples.push(sampleBytesHeld());
  }
  return { samples, peakBytes: Math.max(...samples) - baseline };
};

/**
 * 相邻两次采样之间涨幅的中位数。
 *
 * @remarks
 * 取中位数而不是首尾之差：残留被回收时，涨幅会在**某一次**采样上凭空短掉一块，首尾之差
 * 原样吃下这一块，中位数则不理会这样的单点异常。13 帧给出 12 个涨幅，一次异常动不了中位。
 *
 * @param samples - 一趟读的采样序列，至少两项
 * @returns 涨幅中位数（偶数个涨幅时取靠上的那个）
 */
const medianGrowthBytes = (samples: readonly number[]): number => {
  const steps: number[] = [];
  let previous: number | undefined;
  for (const sample of samples) {
    if (previous !== undefined) steps.push(sample - previous);
    previous = sample;
  }

  const middle = steps.sort((left, right) => left - right)[Math.floor(steps.length / 2)];
  if (middle === undefined) throw new Error('growth needs at least two samples');
  return middle;
};

let workspace: string;
let filesystem: StorageFilesystem;
let stopHost: () => void;

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'rxdb-tauri-large-'));
  const host = createRustHostTransport(workspace);
  stopHost = () => host.process.stop();
  filesystem = createDesktopStorageFilesystem({ transport: host.transport })(ROOT_DIR, {
    localAdapterName: TAURI_ADAPTER_NAME
  });
  await filesystem.ensureRoot();
});

afterAll(async () => {
  filesystem.dispose();
  stopHost();
  await rm(workspace, { recursive: true, force: true });
});

describe('Rust 文件宿主的大文件通路', () => {
  /**
   * US-505 AC#5 前半：52 MiB 真的落到磁盘上，一个字节不差。
   *
   * @remarks
   * 写入方也是逐帧生成、写完即弃：如果写入侧必须先攒出整份 buffer，这条 AC 在写方向上
   * 就已经不成立了，后面读方向测得再省也没用。
   */
  it(
    '写入 52 MiB 后磁盘上的原生文件字节数与摘要都对得上',
    async () => {
      const writer = await filesystem.openWrite(FILE_PATH);
      for (let index = 0; index < FRAME_COUNT; index += 1) await writer.write(makeFrame(index));
      await writer.close();

      // 直接量物理文件：只信 host 自己的读回，等于让被测方给自己作证。
      const physical = join(workspace, STORAGE_DIRECTORY, ROOT_DIR, 'bulk', 'large.bin');
      expect((await stat(physical)).size).toBe(CONTENT_BYTES);

      const hash = createHash('sha256');
      const reader = (await filesystem.openRead(FILE_PATH)).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
      }
      expect(hash.digest('hex')).toBe(expectedDigest());
    },
    LARGE_FILE_TIMEOUT_MS
  );

  /**
   * US-505 AC#5 后半：流式读的内存峰值只有一帧的量级，与内容体积无关。
   *
   * @remarks
   * 阈值 {@link STREAMING_PEAK_CEILING} 是四帧，本机实测 4.21 MB —— 正好一帧，
   * 余量至少一倍（撞上预取窗口的那次是 8.56 MB，仍在一半以内）。另一半断言比的是同一条
   * 读通路上的累积读（实测每帧涨 4.19 MB、峰值 54.54 MB）：只卡绝对值的话，一个
   * 「其实没流式、但恰好被别的原因压住了内存」的实现也能蒙混过去；两条一起才把它排掉。
   *
   * 两趟读共用 {@link readAndMeasure}，差别只在每帧的去处，比出来的差异才归得到
   * 「调用方持不持有内容」这一项上。
   */
  it(
    '流式读的内存峰值只有一帧量级，且不到累积读峰值的一半',
    async () => {
      const streaming = await readAndMeasure(() => undefined);

      const held: Uint8Array[] = [];
      const accumulating = await readAndMeasure(chunk => held.push(chunk));

      // 两趟都得把 13 帧交齐：漏交一帧，峰值自然低，「省内存」就成了漏读的副产品。
      expect(streaming.samples).toHaveLength(FRAME_COUNT);
      expect(accumulating.samples).toHaveLength(FRAME_COUNT);

      // 先把对照组的前提坐实：它确实把整份内容攒住了，否则下面的比值只是两个小数在比大小。
      expect(held.reduce((total, chunk) => total + chunk.byteLength, 0)).toBe(CONTENT_BYTES);
      expect(medianGrowthBytes(accumulating.samples)).toBeGreaterThan(ACCUMULATING_GROWTH_FLOOR);

      expect(streaming.peakBytes).toBeLessThan(STREAMING_PEAK_CEILING);
      expect(streaming.peakBytes).toBeLessThan(accumulating.peakBytes / 2);
    },
    LARGE_FILE_TIMEOUT_MS
  );
});
