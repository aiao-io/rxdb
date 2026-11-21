import { VmEntry, VmFs, VmStat, VmTree } from '../vm/vm-fs';

/** 内存里的「虚拟机文件系统」：路径 → 文件或目录，写入时 mtime 递增。 */
export class FakeVm implements VmFs {
  private readonly times = new Map<string, number>();
  private clock = 1;
  readonly files = new Map<string, Uint8Array>();
  readonly dirs = new Set<string>(['/']);

  async list(path: string): Promise<VmEntry[]> {
    const prefix = path === '/' ? '/' : `${path}/`;
    const names = new Map<string, VmEntry['kind']>();
    for (const dir of this.dirs) if (this.isChild(prefix, dir)) names.set(dir.slice(prefix.length), 'directory');
    for (const file of this.files.keys()) if (this.isChild(prefix, file)) names.set(file.slice(prefix.length), 'file');
    return [...names].map(([name, kind]) => ({ name, kind }));
  }

  async stat(path: string): Promise<VmStat | null> {
    const file = this.files.get(path);
    if (file) return { kind: 'file', size: file.length, mtimeMs: this.times.get(path) ?? 0 };
    return this.dirs.has(path) ? { kind: 'directory', size: 0, mtimeMs: this.times.get(path) ?? 0 } : null;
  }

  async read(path: string): Promise<Uint8Array> {
    const file = this.files.get(path);
    if (!file) throw new Error(`ENOENT ${path}`);
    return file;
  }

  async write(path: string, data: Uint8Array): Promise<void> {
    await this.mkdir(path.slice(0, path.lastIndexOf('/')) || '/');
    this.files.set(path, data);
    this.times.set(path, this.clock++);
  }

  async mkdir(path: string): Promise<void> {
    const parts = path.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) this.dirs.add(`/${parts.slice(0, i).join('/')}`);
  }

  async remove(path: string): Promise<void> {
    for (const file of [...this.files.keys()])
      if (file === path || file.startsWith(`${path}/`)) this.files.delete(file);
    for (const dir of [...this.dirs]) if (dir === path || dir.startsWith(`${path}/`)) this.dirs.delete(dir);
  }

  async mount(tree: VmTree, mountPoint: string): Promise<void> {
    await this.mkdir(mountPoint);
    for (const [name, node] of Object.entries(tree)) {
      const path = mountPoint === '/' ? `/${name}` : `${mountPoint}/${name}`;
      if ('file' in node) await this.write(path, node.file.contents);
      else await this.mount(node.directory, path);
    }
  }

  private isChild(prefix: string, path: string): boolean {
    return path.startsWith(prefix) && path.length > prefix.length && !path.slice(prefix.length).includes('/');
  }
}
