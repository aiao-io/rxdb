import { spawn } from 'node:child_process';
import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { PackageDesignContract } from './package-builder';

/** 客户端包服务的稳定错误码。 */
export type ClientPackageErrorCode =
  | 'invalid_request'
  | 'duplicate_revision'
  | 'registry_not_configured'
  | 'registry_failed'
  | 'pack_failed'
  | 'publish_failed';

/** 带 HTTP 语义的客户端包错误。 */
export class ClientPackageError extends Error {
  readonly code: ClientPackageErrorCode;
  readonly status: 400 | 409 | 500 | 502 | 503;

  /** 创建不包含凭证或原始命令行的安全错误。 */
  constructor(code: ClientPackageErrorCode, status: 400 | 409 | 500 | 502 | 503, message: string) {
    super(message);
    this.name = 'ClientPackageError';
    this.code = code;
    this.status = status;
  }
}

/** npm 子进程结果。 */
export interface NpmCommandResult {
  /** 进程退出码。 */
  exitCode: number;
  /** 标准输出。 */
  stdout: string;
  /** 标准错误。 */
  stderr: string;
}

/** npm 子进程执行选项。 */
export interface NpmCommandOptions {
  /** 工作目录。 */
  cwd: string;
  /** 仅覆盖本次命令的环境变量。 */
  env?: Record<string, string | undefined>;
}

/** 可注入测试替身的 npm 命令执行器。 */
export interface NpmCommandRunner {
  /** 用参数数组执行 npm，禁止拼接 shell 字符串。 */
  run(args: readonly string[], options: NpmCommandOptions): Promise<NpmCommandResult>;
}

/** registry 中上一版客户端包 metadata。 */
export interface PreviousClientPackagePublication {
  version: string;
  designRevision: string;
  designContract: PackageDesignContract;
}

/** npm registry 命令所需的服务端配置。 */
export interface NpmRegistryConfig {
  registryUrl: string;
  token: string;
}

function parseRegistryUrl(raw: string): URL {
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error('invalid registry URL');
    }
    return url;
  } catch {
    throw new ClientPackageError('registry_not_configured', 503, 'Package registry is not configured');
  }
}

function registryArgs(config: NpmRegistryConfig, userconfig: string): string[] {
  return ['--registry', parseRegistryUrl(config.registryUrl).toString(), '--userconfig', userconfig];
}

function parseLatestPublication(stdout: string): PreviousClientPackagePublication {
  try {
    const value = JSON.parse(stdout) as unknown;
    if (!value || typeof value !== 'object') throw new Error('invalid metadata');
    const metadata = value as Record<string, unknown>;
    if (typeof metadata['version'] !== 'string') throw new Error('invalid version');
    const rawAiao = metadata['aiao'];
    if (!rawAiao || typeof rawAiao !== 'object') throw new Error('invalid aiao metadata');
    const aiao = rawAiao as Record<string, unknown>;
    if (typeof aiao['designRevision'] !== 'string') throw new Error('invalid revision');
    const designContract = aiao['designContract'];
    if (!designContract || typeof designContract !== 'object') throw new Error('invalid contract');
    return {
      version: metadata['version'],
      designRevision: aiao['designRevision'],
      designContract: designContract as PackageDesignContract
    };
  } catch {
    throw new ClientPackageError('registry_failed', 502, 'Package registry returned invalid metadata');
  }
}

/** 创建只在临时工作区存在的 0600 npm userconfig。 */
export async function createNpmUserconfig(root: string, config: NpmRegistryConfig): Promise<string> {
  const url = parseRegistryUrl(config.registryUrl);
  if (!config.token) throw new ClientPackageError('registry_not_configured', 503, 'Package registry is not configured');
  const pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  const userconfig = join(root, '.npmrc');
  const content = [
    `registry=${url.toString()}`,
    'always-auth=true',
    `//${url.host}${pathname}:_authToken=${config.token}`,
    ''
  ].join('\n');
  await writeFile(userconfig, content, { encoding: 'utf8', mode: 0o600 });
  await chmod(userconfig, 0o600);
  return userconfig;
}

/** 将 npm cache 与日志限制在可清理的临时工作区。 */
export function npmWorkspaceEnv(root: string): Record<string, string> {
  return {
    npm_config_cache: join(root, '.npm-cache'),
    npm_config_logs_dir: join(root, '.npm-logs')
  };
}

/** 读取 registry latest；包不存在时返回 null，其他失败立即报错。 */
export async function readLatestClientPackage(
  runner: NpmCommandRunner,
  packageName: string,
  root: string,
  config: NpmRegistryConfig,
  userconfig: string
): Promise<PreviousClientPackagePublication | null> {
  const result = await runner.run(
    ['view', `${packageName}@latest`, 'version', 'aiao', '--json', ...registryArgs(config, userconfig)],
    { cwd: root, env: npmWorkspaceEnv(root) }
  );
  if (result.exitCode === 0) return parseLatestPublication(result.stdout);
  if (/\bE404\b/.test(result.stderr)) return null;
  throw new ClientPackageError('registry_failed', 502, 'Package registry lookup failed');
}

/** 运行 npm publish，并验证 CLI 确认的包名与版本。 */
export async function publishClientPackage(
  runner: NpmCommandRunner,
  root: string,
  packageName: string,
  version: string,
  config: NpmRegistryConfig,
  userconfig: string
): Promise<void> {
  const result = await runner.run(['publish', '--json', '--ignore-scripts', ...registryArgs(config, userconfig)], {
    cwd: root,
    env: npmWorkspaceEnv(root)
  });
  if (result.exitCode !== 0) throw new ClientPackageError('publish_failed', 502, 'npm publish failed');
  try {
    const value = JSON.parse(result.stdout) as unknown;
    if (!value || typeof value !== 'object') throw new Error('invalid publish result');
    const resultObject = value as Record<string, unknown>;
    const confirmation = resultObject['name'] === packageName ? resultObject : resultObject[packageName];
    if (!confirmation || typeof confirmation !== 'object') throw new Error('missing confirmation');
    const confirmationObject = confirmation as Record<string, unknown>;
    if (confirmationObject['name'] !== packageName || confirmationObject['version'] !== version) {
      throw new Error('mismatch');
    }
  } catch {
    throw new ClientPackageError('publish_failed', 502, 'npm publish returned an invalid confirmation');
  }
}

/** 默认 Bun npm 命令执行器。 */
export const bunNpmCommandRunner: NpmCommandRunner = {
  async run(args, options) {
    const child = spawn('npm', [...args], {
      cwd: options.cwd,
      env: { ...process.env, NPM_TOKEN: undefined, MODEL_CLIENT_REGISTRY_URL: undefined, ...options.env },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    const exitCode = await new Promise<number>(resolve => {
      child.once('error', error => {
        stderr += error.message;
        resolve(-1);
      });
      child.once('close', code => resolve(code ?? -1));
    });
    return { exitCode, stdout, stderr };
  }
};
