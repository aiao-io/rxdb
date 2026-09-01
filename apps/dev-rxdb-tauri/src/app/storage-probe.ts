/**
 * @fileoverview 自检模式下把文件存储整条通路过一遍（US-505 AC#1 / AC#3）。
 *
 * @module storage-probe
 */

/**
 * 探针文件的逻辑名，同时也是它在存储根下的相对路径。
 *
 * @remarks
 * 刻意不放子目录：e2e 侧要断言「`rxdb-files/` 下恰好一个普通文件」，多一层目录只会让
 * 那条断言多一段与 AC 无关的路径拼接。
 */
export const STORAGE_PROBE_FILE_NAME = 'selfcheck-probe.bin';

/**
 * 探针内容的字节数。
 *
 * @remarks
 * 64 KiB 足够越过任何「小内容走内联、大内容才落盘」的分支，又小到每次启动读回它
 * 不会把自检的 60s 看门狗吃掉。真实量级（≥ 50 MiB）由
 * `packages/rxdb-adapter-tauri/conformance/storage-large-file.spec.ts` 负责（AC#5）。
 */
export const STORAGE_PROBE_BYTES = 64 * 1024;

/** 原生文件没有 MIME 概念，写死成通用二进制，免得两个平台推断出不同的值。 */
const STORAGE_PROBE_MIME = 'application/octet-stream';

/** 探针用得到的那几个 metadata 字段。 */
export interface StorageProbeMeta {
  /** metadata 主键，`read()` 的入参。 */
  readonly id: string;
  /** 相对存储根的唯一路径；探针文件放在根下，因此就等于文件名。 */
  readonly opfsPath: string;
}

/**
 * {@link probeStorage} 用得到的那一小块 `rxdb.storage` 表面。
 *
 * @remarks
 * 写成窄接口而不是 `RxdbFileStorage`，与 `LaunchRecordDatabase` 同一个尺度：
 * 单测里造一份内存替身就够，不必为了跑一条探针把整个存储插件连同后端一起立起来。
 */
export interface StorageProbeSurface {
  /** 列出全部 metadata。 */
  list(): Promise<readonly StorageProbeMeta[]>;
  /** 写入一个文件并返回它的 metadata。 */
  upload(file: File): Promise<StorageProbeMeta>;
  /** 按 metadata 主键读回内容。 */
  read(fileId: string): Promise<Blob>;
}

/** 探针结果，与 `src-tauri/src/selfcheck.rs` 的 `StorageProbe` 逐字对应。 */
export interface StorageProbeResult {
  /** 读回内容的 sha256，小写十六进制。 */
  readonly digest: string;
  /** 读回内容的字节数。 */
  readonly byteLength: number;
  /** 本次启动**之前**探针文件是否已存在。 */
  readonly existedBefore: boolean;
}

/**
 * 造一份确定性的探针内容。
 *
 * @returns 每次调用都完全相同的 {@link STORAGE_PROBE_BYTES} 字节
 *
 * @remarks
 * 内容与偏移量有关而不是一片全零：全零填充下「读回时偏移错位」「首尾被截掉一段又补零」
 * 这类损坏读出来仍然是全零，摘要照样对得上。
 */
export const storageProbeContent = (): Uint8Array<ArrayBuffer> => {
  const content = new Uint8Array(new ArrayBuffer(STORAGE_PROBE_BYTES));
  for (let offset = 0; offset < STORAGE_PROBE_BYTES; offset += 1) content[offset] = (offset * 31 + 7) & 0xff;
  return content;
};

/**
 * 算一份字节的 sha256，小写十六进制。
 *
 * @param bytes - 要摘要的内容
 * @returns 64 位十六进制字符串
 *
 * @remarks
 * 形参钉死 `Uint8Array<ArrayBuffer>` 而不是宽的 `Uint8Array`：后者的 buffer 可能是
 * `SharedArrayBuffer`，而 `crypto.subtle.digest` 的 `BufferSource` 不收它。
 *
 * 导出是给 `webview-probe.ts` 复用的 —— 两条探针的摘要必须逐字节同一个算法，
 * 各写一份的话，某天一边改了大小写或补零方式，e2e 侧的对比会以「内容不一致」的形态失败。
 */
export const sha256Hex = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * 幂等地过一遍文件存储：不存在就写一份，然后读回来校验并算摘要。
 *
 * @param storage - 已连接的 `rxdb.storage`
 * @returns 摘要、字节数，以及本次启动之前文件是否已存在
 * @throws 读回的内容与写下去的对不上时抛出；调用方（`startLocalDatabase`）把它落成
 *   自检报告里的失败原因
 *
 * @remarks
 * # 为什么必须幂等
 *
 * 每次启动都重写一份的话，AC#1「重启后内容还在」验的就成了「刚刚写的那一份还在」——
 * 一个把内容放在内存里的实现照样全绿。只有「第二次启动**没有**写、却仍读得回同样的字节」
 * 才排得掉它，`existedBefore` 就是这条判据的载体。
 *
 * # 为什么对不上要抛而不是照报
 *
 * 照报的话自检结论仍是 `ok`，要等 e2e 侧发现「磁盘上那个文件的 sha256 与报告对不上」
 * 才暴露，而那时报告里没有任何一句说明是哪一步坏了。抛出去则由调用方写成
 * `status: 'failed'` + 原因，一眼能看到是读回校验失败。
 */
export const probeStorage = async (storage: StorageProbeSurface): Promise<StorageProbeResult> => {
  const existing = (await storage.list()).find(meta => meta.opfsPath === STORAGE_PROBE_FILE_NAME);
  const content = storageProbeContent();
  const meta =
    existing ?? (await storage.upload(new File([content], STORAGE_PROBE_FILE_NAME, { type: STORAGE_PROBE_MIME })));

  const readBack = new Uint8Array(await (await storage.read(meta.id)).arrayBuffer());
  if (readBack.byteLength !== STORAGE_PROBE_BYTES) {
    throw new Error(
      `the storage probe read back ${String(readBack.byteLength)} bytes, expected ${String(STORAGE_PROBE_BYTES)}`
    );
  }

  const digest = await sha256Hex(readBack);
  const expected = await sha256Hex(content);
  if (digest !== expected) throw new Error(`the storage probe read back a different digest: ${digest} != ${expected}`);

  return { digest, byteLength: readBack.byteLength, existedBefore: existing !== undefined };
};
