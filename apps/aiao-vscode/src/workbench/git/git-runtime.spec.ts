import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeGitArchive } from './git-archive.js';
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
  let faultPath = '';
  let commandFailure = '';
  let journalFailure = '';
  const writes = new Map<string, number>();
  const failJournalAt = (phase: string, name: string): void => {
    if (name !== 'recovery.bin' || journalFailure !== phase) return;
    journalFailure = '';
    throw new DOMException(`journal ${phase} failed`, 'QuotaExceededError');
  };

  const parse = <T>(path: string, fallback: T): T =>
    fs.analyzePath(path).exists ? (JSON.parse(new TextDecoder().decode(fs.readFile(path))) as T) : fallback;
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
    const [command, ...parameters] = args;
    if (command === commandFailure) {
      commandFailure = '';
      printErr('injected command failure');
      return 1;
    }
    const root = command === 'init' ? parameters[0] : fs.cwd;
    const git = `${root}/.git`;
    const indexPath = `${git}/index`;
    const commitsPath = `${git}/fixture-commits.json`;
    const index = parse<Record<string, number[]>>(indexPath, {});
    const commits = parse<Commit[]>(commitsPath, []);
    const head = commits.at(-1);
    const worktree = files(root);
    if (command === 'init') {
      fs.ensure(`${git}/objects/pack`);
      fs.ensure(`${git}/refs/heads`);
      fs.writeFile(`${git}/HEAD`, new TextEncoder().encode('ref: refs/heads/main\n'));
      fs.writeFile(`${git}/config`, new TextEncoder().encode('[core]\n bare = false\n'));
    } else if (command === 'config') {
      const old = new TextDecoder().decode(fs.readFile(`${git}/config`));
      fs.writeFile(
        `${git}/config`,
        new TextEncoder().encode(`${old}\n[fixture]\n ${parameters[0].replace('.', '-')} = ${parameters[1]}\n`)
      );
    } else if (command === 'add') {
      for (const path of parameters) {
        if (worktree[path]) index[path] = worktree[path];
        else delete index[path];
      }
      fs.writeFile(indexPath, encode(index));
    } else if (command === 'commit') {
      const commit = { oid: (commits.length + 1).toString(16).padStart(40, '0'), message: parameters[1], files: index };
      commits.push(commit);
      fs.writeFile(commitsPath, encode(commits));
      fs.writeFile(`${git}/refs/heads/main`, new TextEncoder().encode(commit.oid));
    } else if (command === 'rev-parse') {
      if (!head) {
        printErr('unborn');
        return 1;
      }
      print(head.oid);
    } else if (command === 'ls-files') print(Object.keys(index).join('\n'));
    else if (command === 'rev-list') print(commits.map(commit => commit.oid).join('\n'));
    else if (command === 'log')
      print(
        [...commits]
          .reverse()
          .map(commit => `${commit.oid} ${commit.message}`)
          .join('\n')
      );
    else if (command === 'status') {
      const paths = new Set([...Object.keys(head?.files ?? {}), ...Object.keys(index), ...Object.keys(worktree)]);
      for (const path of [...paths].sort()) {
        const original = head?.files[path];
        const staged = index[path];
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
    load: async (options: { moduleOverrides: { print(value: unknown): void; printErr(value: unknown): void } }) => {
      print = options.moduleOverrides.print;
      printErr = options.moduleOverrides.printErr;
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
      { oid: second, message: 'second' },
      { oid: first, message: 'first' }
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

  it('首次提交前可撤销新增文件暂存，差异正确区分缺失文件', async () => {
    await runtime.initialize('project', [file('new.ts', 'new')]);
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
    fixture.failCommand('commit');
    await expect(runtime.readDiff('project', 'a.ts', 'working')).rejects.toMatchObject({ code: 'git_failed' });
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
});
