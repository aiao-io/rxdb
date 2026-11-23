import { HOME, fromVmPath, isRequiredDiskPath, isWithin } from '../disk/disk-path';
import { assertGitFileLimits } from '../services/git/git-archive';
import type { GitFile } from '../services/git/git-protocol';
import {
  GIT_TERMINAL_VERSION,
  GitWorkbenchRuntime,
  isGitVersionRequest,
  type GitTerminalTree
} from '../services/git/git-runtime';

import { TerminalCommandChannel, type TerminalCommandRequest, type TerminalCommandResponse } from './terminal-command';
import type { VmEntryKind, VmFs } from './vm-fs';
import { resolveTerminalRequest } from './workspace-git';

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

/** 在桌面层执行 Git 命令并写回虚拟机，避免在 Vivari 里再打包一份 Git WASM。 */
export class TerminalGit {
  private readonly channel: TerminalCommandChannel;
  private gitRuntime: Promise<GitWorkbenchRuntime> | null = null;

  constructor(
    name: string,
    private readonly fs: VmFs,
    private readonly sync: () => Promise<boolean>,
    private readonly shared: (request: TerminalCommandRequest, root?: string) => Promise<TerminalCommandResponse>
  ) {
    this.channel = new TerminalCommandChannel(name, request => this.execute(request));
  }

  close(): Promise<void> {
    return this.channel.close();
  }

  private async execute(request: TerminalCommandRequest): Promise<TerminalCommandResponse> {
    try {
      const { cwd, args } = resolveTerminalRequest(request);
      if (isGitVersionRequest(args)) return { exitCode: 0, stdout: GIT_TERMINAL_VERSION, stderr: '' };
      if (cwd !== request.cwd && (await this.fs.stat(cwd))?.kind !== 'directory')
        throw new Error(`cannot change to '${cwd}'`);

      const [command, ...parameters] = args;
      const { root, metadata } = await this.worktreeRoot(cwd, command);
      const path = fromVmPath(root);
      if (isWithin(path, HOME) && !isRequiredDiskPath(path)) {
        const resolved = { pid: request.pid, cwd, args };
        const initialize = command === 'init' && !metadata && parameters.every(arg => !arg.startsWith('-'));
        if (metadata === 'file' || initialize) return await this.shared(resolved);
        if (metadata === 'directory' && ['remote', 'fetch', 'pull', 'push'].includes(command))
          return await this.shared(resolved, root);
      }
      const runtime = await this.getGitRuntime();
      const tree = await collectVmTree(this.fs, root);
      const result = await runtime.runTerminal({
        worktree: root,
        cwd: relativeVmPath(root, cwd),
        args,
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

  private async worktreeRoot(
    cwd: string,
    command: string | undefined
  ): Promise<{ root: string; metadata?: VmEntryKind }> {
    for (let candidate = cwd; ; candidate = parentVmPath(candidate)) {
      const metadata = await this.fs.stat(childPath(candidate, '.git'));
      if (metadata) return { root: candidate, metadata: metadata.kind };
      if (candidate === '/' || command === 'init' || command === 'clone') return { root: cwd };
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
