import { deflateSync } from 'node:zlib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeGitArchive } from './git-archive.js';
import { GIT_WORKBENCH_LIMITS } from './git-protocol.js';
import { GitWorkbenchRuntime } from './git-runtime.js';

type Node = { readonly mode: number; bytes: Uint8Array<ArrayBuffer> };
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const parent = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/';

class FixtureFilesystem {
  readonly nodes = new Map<string, Node>([
    ['/', { mode: 0o40755, bytes: new Uint8Array() }],
    ['/opfs', { mode: 0o40755, bytes: new Uint8Array() }],
    ['/tmp', { mode: 0o40755, bytes: new Uint8Array() }]
  ]);
  cwd = '/opfs';
  chdir(path: string): void {
    if (!this.nodes.has(path)) throw new Error(`Missing cwd: ${path}`);
    this.cwd = path;
  }
  mkdir(path: string): void {
    if (this.nodes.has(path)) throw new Error('EEXIST');
    if (!this.nodes.has(parent(path))) throw new Error('ENOENT');
    this.nodes.set(path, { mode: 0o40755, bytes: new Uint8Array() });
  }
  readdir(path: string): string[] {
    if (!this.isDir(this.stat(path).mode)) throw new Error('ENOTDIR');
    return [
      '.',
      '..',
      ...[...this.nodes.keys()]
        .filter(entry => entry !== '/' && parent(entry) === path)
        .map(entry => entry.slice(entry.lastIndexOf('/') + 1))
    ];
  }
  readFile(path: string): Uint8Array<ArrayBuffer> {
    const node = this.nodes.get(path);
    if (!node || !this.isFile(node.mode)) throw new Error(`ENOENT: ${path}`);
    return new Uint8Array(node.bytes);
  }
  writeFile(path: string, bytes: Uint8Array<ArrayBuffer>): void {
    if (!this.nodes.has(parent(path))) throw new Error(`ENOENT: ${parent(path)}`);
    if (this.nodes.has(path) && this.isDir(this.stat(path).mode)) throw new Error(`EISDIR: ${path}`);
    this.nodes.set(path, { mode: 0o100644, bytes: new Uint8Array(bytes) });
  }
  unlink(path: string): void {
    if (!this.nodes.delete(path)) throw new Error('ENOENT');
  }
  rmdir(path: string): void {
    if (this.readdir(path).length > 2) throw new Error('ENOTEMPTY');
    this.nodes.delete(path);
  }
  stat(path: string): { mode: number } {
    const node = this.nodes.get(path);
    if (!node) throw new Error('ENOENT');
    return node;
  }
  lstat(path: string): { mode: number } {
    return this.stat(path);
  }
  isDir(mode: number): boolean {
    return (mode & 0o170000) === 0o040000;
  }
  isFile(mode: number): boolean {
    return (mode & 0o170000) === 0o100000;
  }
  analyzePath(path: string): { exists: boolean } {
    return { exists: this.nodes.has(path) };
  }
  ensure(path: string): void {
    if (this.nodes.has(path)) return;
    this.ensure(parent(path));
    this.mkdir(path);
  }
}

interface Commit {
  oid: string;
  message: string;
  parent?: string;
  tree: string;
  files: Record<string, number[]>;
}

function createRuntimeFixture() {
  const fs = new FixtureFilesystem();
  const disk = new FixtureFilesystem();
  let print = (value: unknown): void => {
    void value;
  };
  let printErr = (value: unknown): void => {
    void value;
  };
  let stdoutCollector = (byte: number): void => {
    void byte;
  };
  let faultPath = '';
  let commandFailure = '';
  let journalFailure = '';
  const commands: string[][] = [];
  const writes = new Map<string, number>();
  const treeSeq = { value: 0 };
  /** 内容寻址的假 blob id：同一批字节在任何 scratch/真实 .git 里都得到同一个 id（unstage 会把 scratch 的 index 拷回真实根）。 */
  const blobOid = (bytes: number[]): string => {
    let hash = 2166136261;
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0').repeat(5);
  };
  const objectOid = (): string => `t${(++treeSeq.value).toString(16)}`.padStart(40, '0');
  const failJournalAt = (phase: string, name: string): void => {
    if (name !== 'recovery.bin' || journalFailure !== phase) return;
    journalFailure = '';
    throw new DOMException(`journal ${phase} failed`, 'QuotaExceededError');
  };

  const parse = <T>(path: string, fallback: T): T =>
    fs.analyzePath(path).exists ? (JSON.parse(new TextDecoder().decode(fs.readFile(path))) as T) : fallback;
  type FixtureObject =
    | {
        readonly kind: 'tree';
        readonly entries: {
          readonly mode: number;
          readonly kind: string;
          readonly oid: string;
          readonly name: string;
        }[];
      }
    | { readonly kind: 'blob'; readonly bytes: number[] };
  const objects = (git: string): Map<string, FixtureObject> => {
    const raw = parse<[string, FixtureObject][]>(`${git}/fixture-objects.json`, []);
    return new Map(raw);
  };
  const saveObjects = (git: string, store: Map<string, FixtureObject>): void => {
    fs.writeFile(`${git}/fixture-objects.json`, encode([...store.entries()]));
  };
  /** 夹具的真实二进制 index（v2，平铺条目，校验和填零——运行时只解析、不校验和）。 */
  const writeIndex = (git: string, entries: { readonly path: string; readonly oid: string }[]): void => {
    const encoder = new TextEncoder();
    const length =
      12 +
      entries.reduce((sum, entry) => sum + Math.ceil((62 + encoder.encode(entry.path).length + 1) / 8) * 8, 0) +
      20;
    const bytes = new Uint8Array(length);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x44495243);
    view.setUint32(4, 2);
    view.setUint32(8, entries.length);
    let position = 12;
    for (const entry of entries) {
      const path = encoder.encode(entry.path);
      view.setUint32(position + 24, 0o100644);
      view.setUint16(position + 60, path.length);
      bytes.set(
        Uint8Array.from({ length: 20 }, (_, index) => parseInt(entry.oid.slice(index * 2, index * 2 + 2), 16)),
        position + 40
      );
      bytes.set(path, position + 62);
      position += Math.ceil((62 + path.length + 1) / 8) * 8;
    }
    fs.writeFile(`${git}/index`, bytes);
  };
  /** 把二进制 index 解析回 path→oid 映射（index 是夹具的暂存真源，运行时可能直接覆写它）。 */
  const readIndex = (git: string): Record<string, string> => {
    const bytes = fs.readFile(`${git}/index`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const count = view.getUint32(8);
    const result: Record<string, string> = {};
    let position = 12;
    for (let index = 0; index < count; index += 1) {
      const start = position;
      position += view.getUint16(position + 60) & 0x4000 ? 64 : 62;
      const nameStart = position;
      while (bytes[position] !== 0) position += 1;
      const path = new TextDecoder().decode(bytes.subarray(nameStart, position));
      const oid = [...bytes.subarray(start + 40, start + 60)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      result[path] = oid;
      position = start + Math.ceil((position - start + 1) / 8) * 8;
    }
    return result;
  };
  /** 写一个真实格式的 loose 对象（zlib 压缩的 `kind size\0content`），供运行时的只读对象读取路径使用。 */
  const writeLoose = (git: string, oid: string, kind: string, content: Uint8Array<ArrayBuffer>): void => {
    const header = new TextEncoder().encode(`${kind} ${content.length}\0`);
    const joined = new Uint8Array(header.length + content.length);
    joined.set(header);
    joined.set(content, header.length);
    const dir = `${git}/objects/${oid.slice(0, 2)}`;
    fs.ensure(dir);
    fs.writeFile(`${dir}/${oid.slice(2)}`, new Uint8Array(deflateSync(joined)));
  };
  /** 树对象的二进制条目序列化（`mode name\0` + 20 字节原始 sha）。 */
  const treeBytes = (
    entries: { readonly mode: number; readonly kind: string; readonly oid: string; readonly name: string }[]
  ): Uint8Array<ArrayBuffer> => {
    const encoder = new TextEncoder();
    const parts: Uint8Array<ArrayBuffer>[] = [];
    for (const entry of entries) {
      const head = encoder.encode(`${entry.mode.toString(8)} ${entry.name}\0`);
      const sha = Uint8Array.from({ length: 20 }, (_, index) =>
        parseInt(entry.oid.slice(index * 2, index * 2 + 2), 16)
      );
      const joined = new Uint8Array(head.length + sha.length);
      joined.set(head);
      joined.set(sha, head.length);
      parts.push(joined);
    }
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.length;
    }
    return result;
  };
  const files = (root: string): Record<string, number[]> =>
    Object.fromEntries(
      [...fs.nodes.entries()]
        .filter(
          ([path, node]) => path.startsWith(`${root}/`) && !path.startsWith(`${root}/.git/`) && fs.isFile(node.mode)
        )
        .map(([path, node]) => [path.slice(root.length + 1), [...node.bytes]])
    );
  const sync = (root: string): void => {
    const diskRoot = root.slice('/opfs'.length);
    for (const key of [...disk.nodes.keys()])
      if (key === diskRoot || key.startsWith(`${diskRoot}/`)) disk.nodes.delete(key);
    disk.ensure(diskRoot);
    for (const [path, node] of fs.nodes)
      if (path === root || path.startsWith(`${root}/`))
        disk.nodes.set(path.slice('/opfs'.length), { mode: node.mode, bytes: new Uint8Array(node.bytes) });
  };
  const write = async (path: string, value: Uint8Array<ArrayBuffer> | string): Promise<void> => {
    if (path.endsWith(faultPath) && faultPath) {
      faultPath = '';
      throw new DOMException('quota fixture', 'QuotaExceededError');
    }
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    writes.set(path, (writes.get(path) ?? 0) + 1);
    const diskPath = path.slice('/opfs'.length);
    fs.ensure(parent(path));
    disk.ensure(parent(diskPath));
    fs.writeFile(path, bytes);
    disk.writeFile(diskPath, bytes);
  };

  const run = async (args: string[]): Promise<number> => {
    commands.push([...args]);
    const [command, ...parameters] = args;
    if (command === commandFailure) {
      commandFailure = '';
      printErr('injected command failure');
      return 1;
    }
    const root = command === 'init' ? (parameters[0] ?? fs.cwd) : fs.cwd;
    const git = `${root}/.git`;
    const commitsPath = `${git}/fixture-commits.json`;
    const index = command === 'init' ? {} : readIndex(git);
    const commits = parse<Commit[]>(commitsPath, []);
    const head = commits.at(-1);
    const worktree = files(root);
    const store = objects(git);
    if (command === 'init') {
      fs.ensure(`${git}/objects/pack`);
      fs.ensure(`${git}/refs/heads`);
      fs.writeFile(`${git}/HEAD`, new TextEncoder().encode('ref: refs/heads/main\n'));
      fs.writeFile(`${git}/config`, new TextEncoder().encode('[core]\n bare = false\n'));
      writeIndex(git, []);
      fs.writeFile(`${git}/fixture-objects.json`, encode([]));
      print(`Initialized empty Git repository in ${root}/`);
    } else if (command === 'config') {
      const old = new TextDecoder().decode(fs.readFile(`${git}/config`));
      fs.writeFile(
        `${git}/config`,
        new TextEncoder().encode(`${old}\n[fixture]\n ${parameters[0].replace('.', '-')} = ${parameters[1]}\n`)
      );
    } else if (command === 'add') {
      for (const path of parameters) {
        if (worktree[path]) {
          const oid = blobOid(worktree[path]);
          store.set(oid, { kind: 'blob', bytes: [...worktree[path]] });
          writeLoose(git, oid, 'blob', new Uint8Array(worktree[path]));
          index[path] = oid;
        } else delete index[path];
      }
      writeIndex(
        git,
        Object.entries(index).map(([path, oid]) => ({ path, oid }))
      );
      saveObjects(git, store);
    } else if (command === 'commit') {
      const oids = Object.entries(index);
      const tree = objectOid();
      /* 夹具路径都是平铺的：一棵树装下全部条目（与真实 lg2 的 cat-file -p 树输出格式一致）。 */
      const treeEntries = oids.map(([path, oid]) => ({
        mode: 0o100644,
        kind: 'blob',
        oid,
        name: path
      }));
      store.set(tree, { kind: 'tree', entries: treeEntries });
      writeLoose(git, tree, 'tree', treeBytes(treeEntries));
      const commit = {
        oid: (commits.length + 1).toString(16).padStart(40, '0'),
        message: parameters[1],
        parent: head?.oid,
        tree,
        files: Object.fromEntries(
          oids.map(([path, oid]) => [path, [...(store.get(oid) as { kind: 'blob'; bytes: number[] }).bytes]])
        )
      };
      commits.push(commit);
      fs.writeFile(commitsPath, encode(commits));
      saveObjects(git, store);
      writeLoose(
        git,
        commit.oid,
        'commit',
        new TextEncoder().encode(
          `tree ${tree}\n${head ? `parent ${head.oid}\n` : ''}author Fixture <f@invalid> 0 +0000\ncommitter Fixture <f@invalid> 0 +0000\n\n${parameters[1]}\n`
        )
      );
      fs.writeFile(`${git}/refs/heads/main`, new TextEncoder().encode(commit.oid));
    } else if (command === 'rev-parse') {
      if (!head) {
        printErr('unborn');
        return 1;
      }
      const requested = parameters[0] ?? 'HEAD';
      const target = requested === 'HEAD' ? head : commits.filter(commit => commit.oid.startsWith(requested));
      if (Array.isArray(target)) {
        if (target.length !== 1) {
          printErr('unknown commit');
          return 1;
        }
        print(target[0].oid);
      } else print(target.oid);
    } else if (command === 'cat-file') {
      const target = parameters.at(-1);
      const commit = commits.find(entry => entry.oid === target);
      if (commit && parameters[0] === '-p') {
        print(
          `tree ${commit.tree}\n${commit.parent ? `parent ${commit.parent}\n` : ''}author Fixture Author <fixture@example.invalid> 1700000000 +0000\ncommitter Fixture Author <fixture@example.invalid> 1700000000 +0000\n\n${commit.message}`
        );
      } else {
        const object = store.get(target ?? '');
        if (!object) return 1;
        if (object.kind === 'tree')
          for (const entry of object.entries)
            print(`${entry.mode.toString(8)} ${entry.kind} ${entry.oid}\t${entry.name}`);
        else for (const byte of object.bytes) stdoutCollector(byte);
      }
    } else if (command === 'checkout-index') {
      for (const [path, oid] of Object.entries(index)) {
        const blob = store.get(oid);
        if (!blob || blob.kind !== 'blob') continue;
        fs.ensure(parent(`${root}/${path}`));
        fs.writeFile(`${root}/${path}`, new Uint8Array(blob.bytes));
      }
    } else if (command === 'ls-files') print(Object.keys(index).join('\n'));
    else if (command === 'rev-list')
      print(
        [...commits]
          .reverse()
          .map(commit => commit.oid)
          .join('\n')
      );
    else if (command === 'log')
      print(
        [...commits]
          .reverse()
          .map(commit => `${commit.oid} ${commit.message}`)
          .join('\n')
      );
    else if (command === 'status') {
      if (!head) printErr("error: reference 'refs/heads/main' not found");
      const stagedBytes = (path: string): number[] | undefined => {
        const oid = index[path];
        if (!oid) return undefined;
        const blob = store.get(oid);
        return blob?.kind === 'blob' ? blob.bytes : undefined;
      };
      const paths = new Set([...Object.keys(head?.files ?? {}), ...Object.keys(index), ...Object.keys(worktree)]);
      for (const path of [...paths].sort()) {
        const original = head?.files[path];
        const staged = stagedBytes(path);
        const current = worktree[path];
        const equal = (left?: number[], right?: number[]) => JSON.stringify(left) === JSON.stringify(right);
        const stage =
          equal(original, staged) ? ' '
          : !staged ? 'D'
          : !original ? 'A'
          : 'M';
        const working =
          equal(staged, current) ? ' '
          : !current ? 'D'
          : !staged ? '?'
          : 'M';
        if (stage !== ' ' || working !== ' ') print(`${!original && !staged ? '??' : stage + working} ${path}`);
      }
    } else if (command === 'checkout') {
      const target = commits.find(commit => commit.oid === parameters.at(-1));
      if (!target) return 1;
      for (const path of Object.keys(worktree)) fs.unlink(`${root}/${path}`);
      for (const [path, data] of Object.entries(target.files)) {
        fs.ensure(parent(`${root}/${path}`));
        fs.writeFile(`${root}/${path}`, new Uint8Array(data));
      }
    } else throw new Error(`Unexpected command: ${command}`);
    if (root.startsWith('/opfs/')) sync(root);
    return 0;
  };

  const directoryHandle = (path: string): FileSystemDirectoryHandle =>
    ({
      kind: 'directory',
      name: path.split('/').at(-1),
      getDirectoryHandle: async (name: string, options?: FileSystemGetDirectoryOptions) => {
        const target = `${path === '/' ? '' : path}/${name}`;
        if (options?.create) disk.ensure(target);
        if (!disk.analyzePath(target).exists) throw new DOMException('missing', 'NotFoundError');
        if (!disk.isDir(disk.stat(target).mode)) throw new DOMException('wrong kind', 'TypeMismatchError');
        return directoryHandle(target);
      },
      getFileHandle: async (name: string, options?: FileSystemGetFileOptions) => {
        const target = `${path}/${name}`;
        if (!disk.analyzePath(target).exists && options?.create) disk.writeFile(target, new Uint8Array());
        if (!disk.analyzePath(target).exists) throw new DOMException('missing', 'NotFoundError');
        return {
          kind: 'file',
          name,
          getFile: async () => new File([disk.readFile(target)], name),
          createWritable: async () => {
            failJournalAt('create', name);
            let next = new Uint8Array();
            return {
              write: async (bytes: Uint8Array<ArrayBuffer>) => {
                failJournalAt('write', name);
                next = new Uint8Array(bytes);
              },
              close: async () => {
                failJournalAt('close', name);
                disk.writeFile(target, next);
              },
              abort: async () => undefined
            };
          }
        };
      },
      removeEntry: async (name: string) => {
        const target = `${path}/${name}`;
        for (const entry of [...disk.nodes.keys()])
          if (entry === target || entry.startsWith(`${target}/`)) disk.nodes.delete(entry);
      },
      entries: async function* () {
        for (const name of disk.readdir(path).filter(name => name !== '.' && name !== '..'))
          yield [
            name,
            disk.isDir(disk.stat(`${path === '/' ? '' : path}/${name}`).mode) ?
              directoryHandle(`${path}/${name}`)
            : { kind: 'file', name }
          ];
      }
    }) as unknown as FileSystemDirectoryHandle;

  const lockTails = new Map<string, Promise<unknown>>();
  const navigator = {
    storage: { getDirectory: async () => directoryHandle('/') },
    locks: {
      request: async <T>(name: string, action: () => Promise<T>): Promise<T> => {
        const previous = lockTails.get(name) ?? Promise.resolve();
        const result = previous.catch(() => undefined).then(action);
        lockTails.set(name, result);
        return result;
      }
    }
  };

  const loader = {
    load: async (options: {
      moduleOverrides: {
        print(value: unknown): void;
        printErr(value: unknown): void;
        stdout?: (byte: number) => void;
      };
    }) => {
      print = options.moduleOverrides.print;
      printErr = options.moduleOverrides.printErr;
      stdoutCollector = options.moduleOverrides.stdout ?? stdoutCollector;
      return {
        module: {
          FS: fs,
          HEAPU8: new Uint8Array(64),
          opfsWriteFile: write,
          opfsLoadTree: async (root: string) => {
            const diskRoot = root.slice('/opfs'.length);
            if (!disk.analyzePath(diskRoot).exists) return false;
            fs.ensure(root);
            for (const [path, node] of disk.nodes)
              if (path === diskRoot || path.startsWith(`${diskRoot}/`))
                fs.nodes.set(`/opfs${path}`, { mode: node.mode, bytes: new Uint8Array(node.bytes) });
            return true;
          }
        },
        run
      };
    }
  };

  return {
    navigator,
    loader,
    fs,
    disk,
    writes,
    commands,
    failWrite: (path: string) => {
      faultPath = path;
    },
    failCommand: (command: string) => {
      commandFailure = command;
    },
    failJournal: (phase: string) => {
      journalFailure = phase;
    }
  };
}

const loader = 'https://assets.example/git/';
const file = (path: string, text: string) => ({ path, bytes: new TextEncoder().encode(text) });

describe('Git workspace operation contract', () => {
  let fixture: ReturnType<typeof createRuntimeFixture>;
  let runtime: GitWorkbenchRuntime;
  beforeEach(async () => {
    fixture = createRuntimeFixture();
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', fixture.navigator);
    vi.stubGlobal('WebAssembly', {
      Suspending: function Suspending() {
        return undefined;
      }
    });
    runtime = await GitWorkbenchRuntime.create(loader, async () => ({ loadOpfsGit: fixture.loader.load }));
  });

  it('requires explicit browser capabilities', async () => {
    vi.stubGlobal('isSecureContext', false);
    await expect(GitWorkbenchRuntime.create(loader)).rejects.toMatchObject({ code: 'unsupported_environment' });
  });

  it('兼容版本查询，并为无目录的 init 补上临时工作区', async () => {
    const version = await runtime.runTerminal({
      worktree: '/Users/test/repo',
      args: ['--version'],
      cwd: '',
      files: [],
      directories: []
    });
    expect(version).toMatchObject({ exitCode: 0, stdout: 'git version 0.0.17 (wasm-git)' });

    const initialized = await runtime.runTerminal({
      worktree: '/Users/test/repo',
      args: ['init', '-q'],
      cwd: '',
      files: [],
      directories: []
    });
    expect(initialized.exitCode).toBe(0);
    expect(fixture.commands.at(-1)).toEqual(['init', '-q', expect.stringMatching(/^\/tmp\/aiao-terminal-\d+$/)]);
  });

  it('子目录里执行无目录参数的 init 以当前目录为目标', async () => {
    const result = await runtime.runTerminal({
      worktree: '/Users/test/repo',
      args: ['init'],
      cwd: 'nested',
      files: [],
      directories: ['nested']
    });
    expect(result.exitCode).toBe(0);
    expect(result.files.map(entry => entry.path)).toContain('nested/.git/HEAD');
    expect(result.stdout).toBe('Initialized empty Git repository in /Users/test/repo/nested/');
  });

  it('runs terminal commands against an in-memory tree and returns Git mutations', async () => {
    const initial = { files: [file('README.md', 'hello')], directories: [] };
    const initialized = await runtime.runTerminal({
      worktree: '/Users/test/repo',
      args: ['init'],
      cwd: '',
      ...initial
    });
    expect(initialized.exitCode).toBe(0);
    expect(initialized.files.some(entry => entry.path === '.git/HEAD')).toBe(true);
    expect(initialized.directories).toContain('.git/objects/pack');

    const status = await runtime.runTerminal({
      worktree: '/Users/test/repo',
      args: ['status', '--short'],
      cwd: '',
      ...initialized
    });
    expect(status).toMatchObject({ exitCode: 0, stdout: '?? README.md', stderr: '' });
    fixture.failCommand('status');
    const failed = await runtime.runTerminal({
      worktree: '/Users/test/repo',
      args: ['status'],
      cwd: '',
      ...initialized
    });
    expect(failed).toMatchObject({ exitCode: 1, stderr: 'injected command failure' });
    const staged = await runtime.runTerminal({
      worktree: '/Users/test/repo',
      args: ['add', 'README.md'],
      cwd: '',
      ...initialized
    });
    expect(staged.exitCode).toBe(0);
    const committed = await runtime.runTerminal({
      worktree: '/Users/test/repo',
      args: ['commit', '-m', 'initial'],
      cwd: '',
      ...staged
    });
    expect(committed.exitCode).toBe(0);
    expect(committed.files.some(entry => entry.path === '.git/refs/heads/main')).toBe(true);
  });

  it('creates isolated files and returns detached snapshots, revisions and binary bytes', async () => {
    const first = await runtime.initialize('first', [
      file('src/main.ts', 'first'),
      { path: 'asset.bin', bytes: new Uint8Array([255]) }
    ]);
    expect(first.revision).toBe(1);
    expect(runtime.memoryBytes).toBe(64);
    await runtime.initialize('second', [file('src/main.ts', 'second')]);
    expect((await runtime.open('first')).files).toEqual(first.files);
    first.files[0].bytes[0] = 0;
    expect((await runtime.snapshot('first')).files[0].bytes[0]).toBe(255);
    await expect(runtime.initialize('first', [])).rejects.toMatchObject({ code: 'project_exists' });
    await expect(runtime.open('missing')).rejects.toMatchObject({ code: 'project_missing' });
  });

  it('lists loose and packed branches without unsupported for-each-ref options', async () => {
    await runtime.initialize('project', [file('README.md', 'fixture')]);
    await runtime.stage('project', ['README.md']);
    const oid = await runtime.commit('project', 'initial');
    const repository = '/aiao-browser-workbench/projects/project/repository';
    const heads = `${repository}/.git/refs/heads`;
    fixture.disk.writeFile(`${heads}/feature`, new TextEncoder().encode(`${oid}\n`));
    fixture.disk.writeFile(
      `${repository}/.git/packed-refs`,
      new TextEncoder().encode(`# pack-refs with: peeled fully-peeled\n${oid} refs/heads/packed\n${oid} refs/tags/v1\n`)
    );

    await expect(runtime.branches('project')).resolves.toEqual([
      { name: 'feature', oid, current: false },
      { name: 'main', oid, current: true },
      { name: 'packed', oid, current: false }
    ]);
  });

  it('deletes loose and packed branches while preserving the current branch', async () => {
    await runtime.initialize('project', [file('README.md', 'fixture')]);
    await runtime.stage('project', ['README.md']);
    const oid = await runtime.commit('project', 'initial');
    const repository = '/aiao-browser-workbench/projects/project/repository';
    const heads = `${repository}/.git/refs/heads`;
    fixture.disk.writeFile(`${heads}/feature`, new TextEncoder().encode(`${oid}\n`));
    fixture.disk.writeFile(
      `${repository}/.git/packed-refs`,
      new TextEncoder().encode(`# pack-refs with: peeled fully-peeled\n${oid} refs/heads/packed\n`)
    );

    await expect(runtime.deleteBranch('project', 'feature')).resolves.toEqual([
      { name: 'main', oid, current: true },
      { name: 'packed', oid, current: false }
    ]);
    expect(fixture.disk.analyzePath(`${heads}/feature`).exists).toBe(false);

    await expect(runtime.deleteBranch('project', 'packed')).resolves.toEqual([{ name: 'main', oid, current: true }]);
    expect(new TextDecoder().decode(fixture.disk.readFile(`${repository}/.git/packed-refs`))).toBe(
      '# pack-refs with: peeled fully-peeled\n'
    );
    await expect(runtime.deleteBranch('project', 'main')).rejects.toMatchObject({ code: 'git_failed' });
  });

  it('validates branch names before invoking the Git runtime', async () => {
    await runtime.initialize('project', [file('README.md', 'fixture')]);
    for (const name of [
      '',
      ' feature',
      'feature ',
      '-feature',
      'feature..name',
      'feature~name',
      'feature@{name}',
      'feature.lock',
      'feature/',
      'feature//nested'
    ]) {
      await expect(runtime.createBranch('project', name)).rejects.toMatchObject({ code: 'invalid_path' });
    }
  });

  it('serializes edits and rejects stale revisions, collisions and invalid mutations', async () => {
    await runtime.initialize('project', [file('a.txt', 'a')]);
    await Promise.all([
      runtime.save('project', [file('first.txt', '1')]),
      runtime.save('project', [file('second.txt', '2')])
    ]);
    expect((await runtime.snapshot('project')).revision).toBe(3);
    await expect(runtime.save('project', [file('stale.txt', 'bad')], 1)).rejects.toMatchObject({
      code: 'revision_conflict'
    });
    await expect(runtime.save('project', [file('A.txt', 'bad')])).rejects.toMatchObject({ code: 'path_collision' });
    await expect(runtime.save('project', [file('dup', '1'), file('dup', '2')])).rejects.toThrow();
    await runtime.rename('project', 'a.txt', 'nested/b.txt');
    await expect(runtime.rename('project', 'nested/b.txt', 'first.txt')).rejects.toThrow();
    await runtime.remove('project', 'nested/b.txt');
    await expect(runtime.remove('project', 'missing')).rejects.toThrow();
    expect((await runtime.snapshot('project')).files.map(entry => entry.path)).toEqual(['first.txt', 'second.txt']);
  });

  it('moves files and whole folder prefixes in one transaction with collision guards', async () => {
    await runtime.initialize('project', [
      file('a.txt', 'a'),
      file('folder/one.ts', 'one'),
      file('folder/nested/two.ts', 'two')
    ]);
    await runtime.move('project', 'a.txt', 'folder/a.txt');
    await runtime.move('project', 'folder', 'moved');
    expect((await runtime.snapshot('project')).files.map(entry => entry.path)).toEqual([
      'moved/a.txt',
      'moved/nested/two.ts',
      'moved/one.ts'
    ]);
    await expect(runtime.move('project', 'missing', 'elsewhere')).rejects.toMatchObject({ code: 'invalid_path' });
    await expect(runtime.move('project', 'moved/a.txt', 'moved/nested/two.ts')).rejects.toMatchObject({
      code: 'path_collision'
    });
    await expect(runtime.move('project', 'moved/a.txt', 'moved/a.txt')).rejects.toMatchObject({
      code: 'path_collision'
    });
  });

  it('rolls a failed folder move back to the previous snapshot', async () => {
    await runtime.initialize('project', [file('folder/one.ts', 'one'), file('keep.txt', 'keep')]);
    const before = await runtime.snapshot('project');
    fixture.failWrite('moved/one.ts');
    await expect(runtime.move('project', 'folder', 'moved')).rejects.toThrow('quota fixture');
    expect(await runtime.snapshot('project')).toEqual(before);
  });

  it('preserves unstaged edits and rolls back failed save or Git command', async () => {
    await runtime.initialize('project', [file('file.txt', 'one')]);
    await runtime.stage('project', ['file.txt']);
    const oid = await runtime.commit('project', 'first');
    expect((await runtime.status('project')).head).toBe(oid);
    const saved = await runtime.snapshot('project');
    fixture.failWrite('failed.txt');
    await expect(runtime.save('project', [file('file.txt', 'partial'), file('failed.txt', 'bad')])).rejects.toThrow(
      'quota fixture'
    );
    expect(await runtime.snapshot('project')).toEqual(saved);
    fixture.failCommand('add');
    await expect(runtime.stage('project', ['file.txt'])).rejects.toMatchObject({ code: 'git_failed' });
    expect(await runtime.snapshot('project')).toEqual(saved);
    await expect(runtime.stage('project', [])).rejects.toThrow();
    await expect(runtime.commit('project', '')).rejects.toThrow();
  });

  it('rejects a premature commit before staging instead of creating empty history', async () => {
    await runtime.initialize('premature', [file('main.ts', 'untracked')]);
    await expect(runtime.commit('premature', 'clicked before stage completed')).rejects.toThrow(/staged/i);
    expect(await runtime.history('premature')).toEqual([]);
    await runtime.stage('premature', ['main.ts']);
    await runtime.commit('premature', 'actual staged content');
    expect((await runtime.status('premature')).raw).toBe('');
    await expect(runtime.commit('premature', 'duplicate submit')).rejects.toThrow(/staged/i);
  });

  it('restores only reachable clean worktrees and leaves Git metadata unchanged', async () => {
    await runtime.initialize('project', [file('file.txt', 'one')]);
    expect(await runtime.history('project')).toEqual([]);
    await runtime.stage('project', ['file.txt']);
    const first = await runtime.commit('project', 'first');
    await runtime.save('project', [file('file.txt', 'two'), file('new.txt', 'new')]);
    await runtime.stage('project', ['file.txt', 'new.txt']);
    const second = await runtime.commit('project', 'second');
    expect(await runtime.history('project')).toEqual([
      { oid: second, message: 'second', description: '', author: 'Fixture Author', authoredAt: 1700000000000 },
      { oid: first, message: 'first', description: '', author: 'Fixture Author', authoredAt: 1700000000000 }
    ]);
    await expect(runtime.restore('project', 'f'.repeat(40))).rejects.toMatchObject({ code: 'unreachable_commit' });
    await expect(runtime.restore('project', 'short')).rejects.toThrow();
    await runtime.restore('project', first);
    expect((await runtime.status('project')).head).toBe(second);
    expect((await runtime.snapshot('project')).files).toEqual([file('file.txt', 'one')]);
    await expect(runtime.restore('project', first)).rejects.toMatchObject({ code: 'dirty_workspace' });
  });

  it('restores with untracked files present and preserves them', async () => {
    await runtime.initialize('project', [file('file.txt', 'one')]);
    await runtime.stage('project', ['file.txt']);
    const first = await runtime.commit('project', 'first');
    await runtime.save('project', [file('file.txt', 'two')]);
    await runtime.stage('project', ['file.txt']);
    const second = await runtime.commit('project', 'second');
    await runtime.save('project', [file('draft.txt', 'draft')]);
    await runtime.restore('project', first);
    expect((await runtime.status('project')).head).toBe(second);
    expect((await runtime.snapshot('project')).files).toEqual([file('draft.txt', 'draft'), file('file.txt', 'one')]);
    await expect(runtime.restore('project', first)).rejects.toMatchObject({ code: 'dirty_workspace' });
  });

  it('列出提交相对父提交的新增、修改和删除文件', async () => {
    await runtime.initialize('project', [file('a.txt', 'one')]);
    await runtime.stage('project', ['a.txt']);
    const first = await runtime.commit('project', 'first');
    await runtime.save('project', [file('a.txt', 'two'), file('b.txt', 'new')]);
    await runtime.stage('project', ['a.txt', 'b.txt']);
    const second = await runtime.commit('project', 'second');

    await expect(runtime.commitChanges('project', first)).resolves.toEqual([
      expect.objectContaining({
        path: 'a.txt',
        status: 'added',
        base: expect.objectContaining({ exists: false }),
        modified: expect.objectContaining({ text: 'one' })
      })
    ]);
    await expect(runtime.commitChanges('project', second)).resolves.toEqual([
      expect.objectContaining({
        path: 'a.txt',
        status: 'modified',
        base: expect.objectContaining({ text: 'one' }),
        modified: expect.objectContaining({ text: 'two' })
      }),
      expect.objectContaining({
        path: 'b.txt',
        status: 'added',
        base: expect.objectContaining({ exists: false }),
        modified: expect.objectContaining({ text: 'new' })
      })
    ]);

    await runtime.save('project', [file('b.txt', 'new')], undefined, ['a.txt']);
    await runtime.stage('project', ['a.txt']);
    const third = await runtime.commit('project', 'third');
    await expect(runtime.commitChanges('project', third)).resolves.toEqual([
      expect.objectContaining({
        path: 'a.txt',
        status: 'deleted',
        base: expect.objectContaining({ text: 'two' }),
        modified: expect.objectContaining({ exists: false })
      })
    ]);
  });

  it('imports archives into new roots and rolls back invalid repositories', async () => {
    await runtime.initialize('source', [file('main.ts', 'hello')]);
    const archive = await runtime.exportArchive('source');
    await runtime.importArchive('copy', archive);
    expect((await runtime.snapshot('copy')).files).toEqual([file('main.ts', 'hello')]);
    await expect(runtime.importArchive('copy', archive)).rejects.toMatchObject({ code: 'project_exists' });
    fixture.failCommand('status');
    await expect(runtime.importArchive('failed', archive)).rejects.toThrow();
    await runtime.importArchive('failed', archive);
  });

  it('recovers a persisted interrupted-operation journal before a read', async () => {
    await runtime.initialize('project', [file('main.ts', 'before')]);
    const zip = await runtime.exportArchive('project');
    const journal = new Uint8Array(zip.length + 8);
    new DataView(journal.buffer).setFloat64(0, 1, true);
    journal.set(zip, 8);
    const root = '/aiao-browser-workbench/projects/project';
    fixture.disk.writeFile(`${root}/recovery.bin`, journal);
    fixture.disk.writeFile(`${root}/repository/main.ts`, new TextEncoder().encode('partial'));
    expect((await runtime.snapshot('project')).files).toEqual([file('main.ts', 'before')]);
    expect(fixture.disk.analyzePath(`${root}/recovery.bin`).exists).toBe(false);
    fixture.disk.writeFile(`${root}/recovery.bin`, new Uint8Array(3));
    await expect(runtime.snapshot('project')).rejects.toThrow(/corrupt/);
  });

  it('cleans up initialization failures and blocks incomplete existing projects', async () => {
    fixture.failWrite('failed.txt');
    await expect(runtime.initialize('failed', [file('failed.txt', 'bad')])).rejects.toThrow();
    await runtime.initialize('failed', []);
    fixture.disk.ensure('/aiao-browser-workbench/projects/incomplete/repository');
    await expect(runtime.initialize('incomplete', [])).rejects.toMatchObject({ code: 'project_exists' });
    const unsafe = encodeGitArchive({
      files: [
        file('.git/HEAD', 'ref: refs/heads/main\n'),
        file('.git/config', '[core]\n bare=false\n'),
        file('link', 'text')
      ],
      directories: ['.git']
    });
    expect(unsafe.length).toBeGreaterThan(0);
  });

  it.each(['create', 'write', 'close'])(
    'keeps the original project openable and exportable when initial journal %s fails',
    async phase => {
      await runtime.initialize('project', [file('main.ts', 'original')]);
      const before = await runtime.snapshot('project');
      fixture.failJournal(phase);
      await expect(runtime.save('project', [file('main.ts', 'should not persist')])).rejects.toThrow(
        `journal ${phase} failed`
      );
      expect(fixture.disk.analyzePath('/aiao-browser-workbench/projects/project/recovery.bin').exists).toBe(false);
      expect(await runtime.open('project')).toEqual(before);
      expect((await runtime.exportArchive('project')).byteLength).toBeGreaterThan(0);
    }
  );

  it('clears only an empty unpublished journal left by interruption and preserves nonempty corrupt evidence', async () => {
    await runtime.initialize('project', [file('main.ts', 'original')]);
    const journalPath = '/aiao-browser-workbench/projects/project/recovery.bin';
    fixture.disk.writeFile(journalPath, new Uint8Array());
    expect((await runtime.open('project')).files).toEqual([file('main.ts', 'original')]);
    expect((await runtime.exportArchive('project')).byteLength).toBeGreaterThan(0);
    expect(fixture.disk.analyzePath(journalPath).exists).toBe(false);
    fixture.disk.writeFile(journalPath, new Uint8Array([1, 2, 3]));
    await expect(runtime.open('project')).rejects.toThrow(/corrupt/i);
    expect(fixture.disk.readFile(journalPath)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('精确读取HEAD/index/working差异且不改真实历史与index', async () => {
    await runtime.initialize('project', [file('main.ts', '\uFEFFone\r\n')]);
    await runtime.stage('project', ['main.ts']);
    await runtime.commit('project', 'initial');
    await runtime.save('project', [file('main.ts', '\uFEFFtwo\r\n')]);
    await runtime.stage('project', ['main.ts']);
    await runtime.save('project', [file('main.ts', '\uFEFFthree\r\n')]);
    const before = await runtime.snapshot('project');
    const index = fixture.disk.readFile('/aiao-browser-workbench/projects/project/repository/.git/index');
    expect((await runtime.readDiff('project', 'main.ts', 'working')).base.text).toBe('\uFEFFtwo\r\n');
    expect((await runtime.readDiff('project', 'main.ts', 'working')).modified.text).toBe('\uFEFFthree\r\n');
    expect((await runtime.readDiff('project', 'main.ts', 'staged')).base.text).toBe('\uFEFFone\r\n');
    expect((await runtime.readDiff('project', 'main.ts', 'staged')).modified.text).toBe('\uFEFFtwo\r\n');
    expect(await runtime.snapshot('project')).toEqual(before);
    expect(await runtime.history('project')).toHaveLength(1);
    expect(fixture.disk.readFile('/aiao-browser-workbench/projects/project/repository/.git/index')).toEqual(index);
  });

  it('取消单文件暂存保持其他暂存内容、全部工作区与revision', async () => {
    await runtime.initialize('project', [file('a.ts', 'a1'), file('b.ts', 'b1')]);
    await runtime.stage('project', ['a.ts', 'b.ts']);
    await runtime.commit('project', 'initial');
    await runtime.save('project', [file('a.ts', 'a2'), file('b.ts', 'b2')]);
    await runtime.stage('project', ['a.ts', 'b.ts']);
    await runtime.save('project', [file('a.ts', 'a3')]);
    const before = await runtime.snapshot('project');
    await runtime.unstage('project', ['a.ts']);
    expect(await runtime.snapshot('project')).toEqual(before);
    expect((await runtime.status('project')).raw).toContain(' M a.ts');
    expect((await runtime.status('project')).raw).toContain('M  b.ts');
    expect((await runtime.readDiff('project', 'b.ts', 'staged')).modified.text).toBe('b2');
    await expect(runtime.unstage('project', ['a.ts'])).rejects.toMatchObject({ code: 'nothing_staged' });
    await expect(runtime.unstage('project', [])).rejects.toThrow();
  });

  it('空仓库也能读取未暂存文件的工作区差异', async () => {
    await runtime.initialize('empty', []);
    await runtime.save('empty', [file('new.ts', 'new')], 1);

    await expect(runtime.readDiff('empty', 'new.ts', 'working')).resolves.toMatchObject({
      base: { exists: false },
      modified: { exists: true, text: 'new' }
    });
  });

  it('首次提交前可读取新增文件工作区差异并撤销暂存', async () => {
    await runtime.initialize('project', [file('new.ts', 'new')]);
    const working = await runtime.readDiff('project', 'new.ts', 'working');
    expect(working.base.exists).toBe(false);
    expect(working.modified.text).toBe('new');
    await runtime.stage('project', ['new.ts']);
    const staged = await runtime.readDiff('project', 'new.ts', 'staged');
    expect(staged.base.exists).toBe(false);
    expect(staged.modified.text).toBe('new');
    await runtime.unstage('project', ['new.ts']);
    expect((await runtime.status('project')).head).toBeNull();
    expect((await runtime.status('project')).raw).toBe('?? new.ts');
    await expect(runtime.readDiff('project', '../outside', 'working')).rejects.toThrow();
    await expect(runtime.readDiff('project', 'new.ts', 'unknown' as 'working')).rejects.toThrow();
  });

  it('单文件丢弃回到index，不动其他工作区与已暂存字节', async () => {
    await runtime.initialize('project', [file('a.ts', 'head'), file('b.ts', 'keep')]);
    await runtime.stage('project', ['a.ts', 'b.ts']);
    await runtime.commit('project', 'initial');
    await runtime.save('project', [file('a.ts', 'index')]);
    await runtime.stage('project', ['a.ts']);
    await runtime.save('project', [file('a.ts', 'working'), file('b.ts', 'other'), file('new.ts', 'new')]);
    const index = fixture.disk.readFile('/aiao-browser-workbench/projects/project/repository/.git/index');
    const result = await runtime.discardWorking('project', 'a.ts');
    expect(result.files).toContainEqual(file('a.ts', 'index'));
    expect(result.files).toContainEqual(file('b.ts', 'other'));
    expect(fixture.disk.readFile('/aiao-browser-workbench/projects/project/repository/.git/index')).toEqual(index);
    await runtime.remove('project', 'a.ts');
    await runtime.discardWorking('project', 'a.ts');
    expect((await runtime.snapshot('project')).files).toContainEqual(file('a.ts', 'index'));
    await runtime.discardWorking('project', 'new.ts');
    expect((await runtime.snapshot('project')).files.some(entry => entry.path === 'new.ts')).toBe(false);
    await expect(runtime.discardWorking('project', 'a.ts')).rejects.toThrow(/working change/);
  });

  it('取消暂存或丢弃写入失败从journal恢复原index与工作区', async () => {
    await runtime.initialize('project', [file('a.ts', 'head')]);
    await runtime.stage('project', ['a.ts']);
    await runtime.commit('project', 'initial');
    await runtime.save('project', [file('a.ts', 'staged')]);
    await runtime.stage('project', ['a.ts']);
    await runtime.save('project', [file('a.ts', 'working')]);
    const before = await runtime.snapshot('project');
    const status = await runtime.status('project');
    fixture.failWrite('.git/index');
    await expect(runtime.unstage('project', ['a.ts'])).rejects.toThrow('quota fixture');
    expect(await runtime.snapshot('project')).toEqual(before);
    expect(await runtime.status('project')).toEqual(status);
    fixture.failWrite('a.ts');
    await expect(runtime.discardWorking('project', 'a.ts')).rejects.toThrow('quota fixture');
    expect(await runtime.snapshot('project')).toEqual(before);
    expect(await runtime.status('project')).toEqual(status);
    fixture.failCommand('status');
    await expect(runtime.readDiff('project', 'a.ts', 'working')).rejects.toMatchObject({ code: 'git_failed' });
    expect(await runtime.snapshot('project')).toEqual(before);
  });

  it('保存可原子写入与删除文件，保留未提及文件并只推进一次revision', async () => {
    await runtime.initialize('project', [file('keep.ts', 'keep'), file('old.ts', 'old')]);
    const saved = await runtime.save('project', [file('new.ts', 'new')], 1, ['old.ts']);
    expect(saved).toEqual({
      projectId: 'project',
      revision: 2,
      files: [file('keep.ts', 'keep'), file('new.ts', 'new')]
    });
  });

  it('写入失败回滚同批已删除文件与revision', async () => {
    await runtime.initialize('project', [file('old.ts', 'old')]);
    const before = await runtime.snapshot('project');
    fixture.failWrite('new.ts');
    await expect(runtime.save('project', [file('new.ts', 'new')], 1, ['old.ts'])).rejects.toThrow('quota fixture');
    expect(await runtime.snapshot('project')).toEqual(before);
  });

  it('原子保存允许文件和目录互换，删除遗留空目录不会阻塞写入', async () => {
    await runtime.initialize('project', [file('nested/dir/old.ts', 'old')]);
    const flat = await runtime.save('project', [file('nested', 'flat')], 1, ['nested/dir/old.ts']);
    expect(flat.files).toEqual([file('nested', 'flat')]);
    const nested = await runtime.save('project', [file('nested/next.ts', 'next')], 2, ['nested']);
    expect(nested.files).toEqual([file('nested/next.ts', 'next')]);
  });

  it('删除路径与写入冲突、越界或过期revision时整批拒绝', async () => {
    await runtime.initialize('project', [file('old.ts', 'old')]);
    const before = await runtime.snapshot('project');
    await expect(runtime.save('project', [file('new.ts', 'new')], 0, ['old.ts'])).rejects.toMatchObject({
      code: 'revision_conflict'
    });
    await expect(runtime.save('project', [file('old.ts', 'new')], 1, ['old.ts'])).rejects.toMatchObject({
      code: 'path_collision'
    });
    await expect(runtime.save('project', [], 1, ['.git/config'])).rejects.toMatchObject({ code: 'invalid_path' });
    await expect(runtime.save('project', [], 1, ['../old.ts'])).rejects.toMatchObject({ code: 'invalid_path' });
    await expect(runtime.save('project', [], 1, ['missing.ts'])).rejects.toMatchObject({ code: 'invalid_path' });
    expect(await runtime.snapshot('project')).toEqual(before);
  });

  it('增量内容超限或保留文件产生路径碰撞时不删除原文件', async () => {
    await runtime.initialize('project', [file('old.ts', 'old'), file('keep/child.ts', 'keep')]);
    const before = await runtime.snapshot('project');
    await expect(
      runtime.save('project', [{ path: 'huge.bin', bytes: new Uint8Array(GIT_WORKBENCH_LIMITS.fileBytes + 1) }], 1, [
        'old.ts'
      ])
    ).rejects.toMatchObject({ code: 'resource_limit' });
    await expect(runtime.save('project', [file('keep', 'collision')], 1, ['old.ts'])).rejects.toMatchObject({
      code: 'path_collision'
    });
    expect(await runtime.snapshot('project')).toEqual(before);
  });

  it('保存整份文件映射只写变化和新增字节，未变文件不重写且no-op仍按原规则递增revision', async () => {
    const initial = Array.from({ length: 50 }, (_, index) => file(`f-${index}.ts`, `value ${index}`));
    await runtime.initialize('project', initial);
    const before = new Map(fixture.writes);
    const next = initial.map(entry => (entry.path === 'f-25.ts' ? file(entry.path, 'value 99') : entry));
    next.push(file('new.ts', 'new'));
    const saved = await runtime.save('project', next, 1);
    const prefix = '/opfs/aiao-browser-workbench/projects/project/repository/';
    expect(saved.revision).toBe(2);
    expect(fixture.writes.get(`${prefix}f-25.ts`)).toBe((before.get(`${prefix}f-25.ts`) ?? 0) + 1);
    expect(fixture.writes.get(`${prefix}new.ts`)).toBe(1);
    for (const entry of initial.filter(entry => entry.path !== 'f-25.ts'))
      expect(fixture.writes.get(prefix + entry.path)).toBe(before.get(prefix + entry.path));
    const written = new Map(fixture.writes);
    const noop = await runtime.save('project', next, 2);
    expect(noop.revision).toBe(3);
    expect(fixture.writes).toEqual(written);
  });

  it('提交内容、暂存快照与差异都只读获取，不再触发 checkout（lg2 堆损坏的写路径）', async () => {
    const binary = new Uint8Array([0, 255, 10, 13, 0, 128]);
    await runtime.initialize('project', [file('main.ts', 'hello'), { path: 'asset.bin', bytes: binary }]);
    await runtime.stage('project', ['main.ts', 'asset.bin']);
    const oid = await runtime.commit('project', 'initial');
    await runtime.save('project', [file('main.ts', 'changed'), { path: 'asset.bin', bytes: binary }], 1);
    await runtime.stage('project', ['main.ts', 'asset.bin']);
    await runtime.readDiff('project', 'main.ts', 'staged');
    await runtime.readDiff('project', 'main.ts', 'working');
    await runtime.committed('project');
    await runtime.commitChanges('project', oid);
    await runtime.snapshot('project');
    expect(fixture.commands.filter(command => command[0] === 'checkout')).toEqual([]);
  });

  it('提交的二进制文件经 cat-file 逐字节往返', async () => {
    const binary = new Uint8Array([0, 255, 10, 13, 0, 128, 7]);
    await runtime.initialize('project', [{ path: 'asset.bin', bytes: binary }]);
    await runtime.stage('project', ['asset.bin']);
    const oid = await runtime.commit('project', 'binary');
    const committed = await runtime.committed('project');
    expect(committed.files).toEqual([{ path: 'asset.bin', bytes: binary }]);
    const changes = await runtime.commitChanges('project', oid);
    expect(changes).toEqual([
      {
        projectId: 'project',
        oid,
        path: 'asset.bin',
        status: 'added',
        base: { exists: false, binary: false, text: null, byteLength: 0 },
        modified: { exists: true, binary: true, text: null, byteLength: binary.length }
      }
    ]);
  });

  it('暂存但未提交的二进制内容经 index 解析读取，保持逐字节一致', async () => {
    const binary = new Uint8Array([1, 2, 0, 255, 254, 0]);
    await runtime.initialize('project', [file('draft.txt', 'one')]);
    await runtime.stage('project', ['draft.txt']);
    await runtime.commit('project', 'base');
    await runtime.save('project', [{ path: 'draft.txt', bytes: binary }], 1);
    await runtime.stage('project', ['draft.txt']);
    const diff = await runtime.readDiff('project', 'draft.txt', 'staged');
    expect(diff.modified).toEqual({ exists: true, binary: true, text: null, byteLength: binary.length });
    const snapshot = await runtime.snapshot('project');
    expect(snapshot.files).toEqual([{ path: 'draft.txt', bytes: binary }]);
  });
});
