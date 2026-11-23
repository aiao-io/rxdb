import { fromVmPath, isWithin, resolveVmPath, toVmPath } from '../disk/disk-path';
import type { GithubRepositoryRecord } from '../services/github-repository';
import type { GithubWorkspace } from '../services/github-workspace';

export interface GithubTerminalRequest {
  readonly cwd: string;
  readonly args: readonly string[];
}
export interface GithubTerminalResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

function usage(valid: unknown, syntax: string): asserts valid {
  if (!valid) throw new Error(`usage: git ${syntax}`);
}

async function remoteCommand(workspace: GithubWorkspace, record: GithubRepositoryRecord, args: readonly string[]) {
  const [op, name, url] = args;
  const address = record.owner && record.repo ? `https://github.com/${record.owner}/${record.repo}.git` : '';
  if (!op || op === '-v')
    return (
      address ?
        op ? `origin\t${address} (fetch)\norigin\t${address} (push)`
        : 'origin'
      : ''
    );
  usage(name === 'origin', 'remote <add|get-url|remove> origin');
  if (op === 'get-url' && address) return address;
  if (op === 'remove' && args.length === 2) {
    await workspace.configureRemote(record.projectId, null);
    return '';
  }
  usage(op === 'add' && args.length === 3 && url, 'remote add origin <GitHub URL>');
  await workspace.configureRemote(record.projectId, url);
  return '';
}

export function resolveTerminalRequest(request: GithubTerminalRequest): GithubTerminalRequest {
  let cwd = fromVmPath(request.cwd);
  const argv = [...request.args];
  while (argv[0] === '-C') {
    argv.shift();
    const path = argv.shift();
    usage(path, '-C <directory> <command>');
    cwd = resolveVmPath(cwd, path);
  }
  return { cwd: toVmPath(cwd), args: argv };
}

async function execute(workspace: GithubWorkspace, request: GithubTerminalRequest) {
  const resolved = resolveTerminalRequest(request);
  const cwd = fromVmPath(resolved.cwd);
  const argv = [...resolved.args];
  const command = argv.shift();
  if (command === '--version' || command === 'version') return 'git (Aiao Desktop, libgit2)';
  if (!command || command === '--help' || command === 'help')
    return 'usage: git [-C <directory>] <command>\nCommands: init, status, diff, add, commit, branch, switch, checkout, log, rev-parse, remote, fetch, pull, push';
  if (command === 'init') {
    usage(argv.length < 2 && !argv[0]?.startsWith('-'), 'init [directory]');
    const root = resolveVmPath(cwd, argv[0] ?? '.');
    const existing = await workspace.repositoryAt(root);
    await workspace.openDirectory(root, true);
    return `${existing?.rootPath?.length === root.length ? 'Reinitialized existing' : 'Initialized empty'} Git repository in ${toVmPath(root)}/`;
  }
  const record = await workspace.repositoryAt(cwd);
  if (!record?.rootPath) throw new Error('not a git repository');
  const id = record.projectId;
  const [first, second] = argv;
  switch (command) {
    case 'status': {
      usage(
        !argv.length || (argv.length === 1 && ['--short', '-s', '--porcelain'].includes(first)),
        'status [--short]'
      );
      const status = await workspace.status(id);
      return argv.length ?
          status.raw
        : `On branch ${status.branch}\n${status.raw || 'nothing to commit, working tree clean'}`;
    }
    case 'add': {
      usage(
        argv.length && argv.every(arg => !arg.startsWith('-') || ['-A', '--all', '--'].includes(arg)),
        'add <pathspec>...'
      );
      const all = argv.includes('-A') || argv.includes('--all');
      const paths = argv.filter(arg => !arg.startsWith('-')).map(arg => resolveVmPath(cwd, arg));
      const entries = (await workspace.status(id)).entries;
      const staged = new Set<string>();
      for (const path of paths) {
        if (!isWithin(path, record.rootPath)) throw new Error('path is outside the repository');
        const matches = entries.filter(e => isWithin([...record.rootPath!, ...e.path.split('/')], path));
        if (
          !matches.length &&
          !(await workspace.snapshot(id)).files.some(file =>
            isWithin([...record.rootPath!, ...file.path.split('/')], path)
          )
        )
          throw new Error(`pathspec '${toVmPath(path)}' did not match any files`);
        matches.forEach(entry => staged.add(entry.path));
      }
      const selected = all ? entries.map(e => e.path) : [...staged];
      if (selected.length) await workspace.stage(id, selected);
      return '';
    }
    case 'diff':
      usage(!argv.length || (argv.length === 1 && ['--cached', '--staged'].includes(first)), 'diff [--cached]');
      return workspace.diffText(id, Boolean(argv.length));
    case 'commit': {
      usage(argv.length === 2 && ['-m', '--message'].includes(first) && second?.trim(), 'commit -m <message>');
      const oid = await workspace.commit(id, second);
      return `[${(await workspace.status(id)).branch} ${oid.slice(0, 7)}] ${second}`;
    }
    case 'branch': {
      if (!argv.length)
        return (await workspace.branches(id)).map(b => `${b.current ? '* ' : '  '}${b.name}`).join('\n');
      if (argv.length === 2 && ['-d', '-D'].includes(first)) await workspace.deleteBranch(id, second);
      else {
        usage(argv.length === 1 && !first.startsWith('-'), 'branch [name]');
        await workspace.createBranch(id, first);
      }
      return '';
    }
    case 'switch':
    case 'checkout': {
      const create = first === (command === 'switch' ? '-c' : '-b');
      usage(create ? argv.length === 2 : argv.length === 1 && !first.startsWith('-'), `${command} <branch>`);
      const name = create ? second : first;
      if (create) await workspace.createBranch(id, name);
      await workspace.checkout(id, name);
      return `Switched to branch '${name}'`;
    }
    case 'log':
      if (argv.length === 1 && first === '--oneline')
        return (await workspace.history(id)).map(commit => `${commit.oid.slice(0, 7)} ${commit.message}`).join('\n');
      return workspace.localCommand(id, cwd.slice(record.rootPath.length).join('/'), [command, ...argv]);
    case 'rev-parse':
      if (first === 'HEAD') {
        const head = (await workspace.status(id)).head;
        if (head) return head;
        throw new Error('HEAD has no commits');
      }
      usage(first === '--show-toplevel', 'rev-parse HEAD|--show-toplevel');
      return toVmPath(record.rootPath);
    case 'remote':
      return remoteCommand(workspace, record, argv);
    case 'fetch':
    case 'pull':
    case 'push': {
      usage(
        !argv.length ||
          (argv.length <= 2 && first === 'origin' && (!second || second === (await workspace.status(id)).branch)),
        `${command} [origin [current-branch]]`
      );
      if (command === 'fetch') {
        const remote = await workspace.fetch(id);
        return `From ${remote.record.name}\n${remote.record.remoteHead}`;
      }
      if (command === 'pull') {
        await workspace.pull(id);
        return 'Pull complete';
      }
      await workspace.push(id, (await workspace.history(id))[0]?.message ?? 'Update from Terminal');
      return 'Pushed to origin';
    }
    case 'config':
      usage(argsForConfig(argv), 'config [--get] user.name|user.email [value]');
      return workspace.localCommand(id, '', [command, ...argv]);
    default:
      if (command.startsWith('-') || ['clone', 'init'].includes(command))
        throw new Error(`unsupported command: ${command}`);
      return workspace.localCommand(id, cwd.slice(record.rootPath.length).join('/'), [command, ...argv]);
  }
}

function argsForConfig(args: readonly string[]): boolean {
  const [key, value, ...rest] = args[0] === '--get' ? args.slice(1) : args;
  if (rest.length || !key) return false;
  return value === undefined ? !key.startsWith('-') : ['user.name', 'user.email'].includes(key);
}

export async function runWorkspaceGit(
  workspace: GithubWorkspace,
  request: GithubTerminalRequest
): Promise<GithubTerminalResult> {
  try {
    const value = await execute(workspace, request);
    if (typeof value !== 'string') return { code: value.exitCode, stdout: value.stdout, stderr: value.stderr };
    return { code: 0, stdout: value ? `${value.trimEnd()}\n` : '', stderr: '' };
  } catch (error) {
    return { code: 1, stdout: '', stderr: `git: ${error instanceof Error ? error.message : String(error)}\n` };
  }
}
