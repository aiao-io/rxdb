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
    baseUrl: string;
    moduleOverrides: { print(value: unknown): void; printErr(value: unknown): void };
  }): Promise<OpfsGit>;
};

type DemoStep = { name: string; detail: string; status: 'passed' | 'info' | 'failed' };
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
  const loaderPath = '/git-demo/vendor/lg2_opfs_auto.js';
  const loader = (await import(/* @vite-ignore */ loaderPath)) as Loader;
  git = await loader.loadOpfsGit({
    variant: 'jspi',
    user: 'Browser Git Demo',
    email: 'browser-git-demo@example.invalid',
    baseUrl: new URL('/git-demo/vendor/', self.location.origin).href,
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

function step(name: string, detail: string, status: DemoStep['status'] = 'passed'): DemoStep {
  return { name, detail, status };
}

async function currentHead(): Promise<string> {
  return runCommand(['rev-parse', 'HEAD']);
}

async function reopen(): Promise<DemoResult> {
  const instance = await load();
  const restored = await instance.syncRepo(repo);
  if (!restored) {
    return {
      steps: [step('Worker 重开', 'OPFS 中没有可恢复的 demo 仓库', 'failed')],
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
      step('Worker 重开', '从 OPFS 恢复仓库与 .git'),
      step('重开 status', status || 'clean'),
      step('HEAD', head.slice(0, 12)),
      step('当前分支', demoBranch)
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
    steps.push(step('初始化仓库', '在 OPFS 创建工作区和 .git'), step('初始 commit', 'README.md 已提交'));
  } else {
    instance.module.FS.chdir(instance.repoDir(repo));
    steps.push(step('打开仓库', '复用 OPFS 中已有的 demo 工作区'));
  }

  const cleanStatus = await runCommand(['status', '--short']);
  steps.push(step('clean status', cleanStatus || 'clean'));
  await instance.writeFile(repo, 'README.md', changedFile);
  const dirtyStatus = await runCommand(['status', '--short']);
  steps.push(step('修改文件', 'README.md 写入 OPFS'));
  steps.push(step('modified status', dirtyStatus || '没有检测到修改', dirtyStatus ? 'passed' : 'failed'));
  await runCommand(['add', 'README.md']);
  await runCommand(['commit', '-m', 'persist browser workspace']);
  const modifiedHead = await currentHead();
  steps.push(step('commit', `提交成功 ${modifiedHead.slice(0, 12)}`));
  try {
    await runCommand(['checkout', '-b', demoBranch]);
  } catch {
    await runCommand(['checkout', demoBranch]);
  }
  steps.push(step('branch', `创建并切换到 ${demoBranch}`));
  await runCommand(['checkout', modifiedHead]);
  steps.push(step('checkout', `恢复提交 ${modifiedHead.slice(0, 12)}`));
  const reopened = await reopen();
  steps.push(...reopened.steps);
  return { steps, persisted: true, head: reopened.head, branch: reopened.branch };
}

async function clear(): Promise<DemoResult> {
  const instance = await load();
  await instance.removeRepo(repo);
  git = undefined;
  return { steps: [step('清空 OPFS', 'demo 仓库已删除')], persisted: false, head: '—', branch: '—' };
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
