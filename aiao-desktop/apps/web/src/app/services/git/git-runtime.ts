import { assertGitFileLimits, decodeGitArchive, encodeGitArchive, type GitArchive } from './git-archive.js';
import { gitFileVersion } from './git-diff.js';
import {
  assertGitPath,
  assertNoPathCollisions,
  assertProjectId,
  GIT_WORKBENCH_ROOT,
  literalGitPathspec
} from './git-paths.js';
import {
  type GitBranch,
  type GitCommit,
  type GitFile,
  type GitFileDiff,
  type GitSnapshot,
  type GitStatus,
  GitWorkbenchError
} from './git-protocol.js';
import { parseGitStatus } from './git-status.js';

interface WasmFilesystem {
  chdir(path: string): void;
  mkdir(path: string): void;
  readdir(path: string): string[];
  readFile(path: string): Uint8Array<ArrayBuffer>;
  writeFile(path: string, bytes: Uint8Array<ArrayBuffer>): void;
  unlink(path: string): void;
  rmdir(path: string): void;
  stat(path: string): { mode: number };
  lstat(path: string): { mode: number };
  isDir(mode: number): boolean;
  isFile(mode: number): boolean;
  analyzePath(path: string): { exists: boolean };
}

interface WasmGit {
  readonly module: {
    readonly FS: WasmFilesystem;
    readonly HEAPU8: Uint8Array;
    opfsLoadTree(path: string): Promise<boolean>;
    opfsWriteFile(path: string, bytes: Uint8Array<ArrayBuffer> | string): Promise<void>;
  };
  run(args: string[]): Promise<number>;
}

interface GitLoader {
  loadOpfsGit(options: {
    variant: 'jspi';
    baseUrl: string;
    user: string;
    email: string;
    moduleOverrides: { print(value: unknown): void; printErr(value: unknown): void };
  }): Promise<WasmGit>;
}

interface ProjectContext {
  readonly projectId: string;
  readonly root: string;
  readonly directory: FileSystemDirectoryHandle;
  revision: number;
}

function sameFileBytes(previous: Uint8Array<ArrayBuffer> | undefined, next: Uint8Array<ArrayBuffer>): boolean {
  if (!previous || previous.length !== next.length) return false;
  for (let index = 0; index < next.length; index++) if (previous[index] !== next[index]) return false;
  return true;
}

export class GitWorkbenchRuntime {
  #queue: Promise<unknown>;
  #stdout: string[] = [];
  #stderr: string[] = [];
  #git: WasmGit | undefined;
  #scratch = 0;

  private get git(): WasmGit {
    if (!this.#git) throw new GitWorkbenchError('unsupported_environment', 'Git runtime is not initialized');
    return this.#git;
  }

  private get fs(): WasmFilesystem {
    return this.git.module.FS;
  }

  get memoryBytes(): number {
    return this.git.module.HEAPU8.buffer.byteLength;
  }

  private constructor() {
    this.#queue = Promise.resolve();
  }

  static async create(
    vendorBaseUrl: string,
    loadModule: (url: string) => Promise<GitLoader> = async url => import(/* @vite-ignore */ url) as Promise<GitLoader>
  ): Promise<GitWorkbenchRuntime> {
    const runtime = new GitWorkbenchRuntime();
    const wasm = WebAssembly as unknown as { Suspending?: unknown };
    if (
      !globalThis.isSecureContext ||
      !navigator.storage?.getDirectory ||
      !navigator.locks?.request ||
      typeof wasm.Suspending !== 'function'
    )
      throw new GitWorkbenchError(
        'unsupported_environment',
        'Secure context, OPFS, Web Locks and WebAssembly JSPI are required'
      );
    const loaderUrl = new URL('lg2_opfs_auto.js', vendorBaseUrl).href;
    const loader = await loadModule(loaderUrl);
    runtime.#git = await loader.loadOpfsGit({
      variant: 'jspi',
      baseUrl: vendorBaseUrl,
      user: 'Browser Workbench',
      email: 'workbench@example.invalid',
      moduleOverrides: {
        print: value => runtime.#stdout.push(String(value)),
        printErr: value => runtime.#stderr.push(String(value))
      }
    });
    return runtime;
  }

  async initialize(projectId: string, files: readonly GitFile[]): Promise<GitSnapshot> {
    this.validateFiles(files);
    return this.lock(projectId, false, async context => {
      if (await this.exists(context.directory, 'state.json'))
        throw new GitWorkbenchError('project_exists', `Project already exists: ${projectId}`);
      if (await this.exists(context.directory, 'repository'))
        throw new GitWorkbenchError(
          'project_exists',
          'Incomplete project already exists; import under a new identifier'
        );
      try {
        await this.run(['init', context.root]);
        this.fs.chdir(context.root);
        await this.git.module.opfsWriteFile(`${context.root}/.git/HEAD`, 'ref: refs/heads/main\n');
        await this.run(['config', 'core.filemode', 'false']);
        await this.run(['config', 'user.name', 'Browser Workbench']);
        await this.run(['config', 'user.email', 'workbench@example.invalid']);
        for (const file of files) await this.write(context.root, file);
        await this.writeState(context, 1);
        return this.snapshotContext(context);
      } catch (cause) {
        await this.removeDisk(context.directory, 'repository');
        this.clearMemory(context.root);
        throw cause;
      }
    });
  }

  async open(projectId: string): Promise<GitSnapshot> {
    return this.snapshot(projectId);
  }

  async snapshot(projectId: string): Promise<GitSnapshot> {
    return this.lock(projectId, true, context => this.snapshotContext(context));
  }

  async save(
    projectId: string,
    files: readonly GitFile[],
    expectedRevision?: number,
    removedPaths: readonly string[] = []
  ): Promise<GitSnapshot> {
    this.validateFiles(files);
    removedPaths.forEach(path => assertGitPath(path));
    const removed = new Set(removedPaths);
    if (files.some(file => removed.has(file.path)))
      throw new GitWorkbenchError('path_collision', 'A file cannot be written and removed together');
    return this.lock(projectId, true, async context => {
      if (expectedRevision !== undefined && expectedRevision !== context.revision)
        throw new GitWorkbenchError(
          'revision_conflict',
          `Expected revision ${expectedRevision}, current revision is ${context.revision}`
        );
      const current = this.snapshotContext(context).files;
      const previous = new Map(current.map(file => [file.path, file.bytes]));
      for (const path of removed) this.requireFile(`${context.root}/${path}`);
      const changed = files.filter(file => !sameFileBytes(previous.get(file.path), file.bytes));
      const next = new Map(current.map(file => [file.path, file]));
      for (const path of removed) next.delete(path);
      for (const file of files) next.set(file.path, file);
      this.validateFiles([...next.values()]);
      return this.mutate(context, async () => {
        for (const path of removed) await this.removePersistent(context.root, path);
        for (const file of changed) await this.write(context.root, file);
        return () => this.snapshotContext(context);
      });
    });
  }

  async remove(projectId: string, path: string): Promise<GitSnapshot> {
    assertGitPath(path);
    return this.lock(projectId, true, context =>
      this.mutate(context, async () => {
        this.requireFile(`${context.root}/${path}`);
        await this.removePersistent(context.root, path);
        return () => this.snapshotContext(context);
      })
    );
  }

  async rename(projectId: string, path: string, destination: string): Promise<GitSnapshot> {
    assertGitPath(path);
    assertGitPath(destination);
    return this.lock(projectId, true, async context => {
      this.requireFile(`${context.root}/${path}`);
      const existing = this.snapshotContext(context).files;
      if (existing.some(file => file.path === destination))
        throw new GitWorkbenchError('path_collision', `Destination exists: ${destination}`);
      this.validateFiles(existing.map(file => (file.path === path ? { ...file, path: destination } : file)));
      return this.mutate(context, async () => {
        const bytes = new Uint8Array(this.fs.readFile(`${context.root}/${path}`));
        await this.write(context.root, { path: destination, bytes });
        await this.removePersistent(context.root, path);
        return () => this.snapshotContext(context);
      });
    });
  }

  async move(projectId: string, path: string, destination: string): Promise<GitSnapshot> {
    assertGitPath(path);
    assertGitPath(destination);
    return this.lock(projectId, true, async context => {
      if (destination === path)
        throw new GitWorkbenchError('path_collision', `Destination is the source: ${destination}`);
      const existing = this.snapshotContext(context).files;
      const moved = existing.filter(file => file.path === path || file.path.startsWith(`${path}/`));
      if (!moved.length) throw new GitWorkbenchError('invalid_path', `File does not exist: ${path}`);
      const relocated = moved.map(file => ({ ...file, path: `${destination}${file.path.slice(path.length)}` }));
      this.validateFiles([...existing.filter(file => !moved.includes(file)), ...relocated]);
      return this.mutate(context, async () => {
        for (const file of moved) await this.removePersistent(context.root, file.path);
        for (const file of relocated) await this.write(context.root, file);
        return () => this.snapshotContext(context);
      });
    });
  }

  async status(projectId: string): Promise<GitStatus> {
    return this.lock(projectId, true, context => this.statusContext(context));
  }

  async stage(projectId: string, paths: readonly string[]): Promise<GitStatus> {
    paths.forEach(path => assertGitPath(path));
    if (!paths.length) throw new GitWorkbenchError('invalid_path', 'Stage requires file paths');
    return this.lock(projectId, true, context =>
      this.mutate(
        context,
        async () => {
          await this.run(['add', ...paths.map(literalGitPathspec)]);
          const result = await this.statusContext(context);
          return () => result;
        },
        false
      )
    );
  }

  async unstage(projectId: string, paths: readonly string[]): Promise<GitStatus> {
    paths.forEach(path => assertGitPath(path));
    if (!paths.length) throw new GitWorkbenchError('invalid_path', 'Unstage requires file paths');
    return this.lock(projectId, true, async context => {
      const status = await this.statusContext(context);
      const selected = new Set<string>();
      for (const path of paths) {
        const entry = status.entries.find(entry => entry.path === path && /^[MADRCT]$/.test(entry.index));
        if (!entry) throw new GitWorkbenchError('nothing_staged', `No staged change for ${path}`);
        selected.add(path);
        if (entry.index === 'R' && entry.originalPath) selected.add(entry.originalPath);
      }
      const headFiles = status.head ? await this.readCommitFiles(context, status.head) : [];
      const head = new Map(headFiles.map(file => [file.path, file.bytes]));
      const index = await this.inScratch(context, async scratch => {
        for (const path of selected) {
          const bytes = head.get(path);
          if (bytes) {
            this.ensureMemoryDirectory(`${scratch}/${path}`);
            this.fs.writeFile(`${scratch}/${path}`, bytes);
          }
        }
        await this.run(['add', ...[...selected].map(literalGitPathspec)]);
        return new Uint8Array(this.fs.readFile(`${scratch}/.git/index`));
      });
      return this.mutate(
        context,
        async () => {
          await this.git.module.opfsWriteFile(`${context.root}/.git/index`, index);
          const result = await this.statusContext(context);
          return () => result;
        },
        false
      );
    });
  }

  async readDiff(projectId: string, path: string, kind: 'working' | 'staged'): Promise<GitFileDiff> {
    assertGitPath(path);
    if (kind !== 'working' && kind !== 'staged') throw new GitWorkbenchError('invalid_path', 'Unknown diff kind');
    return this.lock(projectId, true, async context => {
      const status = await this.statusContext(context);
      const index = new Map((await this.readIndexFiles(context)).map(file => [file.path, file.bytes]));
      if (kind === 'working') {
        const current = this.snapshotContext(context).files.find(file => file.path === path)?.bytes;
        return { projectId, path, kind, base: gitFileVersion(index.get(path)), modified: gitFileVersion(current) };
      }
      const entry = status.entries.find(entry => entry.path === path);
      const basePath = entry?.originalPath ?? path;
      const head = status.head ? await this.readCommitFiles(context, status.head) : [];
      return {
        projectId,
        path,
        kind,
        base: gitFileVersion(head.find(file => file.path === basePath)?.bytes),
        modified: gitFileVersion(index.get(path))
      };
    });
  }

  async discardWorking(projectId: string, path: string): Promise<GitSnapshot> {
    assertGitPath(path);
    return this.lock(projectId, true, async context => {
      const status = await this.statusContext(context);
      const entry = status.entries.find(
        entry => entry.path === path && entry.worktree !== ' ' && entry.worktree !== '!'
      );
      if (!entry) throw new GitWorkbenchError('invalid_path', `No working change for ${path}`);
      const index = await this.readIndexFiles(context);
      const bytes = index.find(file => file.path === path)?.bytes;
      const current = this.snapshotContext(context).files;
      const next = current.filter(file => file.path !== path);
      if (bytes) next.push({ path, bytes });
      this.validateFiles(next);
      return this.mutate(context, async () => {
        if (bytes) await this.write(context.root, { path, bytes });
        else await this.removePersistent(context.root, path);
        return () => this.snapshotContext(context);
      });
    });
  }

  async branches(projectId: string): Promise<readonly GitBranch[]> {
    return this.lock(projectId, true, async context => this.branchesContext(context));
  }

  async createBranch(projectId: string, name: string): Promise<readonly GitBranch[]> {
    return this.lock(projectId, true, async context => {
      this.assertBranchName(name);
      const status = await this.statusContext(context);
      if (!status.head) throw new GitWorkbenchError('git_failed', 'Cannot create a branch before the first commit');
      if (this.readBranchRefs(context.root).has(name))
        throw new GitWorkbenchError('git_failed', 'Branch already exists');
      return this.mutate(
        context,
        async () => {
          await this.writeRepositoryFile(
            context,
            `.git/refs/heads/${name}`,
            new TextEncoder().encode(`${status.head}\n`)
          );
          const result = await this.branchesContext(context);
          return () => result;
        },
        false
      );
    });
  }

  async deleteBranch(projectId: string, name: string): Promise<readonly GitBranch[]> {
    return this.lock(projectId, true, async context => {
      this.assertBranchName(name);
      const current = await this.statusContext(context);
      if (current.branch === name) throw new GitWorkbenchError('git_failed', 'Cannot delete the current branch');
      if (!this.readBranchRefs(context.root).has(name))
        throw new GitWorkbenchError('git_failed', `Branch does not exist: ${name}`);
      return this.mutate(
        context,
        async () => {
          const looseRef = `${context.root}/.git/refs/heads/${name}`;
          if (this.fs.analyzePath(looseRef).exists) {
            await this.removePersistent(context.root, `.git/refs/heads/${name}`);
          } else {
            const packedPath = `${context.root}/.git/packed-refs`;
            const packed =
              this.fs.analyzePath(packedPath).exists ? new TextDecoder().decode(this.fs.readFile(packedPath)) : '';
            const lines = packed.split('\n');
            const ref = `refs/heads/${name}`;
            const nextLines: string[] = [];
            let removed = false;
            for (const line of lines) {
              if (line.endsWith(` ${ref}`)) {
                removed = true;
                continue;
              }
              if (removed && line.startsWith('^')) {
                removed = false;
                continue;
              }
              nextLines.push(line);
              removed = false;
            }
            if (!packed || nextLines.join('\n') === packed)
              throw new GitWorkbenchError('git_failed', `Cannot delete branch: ${name}`);
            await this.writeRepositoryFile(
              context,
              '.git/packed-refs',
              new TextEncoder().encode(nextLines.join('\n')) as Uint8Array<ArrayBuffer>
            );
          }
          const result = await this.branchesContext(context);
          return () => result;
        },
        false
      );
    });
  }

  async checkout(projectId: string, name: string, force = false): Promise<GitStatus> {
    return this.lock(projectId, true, async context => {
      this.assertBranchName(name);
      const current = await this.statusContext(context);
      if (current.branch === name) return current;
      if (!force && current.entries.some(entry => entry.index !== ' ' || entry.worktree !== ' '))
        throw new GitWorkbenchError('dirty_workspace', 'Cannot switch branches with uncommitted changes');
      return this.mutate(context, async () => {
        await this.run(['checkout', ...(force ? ['--force'] : []), name]);
        const result = await this.statusContext(context);
        return () => result;
      });
    });
  }

  async commit(projectId: string, message: string): Promise<string> {
    if (!message.trim() || message.length > 10_000)
      throw new GitWorkbenchError('git_failed', 'Commit message is empty or too long');
    return this.lock(projectId, true, async context => {
      const status = await this.statusContext(context);
      if (!status.entries.some(entry => /^[MADRCT]$/.test(entry.index)))
        throw new GitWorkbenchError('nothing_staged', 'No staged changes; stage files before committing');
      return this.mutate(
        context,
        async () => {
          await this.run(['commit', '-m', message]);
          const oid = (await this.run(['rev-parse', 'HEAD'])).trim();
          return () => oid;
        },
        false
      );
    });
  }

  async history(projectId: string): Promise<readonly GitCommit[]> {
    return this.lock(projectId, true, async context => {
      const status = await this.statusContext(context);
      if (!status.head) return [];
      const output = await this.run(['log', '--oneline', '--max-count=100']);
      return output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          const separator = line.indexOf(' ');
          if (separator <= 0) throw new GitWorkbenchError('git_failed', 'Git history returned an invalid commit');
          const oid = line.slice(0, separator);
          if (!/^[0-9a-f]{4,40}$/.test(oid))
            throw new GitWorkbenchError('git_failed', 'Git history returned an invalid commit OID');
          return { oid, message: line.slice(separator + 1) };
        });
    });
  }

  async restore(projectId: string, oid: string): Promise<GitSnapshot> {
    if (!/^[0-9a-f]{4,40}$/.test(oid))
      throw new GitWorkbenchError('unreachable_commit', 'Restore requires a valid commit OID');
    return this.lock(projectId, true, async context => {
      const status = await this.statusContext(context);
      if (status.entries.some(entry => entry.index !== '?' || entry.worktree !== '?'))
        throw new GitWorkbenchError('dirty_workspace', 'Cannot restore a dirty workspace');
      let resolvedOid: string;
      try {
        resolvedOid = (await this.run(['rev-parse', oid])).trim();
      } catch {
        throw new GitWorkbenchError('unreachable_commit', 'Commit is not reachable from HEAD');
      }
      if (
        !/^[0-9a-f]{40}$/.test(resolvedOid) ||
        !status.head ||
        !(await this.run(['rev-list', 'HEAD'])).split(/\s+/).includes(resolvedOid)
      )
        throw new GitWorkbenchError('unreachable_commit', 'Commit is not reachable from HEAD');
      const target = await this.readCommitFiles(context, resolvedOid);
      this.validateFiles(target);
      const current = this.snapshotContext(context).files;
      const tracked = new Set((await this.run(['ls-files'])).split('\n').filter(Boolean));
      const ignored = current.filter(file => !tracked.has(file.path));
      for (const file of ignored) {
        if (
          target.some(
            entry =>
              entry.path === file.path ||
              entry.path.startsWith(`${file.path}/`) ||
              file.path.startsWith(`${entry.path}/`)
          )
        )
          throw new GitWorkbenchError('path_collision', `Restore conflicts with ignored file: ${file.path}`);
      }
      assertNoPathCollisions([...target, ...ignored].map(file => file.path));
      return this.mutate(context, async () => {
        const retained = new Set(target.map(file => file.path));
        for (const file of current)
          if (tracked.has(file.path) && !retained.has(file.path)) await this.removePersistent(context.root, file.path);
        for (const file of target) await this.write(context.root, file);
        return () => this.snapshotContext(context);
      });
    });
  }

  async exportArchive(projectId: string): Promise<Uint8Array<ArrayBuffer>> {
    return this.lock(projectId, true, context => encodeGitArchive(this.collect(context.root, true)));
  }

  async importArchive(projectId: string, bytes: Uint8Array<ArrayBuffer>): Promise<GitSnapshot> {
    const archive = decodeGitArchive(bytes);
    return this.lock(projectId, false, async context => {
      if ((await this.exists(context.directory, 'state.json')) || (await this.exists(context.directory, 'repository')))
        throw new GitWorkbenchError('project_exists', `Import destination exists: ${projectId}`);
      try {
        await this.restoreArchive(context, archive);
        await this.statusContext(context);
        await this.writeState(context, 1);
        return this.snapshotContext(context);
      } catch (cause) {
        await this.removeDisk(context.directory, 'repository');
        this.clearMemory(context.root);
        throw cause;
      }
    });
  }

  private lock<T>(
    projectId: string,
    required: boolean,
    action: (context: ProjectContext) => T | Promise<T>
  ): Promise<T> {
    assertProjectId(projectId);
    const run = this.#queue
      .catch(() => undefined)
      .then(() =>
        navigator.locks.request(`aiao-browser-workbench:${projectId}`, async () => {
          const directory = await this.projectDirectory(projectId, !required);
          const context: ProjectContext = {
            projectId,
            root: `/opfs/${GIT_WORKBENCH_ROOT}/${projectId}/repository`,
            directory,
            revision: 0
          };
          await this.recover(context);
          if (required) await this.loadContext(context);
          try {
            return await action(context);
          } catch (cause) {
            if (cause instanceof GitWorkbenchError) throw cause;
            throw new GitWorkbenchError('storage_failed', cause instanceof Error ? cause.message : String(cause), {
              cause
            });
          }
        })
      );
    this.#queue = run;
    return run;
  }

  private async projectDirectory(projectId: string, create: boolean): Promise<FileSystemDirectoryHandle> {
    try {
      let handle = await navigator.storage.getDirectory();
      for (const part of [...GIT_WORKBENCH_ROOT.split('/'), projectId])
        handle = await handle.getDirectoryHandle(part, { create });
      return handle;
    } catch (cause) {
      const name = typeof cause === 'object' && cause !== null && 'name' in cause ? String(cause.name) : '';
      if (name === 'NotFoundError')
        throw new GitWorkbenchError('project_missing', `Project does not exist: ${projectId}`, { cause });
      throw new GitWorkbenchError('storage_failed', `Cannot access OPFS project: ${projectId}`, { cause });
    }
  }

  private async loadContext(context: ProjectContext): Promise<void> {
    const file = await (await context.directory.getFileHandle('state.json')).getFile();
    const state = JSON.parse(await file.text()) as { revision?: unknown };
    if (!Number.isSafeInteger(state.revision))
      throw new GitWorkbenchError('storage_failed', 'Project revision is invalid');
    context.revision = state.revision as number;
    this.clearMemory(context.root);
    if (!(await this.git.module.opfsLoadTree(context.root)))
      throw new GitWorkbenchError('project_missing', 'Project repository is missing');
    this.fs.chdir(context.root);
  }

  private async statusContext(context: ProjectContext): Promise<GitStatus> {
    this.fs.chdir(context.root);
    const raw = (await this.run(['status', '--short', '--untracked-files=all'])).trimEnd();
    const headFile = new TextDecoder().decode(this.fs.readFile(`${context.root}/.git/HEAD`)).trim();
    const branch = headFile.startsWith('ref: refs/heads/') ? headFile.slice(16) : 'detached';
    let head: string | null = null;
    try {
      head = (await this.run(['rev-parse', 'HEAD'])).trim();
    } catch (cause) {
      if (!headFile.startsWith('ref: ')) throw cause;
    }
    const hasRenames = /^[RC][ MADRCTU?!] /m.test(raw);
    const indexPaths = hasRenames ? (await this.run(['ls-files'])).split('\n').filter(Boolean) : [];
    const entries = parseGitStatus(raw, indexPaths);
    return { head, branch, raw, entries };
  }

  private async branchesContext(context: ProjectContext): Promise<readonly GitBranch[]> {
    const current = (await this.statusContext(context)).branch;
    const refs = this.readBranchRefs(context.root);
    if (current !== 'detached' && !refs.has(current)) refs.set(current, null);
    return [...refs]
      .sort(([left], [right]) =>
        left < right ? -1
        : left > right ? 1
        : 0
      )
      .map(([name, oid]) => ({ name, oid, current: name === current }));
  }

  private readBranchRefs(root: string): Map<string, string | null> {
    const refs = new Map<string, string | null>();
    const packedPath = `${root}/.git/packed-refs`;
    if (this.fs.analyzePath(packedPath).exists && this.fs.isFile(this.fs.lstat(packedPath).mode)) {
      const packed = new TextDecoder().decode(this.fs.readFile(packedPath));
      for (const line of packed.split('\n')) {
        if (!line || line.startsWith('#') || line.startsWith('^')) continue;
        const separator = line.indexOf(' ');
        if (separator < 1) continue;
        const ref = line.slice(separator + 1);
        if (ref.startsWith('refs/heads/')) refs.set(ref.slice('refs/heads/'.length), line.slice(0, separator));
      }
    }

    const heads = `${root}/.git/refs/heads`;
    if (!this.fs.analyzePath(heads).exists || !this.fs.isDir(this.fs.lstat(heads).mode)) return refs;
    const visit = (directory: string, prefix: string): void => {
      for (const name of this.fs.readdir(directory).filter(entry => entry !== '.' && entry !== '..')) {
        const path = `${directory}/${name}`;
        const mode = this.fs.lstat(path).mode;
        const branch = prefix ? `${prefix}/${name}` : name;
        if (this.fs.isDir(mode)) visit(path, branch);
        else if (this.fs.isFile(mode))
          refs.set(branch, new TextDecoder().decode(this.fs.readFile(path)).trim() || null);
      }
    };
    visit(heads, '');
    return refs;
  }

  private assertBranchName(name: string): void {
    const segments = name.split('/');
    const hasControlCharacter = [...name].some(character => {
      const code = character.charCodeAt(0);
      return code <= 0x20 || code === 0x7f;
    });
    if (
      !name ||
      name.trim() !== name ||
      name.length > 255 ||
      name === '@' ||
      name.startsWith('-') ||
      name.startsWith('/') ||
      name.endsWith('/') ||
      name.endsWith('.') ||
      name.includes('//') ||
      name.includes('..') ||
      name.includes('@{') ||
      hasControlCharacter ||
      /[~^:?*\\[\]]/.test(name) ||
      segments.some(segment => !segment || segment === '.' || segment === '..' || segment.endsWith('.lock'))
    )
      throw new GitWorkbenchError('invalid_path', 'Invalid branch name');
  }

  private snapshotContext(context: ProjectContext): GitSnapshot {
    return { projectId: context.projectId, revision: context.revision, files: this.collect(context.root, false).files };
  }

  private collect(root: string, includeGit: boolean): GitArchive {
    const files: GitFile[] = [];
    const directories: string[] = [];
    const pending = [''];
    while (pending.length) {
      const parent = pending.pop() as string;
      for (const name of this.fs.readdir(parent ? `${root}/${parent}` : root)) {
        if (name === '.' || name === '..' || (!includeGit && !parent && name === '.git')) continue;
        const path = parent ? `${parent}/${name}` : name;
        const mode = this.fs.lstat(`${root}/${path}`).mode;
        if (this.fs.isDir(mode)) {
          directories.push(path);
          pending.push(path);
          continue;
        }
        if (!this.fs.isFile(mode) || mode & 0o111)
          throw new GitWorkbenchError('invalid_archive', `Unsupported file semantics: ${path}`);
        files.push({ path, bytes: new Uint8Array(this.fs.readFile(`${root}/${path}`)) });
      }
    }
    files.sort((left, right) => left.path.localeCompare(right.path, 'en'));
    directories.sort();
    assertGitFileLimits(files);
    return { files, directories };
  }

  private validateFiles(files: readonly GitFile[]): void {
    files.forEach(file => assertGitPath(file.path));
    assertNoPathCollisions(files.map(file => file.path));
    if (new Set(files.map(file => file.path)).size !== files.length)
      throw new GitWorkbenchError('path_collision', 'Duplicate file path');
    assertGitFileLimits(files);
  }

  private async run(args: string[]): Promise<string> {
    const command = args[0];
    this.#stdout = [];
    this.#stderr = [];
    const exitCode = await this.git.run(args);
    if (exitCode !== 0)
      throw new GitWorkbenchError('git_failed', `git ${command} failed (${exitCode}): ${this.#stderr.join('\n')}`);
    return this.#stdout.join('\n');
  }

  private async write(root: string, file: GitFile): Promise<void> {
    await this.git.module.opfsWriteFile(`${root}/${file.path}`, file.bytes);
  }

  private async removePersistent(root: string, path: string): Promise<void> {
    let directory = await navigator.storage.getDirectory();
    const parts = `${root.slice('/opfs/'.length)}/${path}`.split('/');
    const name = parts.pop() as string;
    const parents: { directory: FileSystemDirectoryHandle; name: string; path: string }[] = [];
    let parentPath = '/opfs';
    for (const part of parts) {
      parentPath += `/${part}`;
      parents.push({ directory, name: part, path: parentPath });
      directory = await directory.getDirectoryHandle(part);
    }
    await directory.removeEntry(name);
    this.fs.unlink(`${root}/${path}`);
    for (const parent of parents.reverse()) {
      if (parent.path === root || this.fs.readdir(parent.path).length > 2) break;
      await parent.directory.removeEntry(parent.name);
      this.fs.rmdir(parent.path);
    }
  }

  private requireFile(path: string): void {
    if (!this.fs.analyzePath(path).exists || !this.fs.isFile(this.fs.lstat(path).mode))
      throw new GitWorkbenchError('invalid_path', `File does not exist: ${path}`);
  }

  private clearMemory(path: string): void {
    if (!this.fs.analyzePath(path).exists) return;
    const pending: { path: string; visited: boolean }[] = [{ path, visited: false }];
    this.fs.chdir('/opfs');
    while (pending.length) {
      const item = pending.pop() as { path: string; visited: boolean };
      if (!this.fs.isDir(this.fs.lstat(item.path).mode)) {
        this.fs.unlink(item.path);
        continue;
      }
      if (item.visited) {
        this.fs.rmdir(item.path);
        continue;
      }
      pending.push({ ...item, visited: true });
      for (const name of this.fs.readdir(item.path).filter(name => name !== '.' && name !== '..'))
        pending.push({ path: `${item.path}/${name}`, visited: false });
    }
  }

  private async writeRepositoryFile(
    context: ProjectContext,
    path: string,
    bytes: Uint8Array<ArrayBuffer>
  ): Promise<void> {
    const parts = path.split('/');
    const name = parts.pop() as string;
    let directory = await context.directory.getDirectoryHandle('repository');
    for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: true });
    const file = await directory.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    try {
      await writable.write(bytes);
      await writable.close();
    } catch (cause) {
      await writable.abort().catch(() => undefined);
      throw cause;
    }
    this.ensureMemoryDirectory(`${context.root}/${path}`);
    this.fs.writeFile(`${context.root}/${path}`, bytes);
  }

  private async writeMetadata(
    directory: FileSystemDirectoryHandle,
    path: string,
    bytes: Uint8Array<ArrayBuffer>
  ): Promise<void> {
    const file = await directory.getFileHandle(path, { create: true });
    const writable = await file.createWritable();
    try {
      await writable.write(bytes);
      await writable.close();
    } catch (cause) {
      await writable.abort().catch(() => undefined);
      throw cause;
    }
  }

  private async writeState(context: ProjectContext, revision: number): Promise<void> {
    await this.writeMetadata(context.directory, 'state.json', new TextEncoder().encode(JSON.stringify({ revision })));
    context.revision = revision;
  }

  private async exists(directory: FileSystemDirectoryHandle, name: string): Promise<boolean> {
    for await (const [entry] of directory.entries()) if (entry === name) return true;
    return false;
  }

  private async removeDisk(directory: FileSystemDirectoryHandle, name: string): Promise<void> {
    if (await this.exists(directory, name)) await directory.removeEntry(name, { recursive: true });
  }

  private async mutate<T>(context: ProjectContext, action: () => Promise<() => T>, changesFiles = true): Promise<T> {
    const revision = context.revision;
    const archive = this.collect(context.root, true);
    const zip = encodeGitArchive(archive);
    const journal = new Uint8Array(zip.length + 8);
    new DataView(journal.buffer).setFloat64(0, revision, true);
    journal.set(zip, 8);
    try {
      await this.writeMetadata(context.directory, 'recovery.bin', journal);
    } catch (cause) {
      await this.removeDisk(context.directory, 'recovery.bin');
      throw cause;
    }
    try {
      const result = await action();
      await this.writeState(context, revision + (changesFiles ? 1 : 0));
      await context.directory.removeEntry('recovery.bin');
      return result();
    } catch (cause) {
      await this.restoreArchive(context, archive);
      await this.writeState(context, revision);
      await context.directory.removeEntry('recovery.bin');
      throw cause;
    }
  }

  private async recover(context: ProjectContext): Promise<void> {
    if (!(await this.exists(context.directory, 'recovery.bin'))) return;
    const journal = new Uint8Array(
      await (await (await context.directory.getFileHandle('recovery.bin')).getFile()).arrayBuffer()
    );
    if (journal.length === 0) {
      await context.directory.removeEntry('recovery.bin');
      return;
    }
    if (journal.length < 30) throw new GitWorkbenchError('storage_failed', 'Recovery journal is corrupt');
    const revision = new DataView(journal.buffer).getFloat64(0, true);
    if (!Number.isSafeInteger(revision)) throw new GitWorkbenchError('storage_failed', 'Recovery revision is invalid');
    await this.restoreArchive(context, decodeGitArchive(journal.slice(8)));
    await this.writeState(context, revision);
    await context.directory.removeEntry('recovery.bin');
  }

  private async restoreArchive(context: ProjectContext, archive: GitArchive): Promise<void> {
    this.clearMemory(context.root);
    await this.removeDisk(context.directory, 'repository');
    const root = await context.directory.getDirectoryHandle('repository', { create: true });
    for (const path of archive.directories) {
      let directory = root;
      for (const part of path.split('/')) directory = await directory.getDirectoryHandle(part, { create: true });
    }
    for (const file of archive.files) await this.write(context.root, file);
    await this.git.module.opfsLoadTree(context.root);
    this.fs.chdir(context.root);
  }

  private ensureMemoryDirectory(path: string): void {
    const parts = path.slice(0, path.lastIndexOf('/')).split('/').filter(Boolean);
    let parent = '';
    for (const part of parts) {
      parent += `/${part}`;
      if (!this.fs.analyzePath(parent).exists) this.fs.mkdir(parent);
    }
  }

  private async readIndexFiles(context: ProjectContext): Promise<readonly GitFile[]> {
    return this.inScratch(context, async scratch => {
      if (!(await this.run(['ls-files'])).trim()) return [];
      await this.run(['config', 'user.name', 'Workbench Snapshot']);
      await this.run(['config', 'user.email', 'snapshot@example.invalid']);
      await this.run(['commit', '-m', 'Temporary staged snapshot']);
      const oid = (await this.run(['rev-parse', 'HEAD'])).trim();
      await this.run(['checkout', '--force', '--no-progress', oid]);
      return this.collect(scratch, false).files;
    });
  }

  private async readCommitFiles(context: ProjectContext, oid: string): Promise<readonly GitFile[]> {
    return this.inScratch(context, async scratch => {
      await this.run(['checkout', '--force', '--no-progress', oid]);
      return this.collect(scratch, false).files;
    });
  }

  private async inScratch<T>(context: ProjectContext, action: (scratch: string) => Promise<T>): Promise<T> {
    const scratch = `/tmp/aiao-workbench-restore-${this.#scratch++}`;
    const archive = this.collect(context.root, true);
    this.fs.mkdir(scratch);
    try {
      for (const path of [...archive.directories].sort(
        (left, right) => left.split('/').length - right.split('/').length
      ))
        this.fs.mkdir(`${scratch}/${path}`);
      for (const file of archive.files)
        if (file.path.startsWith('.git/')) this.fs.writeFile(`${scratch}/${file.path}`, file.bytes);
      this.fs.chdir(scratch);
      return await action(scratch);
    } finally {
      this.clearMemory(scratch);
      this.fs.chdir(context.root);
    }
  }
}
