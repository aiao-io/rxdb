import { DESKTOP_LIMITS, DesktopError, type OrbitDesktop } from '@aiao/orbit/desktop';

/** 用户明确选定的文件副本，不持有原文件的写回凭证。 */
export interface DesktopFileCopy {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** 工作台只通过选择面板复制文件，不共享目录或同步源文件。 */
export interface WorkbenchDesktopFiles {
  readonly canRead: boolean;
  readonly canWrite: boolean;
  readonly maxBytes: number;
  open(accept?: readonly string[]): Promise<DesktopFileCopy | null>;
  save(name: string, bytes: Uint8Array): Promise<string | null>;
}

async function selected<T>(operation: () => Promise<T>): Promise<T | null> {
  try {
    return await operation();
  } catch (cause) {
    if (cause instanceof DesktopError && cause.code === 'USER_CANCELLED') return null;
    throw cause;
  }
}

/** 将 Orbit 能力限制为每次由用户授权的复制操作。 */
export function createDesktopFiles(desktop: Pick<OrbitDesktop, 'capabilities' | 'filesystem'>): WorkbenchDesktopFiles {
  const canRead = desktop.capabilities.includes('filesystem:read');
  const canWrite = desktop.capabilities.includes('filesystem:write');
  const maxBytes = DESKTOP_LIMITS.filesystem.bytes;
  return {
    canRead,
    canWrite,
    maxBytes,
    async open(accept) {
      if (!canRead) throw new Error('桌面未授予读取文件权限');
      return selected(async () => {
        const file = await desktop.filesystem.open(accept ? { accept } : {});
        return { name: file.name, bytes: new Uint8Array(file.bytes) };
      });
    },
    async save(name, bytes) {
      if (!canWrite) throw new Error('桌面未授予写入文件权限');
      if (bytes.byteLength > maxBytes) throw new Error('桌面文件复制超过 512 KiB 上限，请使用本机下载导出');
      const snapshot = new Uint8Array(bytes);
      return selected(async () => {
        const saved = await desktop.filesystem.save({ suggestedName: name, bytes: snapshot });
        return saved.name;
      });
    }
  };
}
