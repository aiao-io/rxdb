import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// docker/ 下的 Supabase 栈脚本用假的 docker / curl 驱动：假命令只记下每次调用的 cwd 与参数，
// 不起任何容器。断言的是「初始化发给了哪套 Compose 栈」这类调用身份，与真实 Docker 无关。

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const DOCKER_FILES = [
  'init-db.sh',
  'start.sh',
  'reset.sh',
  'supabase-ci-up.sh',
  'supabase-ci-down.sh',
  'supabase-ci-identity.sh',
  'supabase-ci-isolation-regression.sh',
  'docker-compose.ci.yml'
];

const FAKE_DOCKER = String.raw`#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_DOCKER_LOG, JSON.stringify({ cwd: process.cwd(), args }) + '\n');
const missing = (process.env.FAKE_DOCKER_MISSING || '').split(',').filter(Boolean);
const valueAfter = flag => args[args.indexOf(flag) + 1];
if (args[0] === 'compose' && args.includes('port')) {
  let hash = 7;
  for (const char of valueAfter('-p') || 'default') hash = (hash * 31 + char.charCodeAt(0)) % 10000;
  process.stdout.write('0.0.0.0:' + (50000 + hash) + '\n');
} else if (args[0] === 'ps') {
  process.stdout.write('f00d supabase/postgres "postgres" Up supabase-db\n');
} else if (args[0] === 'inspect') {
  const name = args[args.length - 1];
  if (missing.includes(name)) {
    process.stdout.write('\n');
    process.stderr.write('Error: No such object: ' + name + '\n');
    process.exit(1);
  }
  process.stdout.write(valueAfter('-f').includes('.State.Status') ? 'running\n' : 'id-' + name + '\n');
}
`;

const FAKE_CURL = `#!/usr/bin/env node
if (process.argv.includes('-w')) process.stdout.write('200');
`;

/** 调用方环境里可能残留的栈身份变量，一律去掉，免得测到开发机的配置。 */
const INHERITED_IDENTITY = ['SUPABASE_CI_ID', 'SUPABASE_CI_PROJECT_NAME', 'COMPOSE_PROJECT_NAME', 'COMPOSE_FILE'];

async function createHarness(t) {
  const root = await mkdtemp(join(tmpdir(), 'docker-supabase-scripts-'));
  t.after(() => rm(root, { recursive: true, force: true }));

  const dockerDir = join(root, 'docker');
  await mkdir(dockerDir, { recursive: true });
  for (const file of DOCKER_FILES) {
    await copyFile(join(repoRoot, 'docker', file), join(dockerDir, file));
    await chmod(join(dockerDir, file), 0o755);
  }
  await cp(join(repoRoot, 'docker', 'sql'), join(dockerDir, 'sql'), { recursive: true });
  const p2pSchema = join(root, 'apps', 'dev-rxdb-p2p', 'supabase', 'p2p-schema.sql');
  await mkdir(dirname(p2pSchema), { recursive: true });
  await copyFile(join(repoRoot, 'apps', 'dev-rxdb-p2p', 'supabase', 'p2p-schema.sql'), p2pSchema);

  const bin = join(root, 'bin');
  await mkdir(bin);
  await writeFile(join(bin, 'docker'), FAKE_DOCKER, { mode: 0o755 });
  await writeFile(join(bin, 'curl'), FAKE_CURL, { mode: 0o755 });
  const log = join(root, 'docker-calls.jsonl');

  const run = async (script, env = {}) => {
    await writeFile(log, '');
    const childEnv = { ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_DOCKER_LOG: log, ...env };
    for (const key of INHERITED_IDENTITY) if (!(key in env)) delete childEnv[key];
    const result = await execFileAsync('bash', [join(dockerDir, script)], { cwd: root, env: childEnv, timeout: 60_000 });
    const calls = (await readFile(log, 'utf8'))
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
    return { ...result, calls };
  };

  return { dockerDir, run };
}

/**
 * 一次 `docker compose` 调用落在哪套栈：`-p` 项目名与 `-f` 配置文件（按调用时的 cwd 解析）；
 * 两者都没给时由 cwd 下的默认配置文件决定，cwd 才算身份的一部分。
 */
function composeCall({ cwd, args }) {
  let project = null;
  const files = [];
  let index = 1;
  while (args[index] === '-p' || args[index] === '-f') {
    if (args[index] === '-p') project = args[index + 1];
    else files.push(resolve(cwd, args[index + 1]));
    index += 2;
  }
  return { stack: { project, files, cwd: files.length > 0 ? null : cwd }, subcommand: args.slice(index) };
}

const composeCalls = calls => calls.filter(call => call.args[0] === 'compose').map(composeCall);
const stackStarted = calls => composeCalls(calls).find(call => call.subcommand[0] === 'up')?.stack;
const initStacks = calls =>
  composeCalls(calls)
    .filter(call => call.subcommand[0] === 'exec' && call.subcommand.includes('psql'))
    .map(call => call.stack);

test('start.sh 起的默认栈，自动初始化发给同一个 Compose 项目', async t => {
  const harness = await createHarness(t);
  const { calls } = await harness.run('start.sh');

  const started = stackStarted(calls);
  const inits = initStacks(calls);
  assert.ok(started, 'start.sh 应当 docker compose up');
  assert.ok(inits.length > 0, 'start.sh 应当自动执行 init-db.sh');
  for (const stack of inits) assert.deepEqual(stack, started);
});

test('reset.sh 重新初始化的仍是 start.sh 起的默认栈', async t => {
  const harness = await createHarness(t);
  const started = stackStarted((await harness.run('start.sh')).calls);
  const { calls } = await harness.run('reset.sh');

  const inits = initStacks(calls);
  assert.ok(inits.length > 0, 'reset.sh 应当重新执行 init-db.sh');
  for (const stack of inits) assert.deepEqual(stack, started);
});

test('supabase-ci-up.sh 起的隔离栈，初始化仍发给这个隔离项目', async t => {
  const harness = await createHarness(t);
  const { calls } = await harness.run('supabase-ci-up.sh', { SUPABASE_CI_ID: 'spec-isolated' });

  const started = stackStarted(calls);
  assert.equal(started?.project, 'rxdb-supabase-spec-isolated');
  const inits = initStacks(calls);
  assert.ok(inits.length > 0, 'supabase-ci-up.sh 应当执行 init-db.sh');
  for (const stack of inits) assert.deepEqual(stack, started);
});

for (const [label, missing] of [
  ['机器上没有默认栈容器', 'supabase-db,supabase-kong'],
  ['只有默认栈的 db 容器', 'supabase-kong'],
  ['默认栈容器都在', '']
]) {
  test(`隔离回归：${label}时通过且不误判默认容器`, async t => {
    const harness = await createHarness(t);
    const { stdout, calls } = await harness.run('supabase-ci-isolation-regression.sh', { FAKE_DOCKER_MISSING: missing });

    assert.match(stdout, /isolation regression passed/);
    const reinspected = calls.filter(
      call => call.args[0] === 'inspect' && call.args.includes('{{.Id}}') && missing.split(',').includes(call.args.at(-1))
    );
    assert.equal(reinspected.length, missing ? missing.split(',').length : 0, '缺席的默认容器只在快照时 inspect 一次');
  });
}
