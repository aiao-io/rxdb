import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  artifactPair,
  readReleaseArtifact,
  runActualReleaseUpdate,
  verifyPublishedBuild
} from './actual-release-update.mjs';

const application = resolve(import.meta.dirname, '../../aiao-media');
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const requireCheck = (condition, code) => {
  if (!condition) throw new Error(code);
};
const fixedFailure = (error, code = 'FORMAL_UPDATE_FAILED') => {
  const known = [
    'FORMAL_UPDATE_TIMEOUT',
    'FORMAL_UPDATE_INTERRUPTED',
    'BASELINE_RECEIPT_MISSING',
    'PUBLIC_RELEASE_MISMATCH',
    'ACTIVE_VERSION_MISMATCH'
  ];
  return known.includes(error?.message) ? error.message : code;
};

export function actualUpdateSettings(env) {
  requireCheck(env.AIAO_MEDIA_UPDATE_LIVE === '1', 'FORMAL_UPDATE_OPT_IN_REQUIRED');
  requireCheck(env.AIAO_MEDIA_UPDATE_ORIGIN === 'https://media.aiao.io', 'FORMAL_UPDATE_ORIGIN_REQUIRED');
  requireCheck(!env.DEBUG && !env.PWDEBUG, 'BROWSER_DEBUG_DISABLED_REQUIRED');
  requireCheck(uuid(env.AIAO_MEDIA_UPDATE_VERSION_B), 'FORMAL_UPDATE_VERSION_REQUIRED');
  const a = env.AIAO_MEDIA_UPDATE_MANIFEST_A_SHA256,
    b = env.AIAO_MEDIA_UPDATE_MANIFEST_B_SHA256;
  requireCheck(
    /^[a-f0-9]{64}$/.test(a ?? '') && /^[a-f0-9]{64}$/.test(b ?? '') && a !== b,
    'REVIEWED_RELEASE_DIGESTS_REQUIRED'
  );
  return {
    origin: env.AIAO_MEDIA_UPDATE_ORIGIN,
    versionB: env.AIAO_MEDIA_UPDATE_VERSION_B,
    manifestA: a,
    manifestB: b
  };
}

export function baselineDeployConfig(source, buildA, applicationRoot = application) {
  requireCheck(
    source.name === 'aiao-media' && resolve(source.main) === resolve(applicationRoot, 'deploy/local-first-worker.mjs'),
    'CURRENT_WORKER_REQUIRED'
  );
  requireCheck(
    source.observability?.enabled === false && source.assets?.binding === 'ASSETS',
    'CURRENT_WORKER_CONFIG_REQUIRED'
  );
  requireCheck(
    Object.keys(source.vars ?? {}).length === 1 && typeof source.vars.ALLOWED_PROVIDER_BASE_URLS === 'string',
    'CURRENT_ALLOWLIST_REQUIRED'
  );
  const prefixes = JSON.parse(source.vars.ALLOWED_PROVIDER_BASE_URLS);
  requireCheck(Array.isArray(prefixes), 'CURRENT_ALLOWLIST_REQUIRED');
  for (const prefix of prefixes) {
    const url = new URL(prefix);
    requireCheck(
      url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash,
      'CURRENT_ALLOWLIST_REQUIRED'
    );
  }
  requireCheck(!source.build && !source.secrets_file && !source.env, 'UNEXPECTED_DEPLOY_CONFIG');
  return {
    config: { ...source, assets: { ...source.assets, directory: buildA.root } },
    allowlistCount: prefixes.length
  };
}

function requireRunning(signal) {
  if (signal?.aborted) throw new Error(fixedFailure(signal.reason, 'FORMAL_UPDATE_INTERRUPTED'));
}

export function createUpdateAbort({ timeoutMs = 8 * 60 * 1000, eventSource = process } = {}) {
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error('FORMAL_UPDATE_INTERRUPTED'));
  const deadline = setTimeout(() => controller.abort(new Error('FORMAL_UPDATE_TIMEOUT')), timeoutMs);
  eventSource.on('SIGINT', interrupt);
  eventSource.on('SIGTERM', interrupt);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(deadline);
      eventSource.removeListener('SIGINT', interrupt);
      eventSource.removeListener('SIGTERM', interrupt);
    }
  };
}

export async function executeActualUpdate(settings, builds, operations, { signal } = {}) {
  artifactPair(builds.a, builds.b);
  requireCheck(
    builds.a.manifestSha256 === settings.manifestA && builds.b.manifestSha256 === settings.manifestB,
    'REVIEWED_RELEASE_MISMATCH'
  );
  requireRunning(signal);
  await operations.verifyVersion(settings.versionB);
  await operations.verifyBuild(builds.b);
  requireRunning(signal);
  let touchedDeployment = false,
    versionA,
    evidence,
    failure,
    restoreFailure;
  try {
    touchedDeployment = true;
    versionA = await operations.deployBaseline();
    requireCheck(uuid(versionA), 'BASELINE_RECEIPT_MISSING');
    await operations.verifyVersion(versionA);
    await operations.verifyBuild(builds.a);
    evidence = await operations.runUpdate({
      origin: settings.origin,
      buildA: builds.a,
      buildB: builds.b,
      signal,
      switchBuild: async name => {
        requireCheck(name === 'a' || name === 'b', 'INVALID_RELEASE_SELECTION');
        requireRunning(signal);
        const version = name === 'a' ? versionA : settings.versionB;
        await operations.rollback(version);
        await operations.verifyVersion(version);
      }
    });
  } catch (error) {
    failure = new Error(fixedFailure(signal?.aborted ? signal.reason : error));
  } finally {
    if (touchedDeployment) {
      try {
        await operations.restore(settings.versionB);
        await operations.verifyVersion(settings.versionB, { restoring: true });
        await operations.verifyBuild(builds.b, { restoring: true });
      } catch {
        restoreFailure = new Error('RESTORE_CURRENT_B_FAILED', {
          cause: { originalFailure: failure?.message ?? 'NONE' }
        });
      }
    }
  }
  if (restoreFailure) throw restoreFailure;
  if (failure) throw failure;
  requireRunning(signal);
  return { ...evidence, versionA, versionB: settings.versionB, restoredB: true, restoredTrafficPercentage: 100 };
}

export function runGuardedCommand(
  command,
  args,
  { timeoutMs = 120000, killGraceMs = 5000, signal, env = process.env, cwd = application } = {}
) {
  requireRunning(signal);
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '',
      outputBytes = 0,
      failure,
      forcedKill,
      settled = false;
    const killGroup = kind => {
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') child.kill(kind);
        else process.kill(-child.pid, kind);
      } catch (error) {
        if (error.code !== 'ESRCH') failure = 'WRANGLER_PROCESS_TERMINATION_FAILED';
      }
    };
    const stop = code => {
      if (failure || settled) return;
      failure = code;
      killGroup('SIGTERM');
      forcedKill = setTimeout(() => killGroup('SIGKILL'), killGraceMs);
    };
    const interrupted = () => stop(fixedFailure(signal?.reason, 'FORMAL_UPDATE_INTERRUPTED'));
    const timer = setTimeout(() => stop('FORMAL_UPDATE_TIMEOUT'), timeoutMs);
    const finish = code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(forcedKill);
      signal?.removeEventListener('abort', interrupted);
      if (failure) killGroup('SIGKILL');
      if (failure || code !== 0) reject(new Error(failure ?? 'WRANGLER_OPERATION_FAILED'));
      else resolveRun(output);
    };
    child.stdout.on('data', data => {
      outputBytes += data.length;
      if (outputBytes > 2 * 1024 * 1024) stop('WRANGLER_OUTPUT_LIMIT');
      else output += data.toString();
    });
    child.stderr.on('data', () => undefined);
    child.once('error', () => {
      failure = 'WRANGLER_OPERATION_FAILED';
      finish();
    });
    child.once('close', finish);
    signal?.addEventListener('abort', interrupted, { once: true });
    if (signal?.aborted) interrupted();
  });
}

function runWrangler(args, options) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !/^(AIAO_|MEDIA_|SUPABASE_|DEBUG$|PWDEBUG$)/.test(name))
  );
  env.WRANGLER_SEND_METRICS = 'false';
  return runGuardedCommand('pnpm', ['exec', 'wrangler', ...args], { ...options, env });
}

async function main() {
  requireCheck(process.argv.length === 2, 'NO_EXTRA_ARGUMENTS_ALLOWED');
  requireCheck(process.platform !== 'win32', 'FORMAL_UPDATE_POSIX_REQUIRED');
  const settings = actualUpdateSettings(process.env);
  const builds = artifactPair(
    await readReleaseArtifact(resolve(application, 'tmp/public-release-baseline')),
    await readReleaseArtifact(resolve(application, 'tmp/public-release-current'))
  );
  const source = JSON.parse(await readFile(resolve(application, '.wrangler/local-first/wrangler.deploy.json'), 'utf8'));
  const prepared = baselineDeployConfig(source, builds.a);
  const directory = resolve(application, '.wrangler/local-first/actual-release-update');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const configPath = resolve(directory, 'wrangler.json'),
    emptyEnv = resolve(directory, 'empty.env');
  await writeFile(configPath, JSON.stringify(prepared.config, null, 2) + '\n', { mode: 0o600 });
  await writeFile(emptyEnv, '', { mode: 0o600 });
  const flags = ['--config', configPath, '--env-file', emptyEnv];
  const abort = createUpdateAbort();
  const liveCommand = args => {
    requireRunning(abort.signal);
    return runWrangler([...args, ...flags], { signal: abort.signal });
  };
  const operations = {
    verifyBuild: (build, options) =>
      verifyPublishedBuild(settings.origin, build, options?.restoring ? undefined : abort.signal),
    verifyVersion: async (expected, options) => {
      const output = await runWrangler(['deployments', 'list', '--json', ...flags], {
        signal: options?.restoring ? undefined : abort.signal
      });
      let deployments;
      try {
        deployments = JSON.parse(output);
      } catch {
        throw new Error('DEPLOYMENT_RECEIPT_INVALID');
      }
      requireCheck(Array.isArray(deployments) && deployments.length > 0, 'DEPLOYMENT_RECEIPT_INVALID');
      const latest = [...deployments].sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on))[0];
      requireCheck(
        latest.versions?.length === 1 &&
          latest.versions[0].version_id === expected &&
          latest.versions[0].percentage === 100,
        'ACTIVE_VERSION_MISMATCH'
      );
    },
    deployBaseline: async () => {
      const output = await liveCommand(['deploy', '--message', 'Aiao Media reviewed static compatibility baseline']);
      const version = /Current Version ID:\s*([a-f0-9-]{36})/i.exec(output)?.[1];
      requireCheck(uuid(version), 'BASELINE_RECEIPT_MISSING');
      console.log(JSON.stringify({ phase: 'baseline-deployed', version, allowlistCount: prepared.allowlistCount }));
      return version;
    },
    rollback: version =>
      liveCommand(['rollback', version, '--message', 'Aiao Media actual static update verification', '--yes']),
    restore: version =>
      runWrangler(['rollback', version, '--message', 'Restore reviewed current Aiao Media release', '--yes', ...flags]),
    runUpdate: options => runActualReleaseUpdate(options)
  };
  try {
    const evidence = await executeActualUpdate(settings, builds, operations, { signal: abort.signal });
    await writeFile(resolve(directory, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(evidence));
  } finally {
    abort.dispose();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main().catch(error => {
    console.error(
      JSON.stringify({
        phase: 'stopped',
        code: error.message === 'RESTORE_CURRENT_B_FAILED' ? error.message : fixedFailure(error),
        originalFailure: error.cause?.originalFailure
      })
    );
    process.exitCode = 1;
  });
