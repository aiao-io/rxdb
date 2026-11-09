import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  affectedProjects,
  captureWorktreeTree,
  coverageStatus,
  findIssue,
  listProjects,
  newId,
  ownerOf,
  projectKey,
  recordCoverage,
  requiredUnits,
  resolveSnapshot,
  uuidv7
} from './ai-review.mjs';

const workspaceRoot = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.join(import.meta.dirname, 'ai-review.mjs');
const REVIEWER = 'acme/model-1';
const ISSUE = 'RV-0123456789ab70008000000000000000';

/** 临时仓库：根项目、core、core-angular（目录名以 core 开头，验证按目录边界归属）。 */
function makeRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'ai-review-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' }).trim();
  const write = (file, content) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), content);
  };
  const remove = file => unlinkSync(path.join(dir, file));
  const commit = message => {
    git('add', '-A');
    git('commit', '-q', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'ai-review-test');
  git('config', 'user.email', 'ai-review@example.com');
  git('config', 'commit.gpgsign', 'false');
  write('project.json', JSON.stringify({ name: '@aiao/source' }));
  write('scripts/tool.mjs', 'export const tool = 1;\n');
  write('pnpm-lock.yaml', 'lockfileVersion: 9\n');
  write('requirements/reviews/README.md', '# 记录\n');
  write('packages/core/project.json', JSON.stringify({ name: 'core' }));
  write('packages/core/src/a.ts', 'export const a = 1;\n');
  write('packages/core/src/b.ts', 'export const b = 2;\n');
  write('packages/core/logo.png', Buffer.from([0x89, 0x50, 0x00, 0x01]));
  write('packages/core-angular/project.json', JSON.stringify({ name: 'core-angular' }));
  write('packages/core-angular/src/c.ts', 'export const c = 3;\n');
  const initial = commit('init');
  return { dir, git, write, remove, commit, initial };
}

const withRepo = run => () => {
  const repo = makeRepo();
  try {
    run(repo);
  } finally {
    rmSync(repo.dir, { recursive: true, force: true });
  }
};

/** 默认：当前 HEAD 的提交快照、core 项目、range=project。 */
function scopeOf(repo, overrides = {}) {
  const commit = overrides.commit ?? repo.git('rev-parse', 'HEAD');
  const tree = repo.git('rev-parse', `${commit}^{tree}`);
  return { commit, tree, projects: ['core'], range: 'project', policy: 'policy-v1', ...overrides };
}

const coverAll = (repo, scope, reviewer = REVIEWER) =>
  recordCoverage(repo.dir, scope, {
    reviewer,
    units: requiredUnits(repo.dir, scope).units.map(unit => ({ path: unit.path, context: [], findings: [] }))
  });

const cli = (cwd, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });

test('uuidv7：前 48 位是毫秒时间戳，带版本 7 与 RFC 变体位，ID 按时间排序', () => {
  assert.equal(uuidv7(0x0123456789ab, Buffer.alloc(10, 0xff)), '0123456789ab7fffbfffffffffffffff');
  assert.equal(newId('RV', 0x0123456789ab, Buffer.alloc(10, 0)), ISSUE);
  assert.ok(newId('RV', 1, Buffer.alloc(10, 0xff)) < newId('RV', 2, Buffer.alloc(10, 0)));
});

test('projectKey：普通名原样，作用域包名去掉 @、/ 换成 __，其余字符报错', () => {
  assert.equal(projectKey('rxdb-angular'), 'rxdb-angular');
  assert.equal(projectKey('@aiao/source'), 'aiao__source');
  assert.throws(() => projectKey('a b'), /项目名 a b/);
});

test('ownerOf：按目录边界取最深的 root，根项目只收其余文件', () => {
  const projects = [
    { name: '@aiao/source', root: '.' },
    { name: 'core', root: 'packages/core' },
    { name: 'core-angular', root: 'packages/core-angular' }
  ];
  assert.equal(ownerOf('packages/core-angular/src/c.ts', projects), 'core-angular');
  assert.equal(ownerOf('packages/core/src/a.ts', projects), 'core');
  assert.equal(ownerOf('scripts/tool.mjs', projects), '@aiao/source');
  assert.equal(ownerOf('scripts/tool.mjs', projects.slice(1)), undefined);
});

test(
  'listProjects 读快照里的 project.json，不读工作区',
  withRepo(repo => {
    repo.write('packages/core/project.json', JSON.stringify({ name: 'renamed' }));
    assert.deepEqual(listProjects(repo.dir, repo.git('rev-parse', 'HEAD^{tree}')), [
      { name: '@aiao/source', root: '.', key: 'aiao__source' },
      { name: 'core', root: 'packages/core', key: 'core' },
      { name: 'core-angular', root: 'packages/core-angular', key: 'core-angular' }
    ]);
  })
);

test(
  'captureWorktreeTree 收进修改、未跟踪与删除，不碰真实 index',
  withRepo(repo => {
    repo.write('packages/core/src/a.ts', 'export const a = 10;\n');
    repo.write('packages/core/src/new.ts', 'export const n = 0;\n');
    repo.remove('packages/core/src/b.ts');
    const before = repo.git('status', '--porcelain');

    const tree = captureWorktreeTree(repo.dir);

    assert.equal(repo.git('status', '--porcelain'), before);
    assert.equal(repo.git('diff', '--cached', '--name-only'), '');
    assert.deepEqual(repo.git('ls-tree', '-r', '--name-only', tree, 'packages/core/src').split('\n'), [
      'packages/core/src/a.ts',
      'packages/core/src/new.ts'
    ]);
    assert.equal(repo.git('show', `${tree}:packages/core/src/a.ts`), 'export const a = 10;');
  })
);

test(
  'resolveSnapshot：提交视图列出与工作区不同的文件，--worktree 只认当前 HEAD',
  withRepo(repo => {
    const clean = resolveSnapshot(repo.dir, { rev: 'HEAD' });
    assert.deepEqual(clean, {
      view: 'commit',
      ref: 'refs/heads/main',
      commit: repo.initial,
      tree: repo.git('rev-parse', 'HEAD^{tree}'),
      dirty: []
    });

    repo.write('packages/core/src/a.ts', 'export const a = 10;\n');
    assert.deepEqual(resolveSnapshot(repo.dir, { rev: 'HEAD' }).dirty, ['packages/core/src/a.ts']);
    const worktree = resolveSnapshot(repo.dir, { rev: 'HEAD', worktree: true });
    assert.equal(worktree.view, 'worktree');
    assert.equal(worktree.dirty, null);
    assert.notEqual(worktree.tree, clean.tree);

    repo.commit('second');
    assert.equal(resolveSnapshot(repo.dir, { rev: repo.initial }).ref, null);
    assert.equal(resolveSnapshot(repo.dir, { rev: repo.initial }).dirty, null);
    assert.throws(() => resolveSnapshot(repo.dir, { rev: repo.initial, worktree: true }), /--worktree/);
  })
);

test(
  'requiredUnits（project）：按归属取项目文件，排除评审记录、锁文件与二进制；未知项目列候选',
  withRepo(repo => {
    const core = requiredUnits(repo.dir, scopeOf(repo));
    assert.deepEqual(
      core.units.map(unit => unit.path),
      ['packages/core/project.json', 'packages/core/src/a.ts', 'packages/core/src/b.ts']
    );
    assert.deepEqual(core.excluded, [{ path: 'packages/core/logo.png', reason: 'binary' }]);

    const root = requiredUnits(repo.dir, scopeOf(repo, { projects: ['@aiao/source'] }));
    assert.deepEqual(
      root.units.map(unit => unit.path),
      ['project.json', 'scripts/tool.mjs']
    );
    assert.deepEqual(root.excluded, [
      { path: 'pnpm-lock.yaml', reason: 'lockfile' },
      { path: 'requirements/reviews/README.md', reason: 'review-records' }
    ]);

    assert.throws(
      () => requiredUnits(repo.dir, scopeOf(repo, { projects: ['cor'] })),
      /未知项目 cor；候选：core、core-angular/
    );
  })
);

test(
  '覆盖按内容判定：上下文变了的单元失效，没变的继续有效',
  withRepo(repo => {
    const scope = scopeOf(repo);
    recordCoverage(repo.dir, scope, {
      reviewer: REVIEWER,
      units: [{ path: 'packages/core/src/a.ts', context: ['packages/core/src/b.ts'], findings: [] }]
    });
    assert.deepEqual(coverageStatus(repo.dir, scope).outstandingPaths, [
      'packages/core/project.json',
      'packages/core/src/b.ts'
    ]);

    coverAll(repo, scope);
    const done = coverageStatus(repo.dir, scope);
    assert.equal(done.complete, true);
    assert.deepEqual(done.reviewers, { [REVIEWER]: 3 });
    assert.deepEqual(done.byProject, { core: { required: 3, outstanding: 0 } });

    repo.write('packages/core/src/b.ts', 'export const b = 20;\n');
    const next = coverageStatus(repo.dir, scopeOf(repo, { commit: repo.commit('change b') }));
    assert.equal(next.complete, false);
    assert.deepEqual(next.outstandingPaths, ['packages/core/src/b.ts']);
  })
);

test(
  '上下文失效时报出原因；同一单元有更新的有效覆盖就以新的为准',
  withRepo(repo => {
    const scope = scopeOf(repo);
    recordCoverage(repo.dir, scope, {
      reviewer: REVIEWER,
      units: [{ path: 'packages/core/src/a.ts', context: ['packages/core/src/b.ts'], findings: [] }]
    });
    repo.write('packages/core/src/b.ts', 'export const b = 20;\n');
    const next = scopeOf(repo, { commit: repo.commit('change b') });

    assert.deepEqual(coverageStatus(repo.dir, next).invalid, [
      { path: 'packages/core/src/a.ts', reason: '上下文已变：packages/core/src/b.ts' }
    ]);
    recordCoverage(repo.dir, next, {
      reviewer: REVIEWER,
      units: [{ path: 'packages/core/src/a.ts', context: ['packages/core/src/b.ts'], findings: [] }]
    });
    assert.deepEqual(coverageStatus(repo.dir, next).invalid, []);
  })
);

test(
  '覆盖与提交历史无关：同一棵树换成没有祖先关系的新提交（如 rebase、force push）仍然有效',
  withRepo(repo => {
    const scope = scopeOf(repo);
    coverAll(repo, scope);
    const rewritten = repo.git('commit-tree', scope.tree, '-m', 'rewritten');
    assert.equal(coverageStatus(repo.dir, scopeOf(repo, { commit: rewritten })).complete, true);
  })
);

test(
  '发现必须先写记录再登记覆盖；记录文件丢失后对应单元失效',
  withRepo(repo => {
    const scope = scopeOf(repo);
    const unit = { path: 'packages/core/src/a.ts', context: [], findings: [ISSUE] };
    assert.throws(
      () => recordCoverage(repo.dir, scope, { reviewer: REVIEWER, units: [unit] }),
      new RegExp(`找不到记录 ${ISSUE}`)
    );

    repo.write(`requirements/reviews/core/${ISSUE}.md`, '---\nstatus: Open\n---\n');
    recordCoverage(repo.dir, scope, { reviewer: REVIEWER, units: [unit] });
    assert.equal(coverageStatus(repo.dir, scope).outstandingPaths.includes(unit.path), false);

    repo.remove(`requirements/reviews/core/${ISSUE}.md`);
    const status = coverageStatus(repo.dir, scope);
    assert.equal(status.outstandingPaths.includes(unit.path), true);
    assert.deepEqual(status.invalid, [{ path: unit.path, reason: `记录缺失：${ISSUE}` }]);
  })
);

test(
  '规则摘要变化后全部失效',
  withRepo(repo => {
    const scope = scopeOf(repo);
    coverAll(repo, scope);
    assert.equal(coverageStatus(repo.dir, scope).complete, true);
    assert.equal(coverageStatus(repo.dir, { ...scope, policy: 'policy-v2' }).covered, 0);
  })
);

test(
  '独立复审只认同一评审者，身份未知不能独立复审；全量只认 since 之后的覆盖',
  withRepo(repo => {
    const scope = scopeOf(repo);
    coverAll(repo, scope);
    assert.equal(coverageStatus(repo.dir, scope, { independent: REVIEWER }).complete, true);
    assert.equal(coverageStatus(repo.dir, scope, { independent: 'other/model-2' }).covered, 0);
    assert.throws(() => coverageStatus(repo.dir, scope, { independent: 'unknown' }), /身份未知/);
    assert.equal(coverageStatus(repo.dir, scope, { since: '2999-01-01T00:00:00.000Z' }).covered, 0);
  })
);

test(
  'skip 的单元计入完成，单独列出理由',
  withRepo(repo => {
    const scope = scopeOf(repo);
    recordCoverage(repo.dir, scope, {
      reviewer: REVIEWER,
      units: [
        { path: 'packages/core/project.json', skip: '纯配置，无行为' },
        { path: 'packages/core/src/a.ts', context: [], findings: [] },
        { path: 'packages/core/src/b.ts', context: [], findings: [] }
      ]
    });
    const status = coverageStatus(repo.dir, scope);
    assert.equal(status.complete, true);
    assert.equal(status.covered, 2);
    assert.deepEqual(status.skipped, [{ path: 'packages/core/project.json', reason: '纯配置，无行为' }]);
  })
);

test(
  'cover 拒绝范围外路径、重复路径、不存在的上下文、缺 reviewer 与 skip 混写',
  withRepo(repo => {
    const scope = scopeOf(repo);
    const unit = { path: 'packages/core/src/a.ts', context: [], findings: [] };
    const cover =
      (units, reviewer = REVIEWER) =>
      () =>
        recordCoverage(repo.dir, scope, { reviewer, units });
    assert.throws(cover([{ ...unit, path: 'scripts/tool.mjs' }]), /不在本次范围：scripts\/tool\.mjs/);
    assert.throws(cover([{ ...unit, context: ['nope.ts'] }]), /上下文路径不存在：nope\.ts/);
    assert.throws(cover([unit, unit]), /重复登记/);
    assert.throws(cover([unit], ''), /reviewer/);
    assert.throws(cover([{ ...unit, skip: '理由' }]), /skip/);
    assert.throws(cover([]), /units/);
  })
);

test(
  'range=branch：单元是 merge base 到 H 的改动；base 前移、rebase 后没变的改动不用重审',
  withRepo(repo => {
    repo.git('checkout', '-q', '-b', 'feature');
    repo.write('packages/core/src/a.ts', 'export const a = 10;\n');
    repo.write('packages/core/src/new.ts', 'export const n = 0;\n');
    repo.remove('packages/core/src/b.ts');
    const head = repo.commit('feature');
    const scope = scopeOf(repo, { range: 'branch', base: 'main' });

    const { units, mergeBase } = requiredUnits(repo.dir, scope);
    assert.equal(mergeBase, repo.initial);
    assert.deepEqual(
      units.map(unit => [unit.path, unit.base !== null, unit.blob !== null]),
      [
        ['packages/core/src/a.ts', true, true],
        ['packages/core/src/b.ts', true, false],
        ['packages/core/src/new.ts', false, true]
      ]
    );
    coverAll(repo, scope);
    assert.equal(coverageStatus(repo.dir, scope).complete, true);

    repo.git('checkout', '-q', 'main');
    repo.write('scripts/tool.mjs', 'export const tool = 2;\n');
    const moved = repo.commit('main moves');
    assert.equal(coverageStatus(repo.dir, scope).complete, true);

    repo.git('checkout', '-q', 'feature');
    repo.git('rebase', '-q', 'main');
    const rebased = scopeOf(repo, { range: 'branch', base: 'main' });
    assert.notEqual(rebased.commit, head);
    assert.equal(requiredUnits(repo.dir, rebased).mergeBase, moved);
    assert.equal(coverageStatus(repo.dir, rebased).complete, true);
  })
);

test(
  'range=branch 要求唯一 merge base（交叉合并有两个）',
  withRepo(repo => {
    repo.git('checkout', '-q', '-b', 'x');
    repo.write('packages/core/src/a.ts', 'export const a = 11;\n');
    const x1 = repo.commit('x1');
    repo.git('checkout', '-q', '-b', 'y', repo.initial);
    repo.write('packages/core/src/b.ts', 'export const b = 22;\n');
    const y1 = repo.commit('y1');
    repo.git('merge', '-q', '--no-edit', x1);
    repo.git('checkout', '-q', 'x');
    repo.git('merge', '-q', '--no-edit', y1);

    assert.throws(() => requiredUnits(repo.dir, scopeOf(repo, { range: 'branch', base: 'y' })), /merge base 不唯一/);
  })
);

test(
  'affectedProjects：按改动归属取项目，删掉的文件按 base 侧归属，只改评审记录不算',
  withRepo(repo => {
    const affected = () =>
      affectedProjects(repo.dir, {
        commit: repo.git('rev-parse', 'HEAD'),
        tree: repo.git('rev-parse', 'HEAD^{tree}'),
        base: 'main'
      }).projects;
    repo.git('checkout', '-q', '-b', 'feature');
    repo.write(`requirements/reviews/core/${ISSUE}.md`, 'x\n');
    repo.commit('records only');
    assert.deepEqual(affected(), []);

    repo.write('packages/core/src/a.ts', 'export const a = 10;\n');
    repo.git('rm', '-q', '-r', 'packages/core-angular');
    repo.commit('code');
    assert.deepEqual(affected(), ['core', 'core-angular']);
  })
);

test(
  'findIssue：前缀与完整 ID，允许 slug 后缀，含应用目录里的旧记录',
  withRepo(repo => {
    repo.write('requirements/reviews/core/RV-0190aaaa.md', 'x\n');
    repo.write('requirements/reviews/core/RV-0190bbbb-slug.md', 'x\n');
    repo.write('apps/demo/requirements/reviews/RV-083-old.md', 'x\n');

    assert.deepEqual(findIssue(repo.dir, 'RV-0190'), [
      'requirements/reviews/core/RV-0190aaaa.md',
      'requirements/reviews/core/RV-0190bbbb-slug.md'
    ]);
    assert.deepEqual(findIssue(repo.dir, 'RV-0190', { exact: true }), []);
    assert.deepEqual(findIssue(repo.dir, 'RV-0190bbbb', { exact: true }), [
      'requirements/reviews/core/RV-0190bbbb-slug.md'
    ]);
    assert.deepEqual(findIssue(repo.dir, 'rv-083'), ['apps/demo/requirements/reviews/RV-083-old.md']);
    assert.throws(() => findIssue(repo.dir, 'US-001'), /问题 ID/);
  })
);

test(
  'CLI：snapshot → status → cover → status 走通，find-issue 不唯一时非零退出',
  withRepo(repo => {
    const id = cli(repo.dir, 'new-id');
    assert.equal(id.status, 0);
    assert.match(id.stdout.trim(), /^RV-[0-9a-f]{12}7[0-9a-f]{3}[89ab][0-9a-f]{15}$/);

    const snapshot = JSON.parse(cli(repo.dir, 'snapshot').stdout);
    const scopeArgs = ['--rev', snapshot.commit, '--project', 'core'];
    const before = JSON.parse(cli(repo.dir, 'status', ...scopeArgs).stdout);
    assert.equal(before.complete, false);
    assert.match(before.policy, /^sha256:[0-9a-f]{64}$/);

    const input = path.join(repo.dir, 'batch.json');
    writeFileSync(
      input,
      JSON.stringify({
        reviewer: REVIEWER,
        units: before.outstandingPaths.map(file => ({ path: file, context: [], findings: [] }))
      })
    );
    const covered = cli(repo.dir, 'cover', ...scopeArgs, '--input', input);
    assert.equal(covered.status, 0, covered.stderr);
    assert.deepEqual(JSON.parse(covered.stdout), { recorded: 3, outstanding: 0, complete: true });

    const missing = cli(repo.dir, 'find-issue', 'RV-ffff');
    assert.equal(missing.status, 1);
    assert.deepEqual(JSON.parse(missing.stdout), { query: 'RV-ffff', matches: [] });

    const unknown = cli(repo.dir, 'status', '--project', 'nope');
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /^ai-review: 未知项目 nope/);
  })
);

test(
  'project 与 branch 两种 range 的覆盖互不冒用',
  withRepo(repo => {
    repo.git('checkout', '-q', '-b', 'feature');
    repo.write('packages/core/src/a.ts', 'export const a = 10;\n');
    repo.commit('feature');
    const project = scopeOf(repo);
    coverAll(repo, project);
    assert.equal(coverageStatus(repo.dir, project).complete, true);
    assert.equal(coverageStatus(repo.dir, scopeOf(repo, { range: 'branch', base: 'main' })).covered, 0);
  })
);

test(
  '提交视图与工作区视图按内容分别计账：只有未提交改动的文件要补审',
  withRepo(repo => {
    coverAll(repo, scopeOf(repo));
    repo.write('packages/core/src/a.ts', 'export const a = 10;\n');
    const worktree = scopeOf(repo, { tree: captureWorktreeTree(repo.dir) });
    assert.deepEqual(coverageStatus(repo.dir, worktree).outstandingPaths, ['packages/core/src/a.ts']);
  })
);

const coverageLog = repo =>
  path.resolve(repo.dir, repo.git('rev-parse', '--git-common-dir'), 'ai-review', 'v1', 'coverage.jsonl');

const coverPaths = (repo, scope, paths, options) =>
  recordCoverage(
    repo.dir,
    scope,
    { reviewer: REVIEWER, units: paths.map(file => ({ path: file, context: [], findings: [] })) },
    options
  );

test(
  '覆盖日志末尾写断的半行：status 照常；下一批 cover 另起一行封存半行，此前与此后的覆盖都算数',
  withRepo(repo => {
    const scope = scopeOf(repo);
    coverPaths(repo, scope, ['packages/core/src/a.ts']);
    appendFileSync(coverageLog(repo), '{"v":1,"key":');
    assert.equal(coverageStatus(repo.dir, scope).covered, 1);

    coverPaths(repo, scope, ['packages/core/src/b.ts']);
    assert.deepEqual(coverageStatus(repo.dir, scope).outstandingPaths, ['packages/core/project.json']);
    coverPaths(repo, scope, ['packages/core/project.json']);
    assert.equal(coverageStatus(repo.dir, scope).complete, true);

    const lines = readFileSync(coverageLog(repo), 'utf8').split('\n');
    assert.equal(lines[1], '{"v":1,"key":');
    assert.equal(JSON.parse(lines[2]).sealed, 'torn-tail');
  })
);

test(
  '覆盖日志中间未被封存的损坏行照旧报错，不静默跳过',
  withRepo(repo => {
    const scope = scopeOf(repo);
    coverPaths(repo, scope, ['packages/core/src/a.ts']);
    appendFileSync(coverageLog(repo), 'garbage\n');
    coverPaths(repo, scope, ['packages/core/src/b.ts']);
    assert.throws(() => coverageStatus(repo.dir, scope), /coverage\.jsonl 第 2 行损坏/);
  })
);

const policyOfCli = repo => JSON.parse(cli(repo.dir, 'status', '--project', 'core').stdout).policy;

test('多个进程同时 cover：各批都完整落盘', async () => {
  const repo = makeRepo();
  try {
    const run = file =>
      new Promise((resolve, reject) => {
        const input = path.join(repo.dir, `${path.posix.basename(file)}.json`);
        writeFileSync(input, JSON.stringify({ reviewer: REVIEWER, units: [{ path: file, context: [], findings: [] }] }));
        const child = spawn(process.execPath, [SCRIPT, 'cover', '--project', 'core', '--input', input], {
          cwd: repo.dir
        });
        child.on('error', reject);
        child.on('close', code => (code === 0 ? resolve() : reject(new Error(`cover 退出码 ${code}`))));
      });
    await Promise.all(['packages/core/src/a.ts', 'packages/core/src/b.ts', 'packages/core/project.json'].map(run));
    assert.equal(coverageStatus(repo.dir, scopeOf(repo, { policy: policyOfCli(repo) })).complete, true);
  } finally {
    rmSync(repo.dir, { recursive: true, force: true });
  }
});

test(
  'range=branch：整个项目被删除时，删除单元按 base 侧项目归属，原项目名与 all 都选得到',
  withRepo(repo => {
    repo.git('checkout', '-q', '-b', 'feature');
    repo.git('rm', '-q', '-r', 'packages/core');
    repo.commit('drop core');
    const scope = scopeOf(repo, { range: 'branch', base: 'main' });

    const dropped = requiredUnits(repo.dir, scope);
    assert.deepEqual(
      dropped.units.map(unit => [unit.path, unit.project, unit.blob]),
      [
        ['packages/core/project.json', 'core', null],
        ['packages/core/src/a.ts', 'core', null],
        ['packages/core/src/b.ts', 'core', null]
      ]
    );
    assert.deepEqual(dropped.excluded, [{ path: 'packages/core/logo.png', reason: 'binary' }]);

    const all = { ...scope, projects: 'all' };
    assert.deepEqual([coverageStatus(repo.dir, all).required, coverageStatus(repo.dir, all).complete], [3, false]);
    coverAll(repo, scope);
    assert.equal(coverageStatus(repo.dir, all).complete, true);
    assert.throws(() => requiredUnits(repo.dir, scopeOf(repo)), /未知项目 core/);
  })
);

test(
  'range=branch：项目改名后，删掉的文件记在原名下，保留与改动的文件记在新名下',
  withRepo(repo => {
    repo.git('checkout', '-q', '-b', 'feature');
    repo.write('packages/core/project.json', JSON.stringify({ name: 'core-next' }));
    repo.remove('packages/core/src/b.ts');
    repo.commit('rename core');
    const scope = projects => scopeOf(repo, { range: 'branch', base: 'main', projects });

    assert.deepEqual(
      requiredUnits(repo.dir, scope(['core'])).units.map(unit => unit.path),
      ['packages/core/src/b.ts']
    );
    assert.deepEqual(
      requiredUnits(repo.dir, scope(['core-next'])).units.map(unit => unit.path),
      ['packages/core/project.json']
    );
  })
);

test(
  'since 按时刻比较：同一秒内毫秒在后的覆盖算开始之后，带时区与不带毫秒的写法等价；非法时间报错',
  withRepo(repo => {
    const scope = scopeOf(repo);
    const units = requiredUnits(repo.dir, scope).units.map(unit => unit.path);
    coverPaths(repo, scope, units, { now: new Date('2026-11-08T08:10:30.500Z') });
    const covered = since => coverageStatus(repo.dir, scope, { since }).covered;

    assert.equal(covered('2026-11-08T08:10:30Z'), 3);
    assert.equal(covered('2026-11-08T08:10:30.000Z'), 3);
    assert.equal(covered('2026-11-08T16:10:30+08:00'), 3);
    assert.equal(covered('2026-11-08T08:10:30.500Z'), 3);
    assert.equal(covered('2026-11-08T08:10:30.501Z'), 0);
    assert.equal(covered('2026-11-08T08:10:31Z'), 0);
    assert.throws(() => covered('yesterday'), /--since 不是合法的时间：yesterday/);
  })
);

test('Claude Code 入口与 Codex skill 的 name、description 一致', () => {
  const frontmatter = file => {
    const block = readFileSync(path.join(workspaceRoot, file), 'utf8').split('---')[1];
    return ['name', 'description'].map(key => new RegExp(`^${key}: (.*)$`, 'm').exec(block)?.[1]);
  };
  const codex = frontmatter('.agents/skills/ai-code-review/SKILL.md');
  assert.ok(codex.every(Boolean));
  assert.deepEqual(frontmatter('.claude/skills/ai-code-review/SKILL.md'), codex);
});
