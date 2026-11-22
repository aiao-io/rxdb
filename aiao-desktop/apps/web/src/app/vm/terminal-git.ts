import { assertGitFileLimits } from '../services/git/git-archive';
import type { GitFile } from '../services/git/git-protocol';
import {
  GIT_TERMINAL_VERSION,
  GitWorkbenchRuntime,
  isGitVersionRequest,
  type GitTerminalTree
} from '../services/git/git-runtime';

import type { GitRequest, GitResponse } from './coreutils';
import type { VmFs } from './vm-fs';

const sameBytes = (left: Uint8Array | undefined, right: Uint8Array): boolean => {
  if (!left || left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
};

const parentVmPath = (path: string): string => {
  const slash = path.lastIndexOf('/');
  return slash <= 0 ? '/' : path.slice(0, slash);
};

const childPath = (directory: string, name: string): string =>
  directory === '/' ? `/${name}` : `${directory}/${name}`;

const relativeVmPath = (root: string, path: string): string => path.slice(root === '/' ? 1 : root.length + 1);

async function collectVmTree(fs: VmFs, root: string): Promise<GitTerminalTree> {
  const files: GitFile[] = [];
  const directories: string[] = [];
  const pending = [{ absolute: root, relative: '' }];
  while (pending.length) {
    const current = pending.pop() as { absolute: string; relative: string };
    for (const entry of await fs.list(current.absolute)) {
      const relative = current.relative ? `${current.relative}/${entry.name}` : entry.name;
      const absolute = childPath(current.absolute, entry.name);
      if (entry.kind === 'directory') {
        directories.push(relative);
        pending.push({ absolute, relative });
      } else if (entry.kind === 'file') {
        files.push({ path: relative, bytes: new Uint8Array(await fs.read(absolute)) });
      }
    }
  }
  assertGitFileLimits(files);
  return {
    files: files.sort((left, right) => left.path.localeCompare(right.path, 'en')),
    directories: directories.sort()
  };
}

function isGitRequest(value: unknown): value is GitRequest {
  const request = value as Partial<GitRequest> | null;
  return (
    !!request &&
    Number.isSafeInteger(request.pid) &&
    typeof request.cwd === 'string' &&
    request.cwd.startsWith('/') &&
    Array.isArray(request.args) &&
    request.args.every(arg => typeof arg === 'string')
  );
}

/** 同一台虚拟机上的 Git 命令依次读取、修改、写回仓库，写回后才唤醒发起命令的子进程。 */
export class TerminalGit {
  private readonly channel: BroadcastChannel;
  private pending = Promise.resolve();
  private gitRuntime: Promise<GitWorkbenchRuntime> | null = null;

  constructor(
    name: string,
    private readonly fs: VmFs,
    private readonly sync: () => Promise<boolean>
  ) {
    this.channel = new BroadcastChannel(name);
    this.channel.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!isGitRequest(data)) return;
      this.pending = this.pending.then(async () => {
        const response = await this.execute(data);
        this.channel.postMessage({ pid: data.pid, ...response });
      });
    };
  }

  async close(): Promise<void> {
    this.channel.onmessage = null;
    await this.pending;
    this.channel.close();
  }

  private async execute(request: GitRequest): Promise<GitResponse> {
    if (isGitVersionRequest(request.args)) return { exitCode: 0, stdout: GIT_TERMINAL_VERSION, stderr: '' };
    try {
      const runtime = await this.getGitRuntime();
      const root = await this.worktreeRoot(request);
      const tree = await collectVmTree(this.fs, root);
      const result = await runtime.runTerminal({
        worktree: root,
        cwd: relativeVmPath(root, request.cwd),
        args: request.args,
        ...tree
      });
      await this.applyGitTree(root, tree, result);
      await this.sync();
      return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      return { exitCode: 1, stdout: '', stderr: `git: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  private async getGitRuntime(): Promise<GitWorkbenchRuntime> {
    this.gitRuntime ??= GitWorkbenchRuntime.create(new URL('/github-git/', globalThis.location.origin).href).catch(
      error => {
        this.gitRuntime = null;
        throw error;
      }
    );
    return this.gitRuntime;
  }

  private async worktreeRoot({ args, cwd }: GitRequest): Promise<string> {
    if (args[0] === 'init' || args[0] === 'clone') return cwd;
    for (let candidate = cwd; ; candidate = parentVmPath(candidate)) {
      if (await this.fs.stat(childPath(candidate, '.git'))) return candidate;
      if (candidate === '/') return cwd;
    }
  }

  private async applyGitTree(root: string, before: GitTerminalTree, after: GitTerminalTree): Promise<void> {
    const beforeFiles = new Map(before.files.map(file => [file.path, file.bytes]));
    const afterFiles = new Map(after.files.map(file => [file.path, file.bytes]));
    for (const path of [...beforeFiles.keys()].filter(path => !afterFiles.has(path)))
      await this.fs.remove(childPath(root, path));
    const beforeDirectories = new Set(before.directories);
    const afterDirectories = new Set(after.directories);
    for (const path of [...beforeDirectories]
      .filter(path => !afterDirectories.has(path))
      .sort((left, right) => right.length - left.length))
      await this.fs.remove(childPath(root, path));
    for (const path of [...afterDirectories]
      .filter(path => !beforeDirectories.has(path))
      .sort((left, right) => left.length - right.length))
      await this.fs.mkdir(childPath(root, path));
    for (const [path, bytes] of afterFiles) {
      if (sameBytes(beforeFiles.get(path), bytes)) continue;
      await this.fs.write(childPath(root, path), bytes);
    }
  }
}
