import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  bunNpmCommandRunner,
  ClientPackageError,
  createNpmUserconfig,
  npmWorkspaceEnv,
  publishClientPackage,
  readLatestClientPackage,
  type NpmCommandRunner,
  type NpmRegistryConfig
} from './npm-runner';
import { createClientPackageBuild, type ClientPackageBuild, type ClientPackageBuildRequest } from './package-builder';
import { decideClientPackageVersion } from './package-version';

/** 成功创建的客户端 npm 归档。 */
export interface ClientPackageArchiveResult {
  bytes: Uint8Array;
  filename: string;
  packageName: string;
  version: string;
  designRevision: string;
}

/** 客户端包服务的归档能力。 */
export interface ClientPackageService {
  /** 创建可安装 tgz，不访问 registry。 */
  archive(request: ClientPackageBuildRequest): Promise<ClientPackageArchiveResult>;
  /** 计算下一版本并发布到服务端配置的 registry。 */
  publish(request: ClientPackageBuildRequest): Promise<ClientPackagePublicationResult>;
}

/** registry 确认成功的客户端包发布结果。 */
export interface ClientPackagePublicationResult {
  packageName: string;
  version: string;
  designRevision: string;
  status: 'published';
}

/** 客户端包服务端 registry 配置。 */
export interface ClientPackageServiceConfig {
  registryUrl: string;
  token: string;
}

function archiveFilename(stdout: string): string | null {
  try {
    const result = JSON.parse(stdout) as unknown;
    if (!Array.isArray(result) || result.length !== 1) return null;
    const item = result[0];
    if (!item || typeof item !== 'object' || !('filename' in item) || typeof item.filename !== 'string') return null;
    return item.filename;
  } catch {
    return null;
  }
}

async function writeBuild(root: string, files: Map<string, string>): Promise<void> {
  for (const [path, content] of files) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
}

async function pack(
  runner: NpmCommandRunner,
  root: string,
  build: ClientPackageBuild,
  registry?: { config: NpmRegistryConfig; userconfig: string }
): Promise<{ filename: string; bytes: Uint8Array }> {
  await writeBuild(root, build.files);
  const registryArgs = registry ? ['--registry', registry.config.registryUrl, '--userconfig', registry.userconfig] : [];
  const packed = await runner.run(['pack', '--json', '--ignore-scripts', ...registryArgs], {
    cwd: root,
    env: npmWorkspaceEnv(root)
  });
  const filename = archiveFilename(packed.stdout);
  if (packed.exitCode !== 0 || !filename) {
    throw new ClientPackageError('pack_failed', 500, 'npm pack failed');
  }
  const bytes = await readFile(join(root, filename));
  return { filename, bytes: new Uint8Array(bytes) };
}

function registryConfig(config?: ClientPackageServiceConfig): NpmRegistryConfig {
  return {
    registryUrl: config?.registryUrl ?? process.env.MODEL_CLIENT_REGISTRY_URL ?? '',
    token: config?.token ?? process.env.NPM_TOKEN ?? ''
  };
}

/**
 * 创建复用真实 npm CLI 的客户端包服务。
 *
 * @param runner 可注入的 npm 子进程执行器
 * @returns 客户端包服务
 */
export function createClientPackageService(
  runner: NpmCommandRunner = bunNpmCommandRunner,
  config?: ClientPackageServiceConfig
): ClientPackageService {
  return {
    async archive(request) {
      const version = '1.0.0';
      const build = createClientPackageBuild(request, version);
      const root = await mkdtemp(join(tmpdir(), 'aiao-client-package-'));
      await chmod(root, 0o700);
      try {
        const archive = await pack(runner, root, build);
        return {
          bytes: archive.bytes,
          filename: archive.filename,
          packageName: request.packageName,
          version,
          designRevision: build.designRevision
        };
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
    async publish(request) {
      const initialBuild = createClientPackageBuild(request, '1.0.0');
      const root = await mkdtemp(join(tmpdir(), 'aiao-client-package-'));
      await chmod(root, 0o700);
      try {
        const resolvedConfig = registryConfig(config);
        const userconfig = await createNpmUserconfig(root, resolvedConfig);
        const previous = await readLatestClientPackage(runner, request.packageName, root, resolvedConfig, userconfig);
        if (previous?.designRevision === initialBuild.designRevision) {
          throw new ClientPackageError('duplicate_revision', 409, 'This design revision is already published');
        }
        const decision = decideClientPackageVersion(
          initialBuild.manifest.aiao.designContract,
          previous ? { version: previous.version, designContract: previous.designContract } : null
        );
        const build = createClientPackageBuild(request, decision.version);
        await pack(runner, root, build, { config: resolvedConfig, userconfig });
        await publishClientPackage(runner, root, request.packageName, decision.version, resolvedConfig, userconfig);
        return {
          packageName: request.packageName,
          version: decision.version,
          designRevision: build.designRevision,
          status: 'published'
        };
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  };
}
