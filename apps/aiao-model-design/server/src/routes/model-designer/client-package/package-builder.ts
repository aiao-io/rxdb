import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { ClientPackageError } from './npm-runner';

const PACKAGE_NAME_PATTERN = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*-rxdb$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** 上游客户端生成器产生的单个文件。 */
export interface ClientPackageGeneratedFile {
  /** 相对于包根的文件路径。 */
  path: string;
  /** UTF-8 文件内容。 */
  content: string;
}

/** 参与兼容性比较的字段契约。 */
export interface PackageDesignProperty {
  name: string;
  columnName?: string;
  type: string;
  required?: boolean;
  nullable?: boolean;
  unique?: boolean;
}

/** 参与兼容性比较的关系契约。 */
export interface PackageDesignRelation {
  name: string;
  kind: string;
  mappedEntity: string;
  mappedProperty?: string;
}

/** 参与兼容性比较的实体契约。 */
export interface PackageDesignEntity {
  name: string;
  namespace?: string;
  tableName?: string;
  properties: PackageDesignProperty[];
  relations: PackageDesignRelation[];
}

/** 可写入 npm metadata 的规范化设计契约。 */
export interface PackageDesignContract {
  entities: PackageDesignEntity[];
  metadata: Record<string, string>;
}

/** 创建客户端 npm 包所需的浏览器安全输入。 */
export interface ClientPackageBuildRequest {
  packageName: string;
  generatedFiles: ClientPackageGeneratedFile[];
  designContract: PackageDesignContract;
}

/** 客户端 npm 包 manifest。 */
export interface ClientPackageManifest {
  name: string;
  version: string;
  type: 'module';
  files: ['dist', 'types', 'README.md'];
  exports: { '.': { import: './dist/index.js'; types: './types/index.d.ts' } };
  peerDependencies: { '@aiao/rxdb': string; rxjs: string };
  aiao: { designRevision: string; designContract: PackageDesignContract };
}

/** 已校验、可直接写入临时工作区的客户端包。 */
export interface ClientPackageBuild {
  manifest: ClientPackageManifest;
  designRevision: string;
  files: Map<string, string>;
}

function invalid(message: string): never {
  throw new ClientPackageError('invalid_request', 400, message);
}

function validatePackageName(packageName: string): void {
  if (!PACKAGE_NAME_PATTERN.test(packageName)) invalid('Package name must match @scope/project-rxdb');
}

function validateVersion(version: string): void {
  if (!SEMVER_PATTERN.test(version)) invalid('Package version must be a stable semantic version');
}

function validateGeneratedPath(path: string): string {
  if (!path || path.includes('\\') || posix.isAbsolute(path)) invalid(`Generated file path is unsafe: ${path}`);
  const normalized = posix.normalize(path);
  if (normalized === '..' || normalized.startsWith('../') || normalized !== path) {
    invalid(`Generated file path is unsafe: ${path}`);
  }
  return normalized;
}

function normalizeDesignContract(contract: PackageDesignContract): PackageDesignContract {
  if (!contract || !Array.isArray(contract.entities) || contract.entities.length > 100) {
    invalid('Design contract must contain at most 100 entities');
  }
  if (!contract.metadata || Array.isArray(contract.metadata) || typeof contract.metadata !== 'object') {
    invalid('Design contract metadata must be an object');
  }

  const entities = contract.entities
    .map(entity => ({
      name: entity.name,
      ...(entity.namespace ? { namespace: entity.namespace } : {}),
      ...(entity.tableName ? { tableName: entity.tableName } : {}),
      properties: [...entity.properties]
        .map(property => ({
          name: property.name,
          ...(property.columnName ? { columnName: property.columnName } : {}),
          type: property.type,
          ...(property.required ? { required: true } : {}),
          ...(property.nullable ? { nullable: true } : {}),
          ...(property.unique ? { unique: true } : {})
        }))
        .sort((left, right) =>
          `${left.name}\0${left.columnName ?? ''}`.localeCompare(`${right.name}\0${right.columnName ?? ''}`)
        ),
      relations: [...entity.relations]
        .map(relation => ({
          name: relation.name,
          kind: relation.kind,
          mappedEntity: relation.mappedEntity,
          ...(relation.mappedProperty ? { mappedProperty: relation.mappedProperty } : {})
        }))
        .sort((left, right) => `${left.name}\0${left.kind}`.localeCompare(`${right.name}\0${right.kind}`))
    }))
    .sort((left, right) =>
      `${left.namespace ?? ''}\0${left.name}`.localeCompare(`${right.namespace ?? ''}\0${right.name}`)
    );

  const metadata = Object.fromEntries(
    Object.entries(contract.metadata).sort(([left], [right]) => left.localeCompare(right))
  );
  return { entities, metadata };
}

function createRevision(contract: PackageDesignContract): string {
  return createHash('sha256').update(JSON.stringify(contract)).digest('hex');
}

function mapGeneratedFiles(generatedFiles: ClientPackageGeneratedFile[]): Map<string, string> {
  const files = new Map<string, string>();
  for (const file of generatedFiles) {
    const path = validateGeneratedPath(file.path);
    if (!path.endsWith('.js') && !path.endsWith('.d.ts')) invalid(`Unsupported generated file: ${path}`);
    const target = path.endsWith('.d.ts') ? `types/${path}` : `dist/${path}`;
    if (files.has(target)) invalid(`Duplicate generated file: ${path}`);
    files.set(target, file.content);
  }
  if (!files.has('dist/index.js') || !files.has('types/index.d.ts')) {
    invalid('Generated files must include runtime and declaration entry points');
  }
  return files;
}

/**
 * 校验生成输入并创建标准 npm 包布局。
 *
 * @param request 生成文件与设计契约
 * @param version 已决策的稳定 semver
 * @returns 可写入临时目录的 manifest、revision 与文件映射
 */
export function createClientPackageBuild(request: ClientPackageBuildRequest, version: string): ClientPackageBuild {
  validatePackageName(request.packageName);
  validateVersion(version);
  const designContract = normalizeDesignContract(request.designContract);
  const designRevision = createRevision(designContract);
  const manifest: ClientPackageManifest = {
    name: request.packageName,
    version,
    type: 'module',
    files: ['dist', 'types', 'README.md'],
    exports: { '.': { import: './dist/index.js', types: './types/index.d.ts' } },
    peerDependencies: {
      '@aiao/rxdb': '>=0.0.21 <0.1.0',
      rxjs: '>=7.8.0 <8'
    },
    aiao: { designRevision, designContract }
  };
  const files = mapGeneratedFiles(request.generatedFiles);
  files.set('package.json', `${JSON.stringify(manifest, null, 2)}\n`);
  files.set('README.md', `# ${request.packageName}\n\nGenerated RxDB client package.\n`);
  return { manifest, designRevision, files };
}
