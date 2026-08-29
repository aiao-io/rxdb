/**
 * 磁盘写满时的错误码与补偿（US-505 AC#8）。
 *
 * @remarks
 * `rust/src/file/mod.rs` 里那条 `reports_an_unwritable_storage_root_as_permission_denied`
 * 钉的是 AC#8 的另一半（根不可写）；磁盘满那一半在 `cargo test` 里造不出来 ——
 * 要么占满真盘，要么挂一个小容量文件系统，都不该由一条单元测试承担。这里承担它：
 * 挂一块 16 MiB 的小卷，把存储根放上去，然后往里灌 32 MiB。
 *
 * 断言的不只是「抛了个错」，而是**四件事一起成立**：
 * 1. 错误码是稳定的 `disk_full`，不是一句只能读给人看的自由文本；
 * 2. 错误里只有相对路径（AC#4 不回归）；
 * 3. 目标文件不存在 —— 原子提交意味着失败的写入不留半成品；
 * 4. 父目录里没有遗留的 `.rxdb-tmp` —— 临时文件被回收了，不是把满盘继续占着。
 * 少了第 3、4 条，一个「报错但把半截文件留在那儿」的实现照样能让前两条过关，
 * 而那正是磁盘满场景下最难收拾的形态。
 *
 * 平台门：
 * - macOS 走 `hdiutil attach ram://` + `diskutil eraseVolume`，都不要 sudo；
 * - Linux 走 `sudo -n mount -t tmpfs`，CI runner 上是免密的，本机没配就跳过；
 * - Windows 上造小卷没有免权限的路子（`subst` 不隔离容量，VHD 要管理员），
 *   照搬只会得到一条恒绿或恒红的用例，因此整文件跳过 —— 与
 *   `reports_an_unwritable_storage_root_as_permission_denied` 的 `#[cfg(unix)]` 同一个尺度。
 *
 * @vitest-environment node
 */

import { StorageBackendError, type StorageFilesystem } from '@aiao/rxdb-plugin-storage';
import { createDesktopStorageFilesystem } from '@aiao/rxdb-plugin-storage/desktop';
import { DESKTOP_HOST_MAX_FILE_CHUNK_BYTES } from '@aiao/rxdb-adapter-sqlite-core/desktop-host';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TAURI_ADAPTER_NAME } from '../src/index.js';
import { createRustHostTransport } from './rust-host-transport.js';

/** 与 `rust/src/paths.rs` 的 `STORAGE_DIRECTORY` 逐字相同。 */
const STORAGE_DIRECTORY = 'rxdb-files';

/** 与 `src/app/setup_rxdb_desktop.ts` 的 `DESKTOP_STORAGE_ROOT_DIR` 逐字相同。 */
const ROOT_DIR = 'files';

/** 与 `rust/src/file/mod.rs` 的临时文件命名（`.{write_id}.rxdb-tmp`）对齐的后缀。 */
const TEMPORARY_SUFFIX = '.rxdb-tmp';

const FRAME_BYTES = DESKTOP_HOST_MAX_FILE_CHUNK_BYTES;

/** 小卷容量：装得下两三帧，装不下下面要灌的量。 */
const VOLUME_MIB = 16;

/** 要灌的帧数；32 MiB 是卷容量的两倍，必定在中途撞上 ENOSPC。 */
const OVERFLOW_FRAMES = 8;

const FILE_PATH = 'bulk/overflow.bin';

/** 一块用完即拆的小容量卷。 */
interface SmallVolume {
  /** 卷的挂载点，直接当宿主的数据根用。 */
  readonly mountPoint: string;
  /** 拆卸；不得抛出，afterAll 里再抛只会盖住真正的失败。 */
  readonly release: () => void;
}

const run = (file: string, args: readonly string[]): string =>
  execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** 本机能不能免密 sudo；Linux 分支要挂 tmpfs。 */
const hasPasswordlessSudo = (): boolean => {
  try {
    run('sudo', ['-n', 'true']);
    return true;
  } catch {
    return false;
  }
};

/**
 * macOS：建一块 RAM disk 并格式化挂载。
 *
 * @remarks
 * 格式化前必须确认目标是虚拟设备。`hdiutil attach` 返回的设备号是运行时才知道的，
 * 拿着它直接 `eraseVolume` 一旦哪天串了（脚本被复制到别处、参数被改坏），
 * 抹掉的就是一块真盘。这道闸的成本是一次 `diskutil info`。
 */
const attachRamDisk = (): SmallVolume => {
  const blocks = (VOLUME_MIB * 1024 * 1024) / 512;
  const device = run('hdiutil', ['attach', '-nomount', `ram://${String(blocks)}`]).trim();
  const release = (): void => {
    try {
      run('hdiutil', ['detach', device, '-force']);
    } catch {
      return;
    }
  };

  try {
    if (!/^\s*Virtual:\s+Yes\s*$/m.test(run('diskutil', ['info', device]))) {
      throw new Error(`refusing to format ${device}: it is not a virtual device`);
    }
    // 卷名前缀固定为 rxdb：本地放行规则按它收窄（.claude/settings.local.json）。
    const name = `rxdbfull${String(process.pid)}`;
    run('diskutil', ['eraseVolume', 'HFS+', name, device]);
    return { mountPoint: join('/Volumes', name), release };
  } catch (error) {
    release();
    throw error;
  }
};

/** Linux：挂一块 tmpfs。`mode=0777` 省掉一次 chown。 */
const mountTmpfs = (): SmallVolume => {
  const mountPoint = mkdtempSync(join(tmpdir(), 'rxdb-tauri-full-'));
  run('sudo', ['-n', 'mount', '-t', 'tmpfs', '-o', `size=${String(VOLUME_MIB)}m,mode=0777`, 'tmpfs', mountPoint]);
  return {
    mountPoint,
    release: () => {
      try {
        run('sudo', ['-n', 'umount', mountPoint]);
      } catch {
        return;
      }
    }
  };
};

const CAN_MOUNT = platform === 'darwin' || (platform === 'linux' && hasPasswordlessSudo());

/** 目录下所有以 `.rxdb-tmp` 结尾的残留；正常路径上应为空。 */
const temporaryFiles = (directory: string): string[] =>
  existsSync(directory) ? readdirSync(directory).filter(name => name.endsWith(TEMPORARY_SUFFIX)) : [];

let volume: SmallVolume;
let filesystem: StorageFilesystem;
let stopHost: () => void;

/** 目标文件所在的物理目录，断言残留与半成品都看这里。 */
let physicalParent: string;

beforeAll(async () => {
  if (!CAN_MOUNT) return;
  volume = platform === 'darwin' ? attachRamDisk() : mountTmpfs();
  physicalParent = join(volume.mountPoint, STORAGE_DIRECTORY, ROOT_DIR, 'bulk');

  const host = createRustHostTransport(volume.mountPoint);
  stopHost = () => host.process.stop();
  filesystem = createDesktopStorageFilesystem({ transport: host.transport })(ROOT_DIR, {
    localAdapterName: TAURI_ADAPTER_NAME
  });
  await filesystem.ensureRoot();
});

afterAll(() => {
  if (!CAN_MOUNT) return;
  filesystem.dispose();
  stopHost();
  volume.release();
});

describe.skipIf(!CAN_MOUNT)(`Rust 文件宿主在 ${String(VOLUME_MIB)} MiB 小卷上写满时`, () => {
  /**
   * US-505 AC#8：磁盘满给出稳定错误码，且不留半成品与临时文件。
   *
   * @remarks
   * 失败后走 `abort()` 而不是 `close()`：服务层的错误路径就是这么调的
   * （见 `storage.ops.ts` 的补偿分支），这里复现的是那条真实路径，
   * 而不是一个只有测试才会走的姿势。
   */
  it('报 disk_full、只暴露相对路径，且不留半成品与临时文件', async () => {
    const writer = await filesystem.openWrite(FILE_PATH);
    // 临时文件在 writeBegin 时就建好了：先坐实它确实在，后面「没了」才有意义。
    expect(temporaryFiles(physicalParent)).toHaveLength(1);

    let failure: unknown;
    try {
      for (let index = 0; index < OVERFLOW_FRAMES; index += 1) {
        await writer.write(new Uint8Array(new ArrayBuffer(FRAME_BYTES)));
      }
    } catch (error) {
      failure = error;
    }
    await writer.abort(failure);

    expect(failure).toBeInstanceOf(StorageBackendError);
    expect((failure as StorageBackendError).code).toBe('disk_full');

    // AC#4：错误里只有相对路径，挂载点这种宿主布局细节不出协议。
    const message = (failure as StorageBackendError).message;
    expect(message).toContain(`${ROOT_DIR}/bulk/overflow.bin`);
    expect(message).not.toContain(volume.mountPoint);

    // 原子提交：失败的写入不留半成品，也不把满盘继续占着。
    expect(existsSync(join(physicalParent, 'overflow.bin'))).toBe(false);
    expect(temporaryFiles(physicalParent)).toEqual([]);
  });

  /**
   * 写满不是一张单程票：临时文件回收之后，同一个会话还能继续干活。
   *
   * @remarks
   * 没有这条，上一条即使在「宿主把会话卡死了」的实现下也照样全绿 ——
   * 而磁盘满是个会反复发生的常态，一次撞满就废掉一条会话是不可接受的。
   */
  it('回收之后同一个会话还能正常写入', async () => {
    const content = new Uint8Array(new ArrayBuffer(1024)).map((_, index) => (index * 7 + 3) & 0xff);
    const writer = await filesystem.openWrite('bulk/small.bin');
    await writer.write(content);
    await writer.close();

    const blob = await filesystem.readBlob('bulk/small.bin');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(content);
    expect(temporaryFiles(physicalParent)).toEqual([]);
  });
});
