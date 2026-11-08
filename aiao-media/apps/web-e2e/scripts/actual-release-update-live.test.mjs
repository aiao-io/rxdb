import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
  actualUpdateSettings,
  baselineDeployConfig,
  createUpdateAbort,
  executeActualUpdate,
  runGuardedCommand
} from './actual-release-update-live.mjs';

const versionA = '11111111-1111-4111-8111-111111111111';
const versionB = '22222222-2222-4222-8222-222222222222';
const processFixture = fileURLToPath(new URL('./fixtures/actual-release-process.mjs', import.meta.url));
const builds = {
  a: { root: '/reviewed/a', version: 'a'.repeat(64), manifestSha256: 'c'.repeat(64), entryScripts: ['/main-a.js'] },
  b: { root: '/reviewed/b', version: 'b'.repeat(64), manifestSha256: 'd'.repeat(64), entryScripts: ['/main-b.js'] }
};
const settings = {
  origin: 'https://media.aiao.io',
  versionB,
  manifestA: builds.a.manifestSha256,
  manifestB: builds.b.manifestSha256
};

function operations(overrides = {}) {
  const calls = [];
  return {
    calls,
    verifyVersion: async (version, options) => calls.push(`version:${version}:${Boolean(options?.restoring)}`),
    verifyBuild: async (build, options) => calls.push(`build:${build.version[0]}:${Boolean(options?.restoring)}`),
    deployBaseline: async () => {
      calls.push('deploy-a');
      return versionA;
    },
    rollback: async version => calls.push(`rollback:${version}`),
    restore: async version => calls.push(`restore:${version}`),
    runUpdate: async ({ switchBuild }) => {
      await switchBuild('b');
      await switchBuild('a');
      return { sequence: ['a', 'b', 'a'] };
    },
    ...overrides
  };
}

test('正式控制器固定origin、不同审核摘要和当前版本，不接受额外secret配置', () => {
  const env = {
    AIAO_MEDIA_UPDATE_LIVE: '1',
    AIAO_MEDIA_UPDATE_ORIGIN: settings.origin,
    AIAO_MEDIA_UPDATE_VERSION_B: versionB,
    AIAO_MEDIA_UPDATE_MANIFEST_A_SHA256: settings.manifestA,
    AIAO_MEDIA_UPDATE_MANIFEST_B_SHA256: settings.manifestB
  };
  assert.deepEqual(actualUpdateSettings(env), settings);
  for (const patch of [
    { AIAO_MEDIA_UPDATE_LIVE: '' },
    { AIAO_MEDIA_UPDATE_ORIGIN: 'https://other.example.test' },
    { AIAO_MEDIA_UPDATE_MANIFEST_B_SHA256: settings.manifestA },
    { DEBUG: 'pw:api' }
  ])
    assert.throws(() => actualUpdateSettings({ ...env, ...patch }));
  const source = {
    name: 'aiao-media',
    main: '/reviewed/app/server/cloudflare/local-first-worker.mjs',
    observability: { enabled: false },
    assets: { binding: 'ASSETS', directory: '/reviewed/b' },
    vars: { ALLOWED_PROVIDER_BASE_URLS: '["https://provider.example.test/v1"]' }
  };
  const prepared = baselineDeployConfig(source, builds.a, '/reviewed/app');
  assert.equal(prepared.config.assets.directory, builds.a.root);
  assert.equal(prepared.config.main, source.main);
  assert.equal(prepared.allowlistCount, 1);
  assert.throws(() => baselineDeployConfig({ ...source, env: { production: {} } }, builds.a, '/reviewed/app'));
  assert.throws(() =>
    baselineDeployConfig({ ...source, secrets_file: '/private/secret.env' }, builds.a, '/reviewed/app')
  );
});

test('成功舞步结束也恢复B并核对100%版本及原始产物', async () => {
  const ops = operations();
  const evidence = await executeActualUpdate(settings, builds, ops);
  assert.equal(evidence.restoredB, true);
  assert.equal(evidence.restoredTrafficPercentage, 100);
  assert.deepEqual(ops.calls.slice(-3), [`restore:${versionB}`, `version:${versionB}:true`, 'build:b:true']);
});

test('部署结果不确定或A版本核对失败，仍先恢复B再返回原失败', async () => {
  for (const phase of ['deploy', 'verify']) {
    const ops = operations();
    if (phase === 'deploy')
      ops.deployBaseline = async () => {
        throw new Error('FORMAL_UPDATE_TIMEOUT');
      };
    else
      ops.verifyVersion = async version => {
        if (version === versionA) throw new Error('ACTIVE_VERSION_MISMATCH');
      };
    await assert.rejects(
      executeActualUpdate(settings, builds, ops),
      new RegExp(phase === 'deploy' ? 'FORMAL_UPDATE_TIMEOUT' : 'ACTIVE_VERSION_MISMATCH')
    );
    assert.ok(ops.calls.includes(`restore:${versionB}`));
    assert.equal(ops.calls.at(-1), 'build:b:true');
  }
});

test('未改线上前验证失败不覆盖未知状态；恢复B失败不能报告成功', async () => {
  const untouched = operations({
    verifyBuild: async () => {
      throw new Error('PUBLIC_RELEASE_MISMATCH');
    }
  });
  await assert.rejects(executeActualUpdate(settings, builds, untouched), /PUBLIC_RELEASE_MISMATCH/);
  assert.ok(!untouched.calls.includes('deploy-a'));
  assert.ok(!untouched.calls.some(call => call.startsWith('restore:')));
  const failedRestore = operations({
    runUpdate: async () => {
      throw new Error('private-key upstream detail');
    },
    restore: async () => {
      throw new Error('private-key');
    }
  });
  await assert.rejects(executeActualUpdate(settings, builds, failedRestore), error => {
    assert.equal(error.message, 'RESTORE_CURRENT_B_FAILED');
    assert.equal(error.cause.originalFailure, 'FORMAL_UPDATE_FAILED');
    return true;
  });
});

test('SIGINT/SIGTERM和整体deadline只中断验收，恢复B继续执行并清理监听', async () => {
  for (const event of ['SIGINT', 'SIGTERM', 'deadline']) {
    const emitter = new EventEmitter();
    const scope = createUpdateAbort({ eventSource: emitter, timeoutMs: event === 'deadline' ? 10 : 1000 });
    const ops = operations({
      runUpdate: ({ signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
          if (event !== 'deadline') emitter.emit(event);
        })
    });
    try {
      await assert.rejects(
        executeActualUpdate(settings, builds, ops, { signal: scope.signal }),
        new RegExp(event === 'deadline' ? 'FORMAL_UPDATE_TIMEOUT' : 'FORMAL_UPDATE_INTERRUPTED')
      );
      assert.deepEqual(ops.calls.slice(-3), [`restore:${versionB}`, `version:${versionB}:true`, 'build:b:true']);
    } finally {
      scope.dispose();
    }
    assert.equal(emitter.listenerCount('SIGINT'), 0);
    assert.equal(emitter.listenerCount('SIGTERM'), 0);
  }
});

test('命令超时等待子进程close，不能让延迟退出与恢复B竞争', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'aiao-update-process-'));
  const marker = join(root, 'closed');
  try {
    await assert.rejects(
      runGuardedCommand(process.execPath, [processFixture, 'delayed-exit', marker], {
        timeoutMs: 1000,
        killGraceMs: 500
      }),
      /FORMAL_UPDATE_TIMEOUT/
    );
    assert.equal(await readFile(marker, 'utf8'), 'closed');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('中止杀掉整个派生进程组且不泄露命令输出', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'aiao-update-process-group-'));
  const marker = join(root, 'ready');
  const abort = new AbortController();
  const pending = runGuardedCommand(process.execPath, [processFixture, 'parent', marker], {
    signal: abort.signal,
    timeoutMs: 5000,
    killGraceMs: 30
  });
  pending.catch(() => undefined);
  try {
    let pid;
    for (let attempt = 0; attempt < 100 && !pid; attempt++) {
      try {
        pid = Number(await readFile(marker, 'utf8'));
      } catch {
        await pause(10);
      }
    }
    assert.ok(pid);
    abort.abort(new Error('FORMAL_UPDATE_INTERRUPTED'));
    await assert.rejects(pending, /FORMAL_UPDATE_INTERRUPTED/);
    let alive = true;
    for (let attempt = 0; attempt < 100 && alive; attempt++) {
      try {
        process.kill(pid, 0);
        await pause(10);
      } catch {
        alive = false;
      }
    }
    assert.equal(alive, false);
  } finally {
    abort.abort();
    await pending.catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});
