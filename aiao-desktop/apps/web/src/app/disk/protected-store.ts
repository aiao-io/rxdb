import { assertUnprotected } from './application-projection';
import { DiskPath } from './disk-path';
import { DiskEntry, DiskEntryKind, DiskFileInfo, DiskStore } from './disk-store';

/**
 * 给存储后端加一道最后的防线（ADESK-US-205 阶段 B）：任何写路径——Finder、TextEdit、终端回写、以后的导入入口——
 * 经过它时，动到系统拥有的预装应用包（含包里系统写入的子项，以及包含它们的祖先目录的递归删除与移动）就抛 `EACCES`。
 * 读与新建目录不受影响，用户放进包里的文件也不在保护范围内。
 *
 * 保护判断来自应用目录服务（`owned` 每次都取最新的），所以所有入口共用同一条规则，而不是只在某个界面菜单里置灰。
 */
export class ProtectedDiskStore implements DiskStore {
  constructor(
    private readonly inner: DiskStore,
    private readonly owned: () => ReadonlyMap<string, string>
  ) {}

  list(dir: DiskPath): Promise<DiskEntry[]> {
    return this.inner.list(dir);
  }

  kindOf(path: DiskPath): Promise<DiskEntryKind | null> {
    return this.inner.kindOf(path);
  }

  info(file: DiskPath): Promise<DiskFileInfo> {
    return this.inner.info(file);
  }

  read(file: DiskPath): Promise<Uint8Array> {
    return this.inner.read(file);
  }

  mkdir(dir: DiskPath): Promise<void> {
    return this.inner.mkdir(dir);
  }

  async write(file: DiskPath, data: Uint8Array): Promise<void> {
    assertUnprotected(this.owned(), { kind: 'write', path: file });
    await this.inner.write(file, data);
  }

  async replace(file: DiskPath, data: Uint8Array): Promise<void> {
    assertUnprotected(this.owned(), { kind: 'write', path: file });
    await this.inner.replace(file, data);
  }

  async remove(path: DiskPath): Promise<void> {
    assertUnprotected(this.owned(), { kind: 'remove', path });
    await this.inner.remove(path);
  }

  async move(from: DiskPath, to: DiskPath): Promise<void> {
    assertUnprotected(this.owned(), { kind: 'move', from, to });
    await this.inner.move(from, to);
  }
}
