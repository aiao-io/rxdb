import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

// .specify/ 下是 Spec Kit 装进来的脚本，这里守本仓库在上面打的两处补丁
// （RV-01a201324fef7a3081ab7f05da54c1cf、RV-01a20132501c7ac6b50e7dc9ca29a79c）：
// - update-agent-context.sh 是旧版安装留下的，上游 v1.4.3 已删；随上游删掉它时，对应用例一并删。
// - Python 版 auto-commit 在上游 v1.4.3 仍没跟上 bash / PowerShell 的 Conventional Commit 支持，
//   重新同步上游会把补丁冲掉，这份 spec 会先红。

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const specifyDir = join(repoRoot, '.specify');
const scratchDirs = [];

after(() => Promise.all(scratchDirs.map(dir => rm(dir, { recursive: true, force: true }))));

const tempDir = async prefix => {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
};

/** 跑子进程；退出码非 0 也照常返回，由断言来看。 */
const run = (file, args, options) =>
  new Promise(resolve => {
    execFile(file, args, { encoding: 'utf8', ...options }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });

describe('update-agent-context.sh 更新已有的 agent 上下文文件', () => {
  const PLAN = [
    '**Language/Version**: TypeScript 6.0',
    '**Primary Dependencies**: RxJS 7.8',
    '**Storage**: SQLite',
    ''
  ].join('\n');
  const CHANGE = '- 004-demo: Added TypeScript 6.0 + RxJS 7.8';
  const TECH = ['- TypeScript 6.0 + RxJS 7.8 (004-demo)', '- SQLite (004-demo)'];

  /** 只带 .specify 脚本与模板的临时项目，`claudeMd` 是已有的 CLAUDE.md；不给就由脚本从模板新建。 */
  const project = async claudeMd => {
    const dir = await tempDir('speckit-agent-context-');
    await cp(join(specifyDir, 'scripts', 'bash'), join(dir, '.specify', 'scripts', 'bash'), { recursive: true });
    await cp(join(specifyDir, 'templates'), join(dir, '.specify', 'templates'), { recursive: true });
    if (claudeMd !== undefined) await writeFile(join(dir, 'CLAUDE.md'), claudeMd);
    return dir;
  };

  /** 为 `feature` 写一份 plan.md 并跑一次上下文更新，返回更新后的 CLAUDE.md。 */
  const update = async (dir, feature, plan = PLAN) => {
    await mkdir(join(dir, 'specs', feature), { recursive: true });
    await writeFile(join(dir, 'specs', feature, 'plan.md'), plan);
    const result = await run('bash', [join(dir, '.specify', 'scripts', 'bash', 'update-agent-context.sh'), 'claude'], {
      cwd: dir,
      env: {
        ...process.env,
        SPECIFY_INIT_DIR: dir,
        SPECIFY_FEATURE_DIRECTORY: `specs/${feature}`,
        SPECIFY_FEATURE: feature
      }
    });
    assert.equal(result.code, 0, result.stderr);
    return readFile(join(dir, 'CLAUDE.md'), 'utf8');
  };

  /** `## <heading>` 之下、下一个二级标题之前的列表项。 */
  const sectionItems = (markdown, heading) => {
    const lines = markdown.split('\n');
    const start = lines.indexOf(`## ${heading}`);
    assert.notEqual(start, -1, `缺少 ## ${heading}`);
    const rest = lines.slice(start + 1);
    const end = rest.findIndex(line => line.startsWith('## '));
    return (end === -1 ? rest : rest.slice(0, end)).filter(line => line.startsWith('- '));
  };

  for (const existing of [0, 1, 2, 3]) {
    test(`Active Technologies 紧跟着 Recent Changes、已有 ${existing} 条记录：新 feature 记在最前，旧的最多留 2 条`, async () => {
      const old = ['- 003-c: Added C', '- 002-b: Added B', '- 001-a: Added A'].slice(0, existing);
      const dir = await project(
        ['# Demo', '', '## Active Technologies', '- Old Tech (000-old)', '', '## Recent Changes', ...old, ''].join('\n')
      );

      const updated = await update(dir, '004-demo');

      assert.deepEqual(sectionItems(updated, 'Recent Changes'), [CHANGE, ...old.slice(0, 2)]);
      assert.deepEqual(sectionItems(updated, 'Active Technologies'), ['- Old Tech (000-old)', ...TECH]);
    });
  }

  test('Recent Changes 排在 Active Technologies 之前：技术栈的旧条目一条不丢', async () => {
    const tech = ['- Tech A (001-a)', '- Tech B (002-b)', '- Tech C (003-c)'];
    const dir = await project(
      ['# Demo', '', '## Recent Changes', '- 001-a: Added A', '', '## Active Technologies', ...tech, ''].join('\n')
    );

    const updated = await update(dir, '004-demo');

    assert.deepEqual(sectionItems(updated, 'Recent Changes'), [CHANGE, '- 001-a: Added A']);
    assert.deepEqual(sectionItems(updated, 'Active Technologies'), [...tech, ...TECH]);
  });

  test('从模板新建的文件：下一个 feature 照样补进两个区块', async () => {
    const dir = await project(undefined);

    await update(dir, '001-first');
    const updated = await update(dir, '002-second', PLAN.replace('TypeScript 6.0', 'Rust 1.90'));

    assert.deepEqual(sectionItems(updated, 'Recent Changes'), [
      '- 002-second: Added Rust 1.90 + RxJS 7.8',
      '- 001-first: Added TypeScript 6.0 + RxJS 7.8'
    ]);
    // 模板里标题下先是空行，新条目一向插在空行处、排在旧条目之前；这里只看条目齐全，不钉位置
    assert.deepEqual(sectionItems(updated, 'Active Technologies').sort(), [
      '- Rust 1.90 + RxJS 7.8 (002-second)',
      '- SQLite (002-second)',
      '- TypeScript 6.0 + RxJS 7.8 (001-first)'
    ]);
  });

  test('两个区块都没有的文件：首次补在末尾，下一个 feature 照样记进 Recent Changes', async () => {
    const dir = await project('# Demo\n\nHand-written guidance.\n');

    await update(dir, '001-first');
    const updated = await update(dir, '002-second', PLAN.replace('TypeScript 6.0', 'Rust 1.90'));

    assert.deepEqual(sectionItems(updated, 'Recent Changes'), [
      '- 002-second: Added Rust 1.90 + RxJS 7.8',
      '- 001-first: Added TypeScript 6.0 + RxJS 7.8'
    ]);
  });
});

describe('auto-commit 的 Python 端与 bash 端守同一份提交契约', () => {
  const IMPLEMENTATIONS = [
    { name: 'python', command: 'python3', script: ['python', 'auto_commit.py'] },
    { name: 'bash', command: 'bash', script: ['bash', 'auto-commit.sh'] }
  ];

  /** `commit_style` 一行原样写入（可带引号与行尾注释）；不给就不写，走默认的 fixed。 */
  const config = commitStyle =>
    [
      ...(commitStyle === undefined ? [] : [`commit_style: ${commitStyle}`]),
      'auto_commit:',
      '  after_specify:',
      '    enabled: true',
      '    message: fixed configured',
      ''
    ].join('\n');

  const git = (cwd, ...args) => run('git', args, { cwd });

  /** 一个带初始提交、已跟踪文件又改了一行的临时仓库，脚本装在 Spec Kit 的原位。 */
  const repository = async (implementation, gitConfig) => {
    const dir = await tempDir('speckit-auto-commit-');
    const extensionDir = join(dir, '.specify', 'extensions', 'git');
    await mkdir(join(extensionDir, 'scripts', implementation.script[0]), { recursive: true });
    await cp(
      join(specifyDir, 'extensions', 'git', 'scripts', ...implementation.script),
      join(extensionDir, 'scripts', ...implementation.script)
    );
    await writeFile(join(extensionDir, 'git-config.yml'), gitConfig);
    await writeFile(join(dir, 'tracked.txt'), 'one\n');
    await git(dir, 'init', '-q');
    await git(dir, 'config', 'user.email', 'speckit@example.com');
    await git(dir, 'config', 'user.name', 'Spec Kit');
    await git(dir, 'config', 'commit.gpgsign', 'false');
    await git(dir, 'add', '-A');
    await git(dir, 'commit', '-qm', 'init');
    await writeFile(join(dir, 'tracked.txt'), 'one\ntwo\n');
    return dir;
  };

  const autoCommit = (implementation, dir, ...args) =>
    run(
      implementation.command,
      [join(dir, '.specify', 'extensions', 'git', 'scripts', ...implementation.script), ...args],
      {
        cwd: dir
      }
    );

  const headSubject = async dir => (await git(dir, 'log', '-1', '--pretty=%s')).stdout.trim();

  for (const implementation of IMPLEMENTATIONS) {
    test(`${implementation.name}：fixed 模式提交配置里的消息`, async () => {
      const dir = await repository(implementation, config());

      const result = await autoCommit(implementation, dir, 'after_specify');

      assert.equal(result.code, 0, result.stderr);
      assert.equal(await headSubject(dir), 'fixed configured');
    });

    test(`${implementation.name}：conventional 模式没给生成的消息就拒绝提交，不退回配置里的消息`, async () => {
      const dir = await repository(implementation, config('conventional'));

      const result = await autoCommit(implementation, dir, 'after_specify');

      assert.equal(result.code, 1);
      assert.match(result.stderr, /commit_style is 'conventional' but no generated commit message was supplied/);
      assert.equal(await headSubject(dir), 'init');
    });

    test(`${implementation.name}：conventional 模式按 --message-file 原样提交，消息文件读完即删、不进提交`, async () => {
      const dir = await repository(implementation, config('"conventional"  # generated by the agent'));
      const message = 'feat(spec): add "quoted" $(whoami) `id` \'single\' message';
      const messageFile = join(dir, 'commit-msg.txt');
      await writeFile(messageFile, `${message}\n`);

      const result = await autoCommit(implementation, dir, 'after_specify', '--message-file', messageFile);

      assert.equal(result.code, 0, result.stderr);
      assert.equal(await headSubject(dir), message);
      await assert.rejects(access(messageFile));
      assert.equal((await git(dir, 'show', '--name-only', '--pretty=format:', 'HEAD')).stdout.trim(), 'tracked.txt');
    });

    test(`${implementation.name}：conventional 模式也收位置参数传入的消息`, async () => {
      const dir = await repository(implementation, config('conventional'));

      const result = await autoCommit(implementation, dir, 'after_specify', 'docs: record the plan');

      assert.equal(result.code, 0, result.stderr);
      assert.equal(await headSubject(dir), 'docs: record the plan');
    });

    test(`${implementation.name}：--message-file 指向不存在的文件时报错退出`, async () => {
      const dir = await repository(implementation, config('conventional'));

      const result = await autoCommit(implementation, dir, 'after_specify', '--message-file', join(dir, 'missing.txt'));

      assert.equal(result.code, 1);
      assert.match(result.stderr, /message file '.*missing\.txt' not found/);
      assert.equal(await headSubject(dir), 'init');
    });

    test(`${implementation.name}：未知的 commit_style 告警后按 fixed 处理`, async () => {
      const dir = await repository(implementation, config('semantic'));

      const result = await autoCommit(implementation, dir, 'after_specify');

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stderr, /unknown commit_style 'semantic'/);
      assert.equal(await headSubject(dir), 'fixed configured');
    });
  }
});
