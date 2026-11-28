import type { BenchmarksMessageKey } from '../i18n/messages';

type OpfsGit = {
  variant: string;
  module: { FS: { chdir(path: string): void }; opfsLoadTree(path: string): Promise<boolean> };
  repoDir(repoName: string): string;
  init(options?: { user?: string; email?: string }): Promise<OpfsGit>;
  syncRepo(repoName: string): Promise<boolean>;
  run(args: string[]): Promise<string>;
  writeFile(repoName: string, filename: string, contents: string): Promise<void>;
  readFile(repoName: string, filename: string, encoding?: string): string;
  removeRepo(repoName: string): Promise<void>;
};

type Loader = {
  loadOpfsGit(options: {
    variant: 'jspi';
    user: string;
    email: string;
    moduleOverrides: { print(value: unknown): void; printErr(value: unknown): void };
  }): Promise<OpfsGit>;
};

/**
 * 结构化步骤：文案由 UI 侧按目录键翻译；detail 是 git 原始输出等动态内容，
 * 有值时直接展示，否则翻译 detailKey。
 */
type DemoStep = {
  key: BenchmarksMessageKey;
  params?: Record<string, unknown>;
  detail?: string;
  detailKey?: BenchmarksMessageKey;
  detailParams?: Record<string, unknown>;
  status: 'passed' | 'info' | 'failed';
};

type DemoResult = { steps: DemoStep[]; persisted: boolean; head: string; branch: string };

let git: OpfsGit | undefined;
let stdout: string[] = [];
let stderr: string[] = [];
const repo = 'rxdb-browser-git-demo';
const demoBranch = 'demo-branch';
const initialFile = '# Browser Git + OPFS\n\n初始提交。\n';
const changedFile = '# Browser Git + OPFS\n\nWorker 重启后仍然存在。\n';

async function load(): Promise<OpfsGit> {
  if (git) return git;
  const loaderPath = import.meta.env.BASE_URL + 'git-demo/vendor/lg2_opfs_auto.js';
  const loader = (await import(/* @vite-ignore */ loaderPath)) as Loader;
  git = await loader.loadOpfsGit({
    variant: 'jspi',
    user: 'Browser Git Demo',
    email: 'browser-git-demo@example.invalid',
    moduleOverrides: {
      print: value => stdout.push(String(value)),
      printErr: value => stderr.push(String(value))
    }
  });
  return git;
}

async function runCommand(command: string[]): Promise<string> {
  stdout = [];
  stderr = [];
  const result = await (await load()).run(command);
  if (typeof result === 'number' && result !== 0) {
    throw new Error(`git ${command.join(' ')} failed (${result})\n${stderr.join('\n')}`);
  }
  return stdout.join('\n').trim();
}

function step(
  key: DemoStep['key'],
  options: Omit<DemoStep, 'key' | 'status'> = {},
  status: DemoStep['status'] = 'passed'
): DemoStep {
  return { key, status, ...options };
}

async function currentHead(): Promise<string> {
  return runCommand(['rev-parse', 'HEAD']);
}

async function reopen(): Promise<DemoResult> {
  const instance = await load();
  const restored = await instance.syncRepo(repo);
  if (!restored) {
    return {
      steps: [step('gitStep.workerReopen', { detailKey: 'gitStep.reopenNoRepo' }, 'failed')],
      persisted: false,
      head: '—',
      branch: '—'
    };
  }
  instance.module.FS.chdir(instance.repoDir(repo));
  const status = await runCommand(['status', '--short']);
  const head = await currentHead();
  return {
    steps: [
      step('gitStep.workerReopen', { detailKey: 'gitStep.reopenRestored' }),
      step('gitStep.reopenStatus', status ? { detail: status } : { detailKey: 'gitStep.cleanDetail' }),
      step('gitStep.head', { detail: head.slice(0, 12) }),
      step('gitStep.currentBranch', { detail: demoBranch })
    ],
    persisted: true,
    head: head.slice(0, 12),
    branch: demoBranch
  };
}

async function demo(): Promise<DemoResult> {
  const instance = await load();
  const steps: DemoStep[] = [];
  const exists = await instance.syncRepo(repo);
  if (!exists) {
    await runCommand(['init', instance.repoDir(repo)]);
    instance.module.FS.chdir(instance.repoDir(repo));
    await runCommand(['config', 'user.name', 'Browser Git Demo']);
    await runCommand(['config', 'user.email', 'browser-git-demo@example.invalid']);
    await instance.writeFile(repo, 'README.md', initialFile);
    await runCommand(['add', 'README.md']);
    await runCommand(['commit', '-m', 'initial browser workspace']);
    steps.push(
      step('gitStep.initRepo', { detailKey: 'gitStep.initRepoDetail' }),
      step('gitStep.initialCommit', { detailKey: 'gitStep.initialCommitDetail' })
    );
  } else {
    instance.module.FS.chdir(instance.repoDir(repo));
    steps.push(step('gitStep.openRepo', { detailKey: 'gitStep.openRepoDetail' }));
  }

  const cleanStatus = await runCommand(['status', '--short']);
  steps.push(step('gitStep.cleanStatus', cleanStatus ? { detail: cleanStatus } : { detailKey: 'gitStep.cleanDetail' }));
  await instance.writeFile(repo, 'README.md', changedFile);
  const dirtyStatus = await runCommand(['status', '--short']);
  steps.push(
    step(
      'gitStep.modifiedStatus',
      dirtyStatus ? { detail: dirtyStatus } : { detailKey: 'gitStep.modifiedStatusMissing' },
      dirtyStatus ? 'passed' : 'failed'
    )
  );
  await runCommand(['add', 'README.md']);
  await runCommand(['commit', '-m', 'persist browser workspace']);
  const modifiedHead = await currentHead();
  steps.push(
    step('gitStep.commit', { detailKey: 'gitStep.commitDetail', detailParams: { head: modifiedHead.slice(0, 12) } })
  );
  try {
    await runCommand(['checkout', '-b', demoBranch]);
  } catch {
    await runCommand(['checkout', demoBranch]);
  }
  steps.push(step('gitStep.branch', { detailKey: 'gitStep.branchDetail', detailParams: { branch: demoBranch } }));
  await runCommand(['checkout', modifiedHead]);
  steps.push(
    step('gitStep.checkout', { detailKey: 'gitStep.checkoutDetail', detailParams: { head: modifiedHead.slice(0, 12) } })
  );
  const reopened = await reopen();
  steps.push(...reopened.steps);
  return { steps, persisted: true, head: reopened.head, branch: reopened.branch };
}

async function clear(): Promise<DemoResult> {
  const instance = await load();
  await instance.removeRepo(repo);
  git = undefined;
  return {
    steps: [step('gitStep.clearOpfs', { detailKey: 'gitStep.clearOpfsDetail' })],
    persisted: false,
    head: '—',
    branch: '—'
  };
}

function describeError(cause: unknown): string {
  if (cause instanceof Error) return cause.stack ?? cause.message;
  if (typeof cause === 'object' && cause !== null) {
    return JSON.stringify(cause, Object.getOwnPropertyNames(cause));
  }
  return String(cause);
}

self.onmessage = async ({ data }: MessageEvent<{ action: 'demo' | 'reopen' | 'clear' }>) => {
  try {
    const result =
      data.action === 'demo' ? await demo()
      : data.action === 'reopen' ? await reopen()
      : await clear();
    self.postMessage({ result });
  } catch (cause) {
    self.postMessage({ error: describeError(cause) });
  }
};
