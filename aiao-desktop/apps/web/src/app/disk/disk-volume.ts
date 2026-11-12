import { DiskStore } from './disk-store';

/** 内置内容的版本。改了内置内容只影响新磁盘与抹掉后的磁盘，已有磁盘不会被覆盖。 */
export const SEED_VERSION = 1;

/** 复制完成的标记：没有它说明磁盘还没复制过，或上次复制中途被打断。 */
export interface DiskMarker {
  readonly version: number;
  readonly seededAt: number;
}

/** 一个持久化的卷：存储后端、完成标记，以及跨标签页的独占执行。 */
export interface DiskVolume {
  readonly store: DiskStore;
  readMarker(): Promise<DiskMarker | null>;
  writeMarker(marker: DiskMarker): Promise<void>;
  clearMarker(): Promise<void>;
  /** 清空卷内全部内容。 */
  wipe(): Promise<void>;
  /** 独占执行：同一来源的多个标签页同时打开时，只有一个在复制。 */
  exclusive<T>(task: () => Promise<T>): Promise<T>;
}

export type DiskSeeder = (store: DiskStore) => Promise<void>;

async function reseed(volume: DiskVolume, seed: DiskSeeder, now: () => number): Promise<DiskMarker> {
  await volume.wipe();
  await seed(volume.store);
  const marker: DiskMarker = { version: SEED_VERSION, seededAt: now() };
  await volume.writeMarker(marker);
  return marker;
}

/** 打开卷：首次打开（或上次复制被打断）时清空后复制内置内容；之后原样保留磁盘上的改动。 */
export function openVolume(volume: DiskVolume, seed: DiskSeeder, now: () => number): Promise<DiskMarker> {
  return volume.exclusive(async () => (await volume.readMarker()) ?? reseed(volume, seed, now));
}

/** 抹掉卷并恢复内置内容（磁盘工具的「抹掉」）。先清标记，抹到一半中断也会在下次打开时重新复制。 */
export function eraseVolume(volume: DiskVolume, seed: DiskSeeder, now: () => number): Promise<DiskMarker> {
  return volume.exclusive(async () => {
    await volume.clearMarker();
    return reseed(volume, seed, now);
  });
}
