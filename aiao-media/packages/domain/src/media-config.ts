import { Entity, EntityBase, PropertyType, type UUID } from '@aiao/rxdb';

/** 配置实体的公共字段，服务于 Supabase RLS、CAS 和分支同步。 */
export abstract class MediaConfigEntity extends EntityBase {
  workspaceId!: UUID;
  revision = 1;
  branchId: string | null = null;
  deletedAt: Date | null = null;
}

/** 管理员可编辑的媒体提示词模板。 */
@Entity({
  name: 'MediaPromptTemplate',
  tableName: 'media_prompt_templates',
  namespace: 'public',
  displayName: '媒体提示词模板',
  properties: [
    { name: 'workspaceId', type: PropertyType.uuid, displayName: '工作区' },
    { name: 'revision', type: PropertyType.integer, displayName: '修订号' },
    { name: 'branchId', type: PropertyType.string, nullable: true, displayName: '配置分支' },
    { name: 'deletedAt', type: PropertyType.date, nullable: true, displayName: '删除时间' },
    { name: 'key', type: PropertyType.string, displayName: '标识', searchable: true, required: true },
    { name: 'title', type: PropertyType.string, displayName: '标题', searchable: true, required: true },
    { name: 'prompt', type: PropertyType.string, displayName: '提示词', searchable: true, required: true },
    { name: 'purpose', type: PropertyType.string, nullable: true, displayName: '用途' },
    { name: 'style', type: PropertyType.string, nullable: true, displayName: '风格' },
    { name: 'tags', type: PropertyType.stringArray, displayName: '标签' },
    { name: 'enabled', type: PropertyType.boolean, displayName: '启用' }
  ],
  indexes: [{ name: 'workspace_key', properties: ['workspaceId', 'key'], unique: true }]
})
export class MediaPromptTemplate extends MediaConfigEntity {
  key!: string;
  title!: string;
  prompt!: string;
  purpose: string | null = null;
  style: string | null = null;
  tags: string[] = [];
  enabled = true;
}

/** 供应商路由与能力策略。 */
@Entity({
  name: 'MediaProviderPolicy',
  tableName: 'media_provider_policies',
  namespace: 'public',
  displayName: '媒体供应商策略',
  properties: [
    { name: 'workspaceId', type: PropertyType.uuid, displayName: '工作区' },
    { name: 'revision', type: PropertyType.integer, displayName: '修订号' },
    { name: 'branchId', type: PropertyType.string, nullable: true, displayName: '配置分支' },
    { name: 'deletedAt', type: PropertyType.date, nullable: true, displayName: '删除时间' },
    { name: 'key', type: PropertyType.string, displayName: '标识', searchable: true, required: true },
    { name: 'version', type: PropertyType.integer, displayName: '策略版本' },
    { name: 'providers', type: PropertyType.json, displayName: '供应商配置' },
    { name: 'enabled', type: PropertyType.boolean, displayName: '启用' }
  ],
  indexes: [{ name: 'workspace_key', properties: ['workspaceId', 'key'], unique: true }]
})
export class MediaProviderPolicy extends MediaConfigEntity {
  key!: string;
  version = 1;
  providers: unknown[] = [];
  enabled = true;
}

/** 平台模型目录实体。 */
@Entity({
  name: 'MediaPlatformModel',
  tableName: 'media_platform_models',
  namespace: 'public',
  displayName: '媒体平台模型',
  properties: [
    { name: 'workspaceId', type: PropertyType.uuid, displayName: '工作区' },
    { name: 'revision', type: PropertyType.integer, displayName: '修订号' },
    { name: 'branchId', type: PropertyType.string, nullable: true, displayName: '配置分支' },
    { name: 'deletedAt', type: PropertyType.date, nullable: true, displayName: '删除时间' },
    { name: 'providerId', type: PropertyType.string, displayName: '供应商', required: true },
    { name: 'modelId', type: PropertyType.string, displayName: '模型标识', searchable: true, required: true },
    { name: 'displayName', type: PropertyType.string, displayName: '显示名称', searchable: true, required: true },
    { name: 'capabilities', type: PropertyType.stringArray, displayName: '能力' },
    { name: 'enabled', type: PropertyType.boolean, displayName: '启用' }
  ],
  indexes: [{ name: 'workspace_model', properties: ['workspaceId', 'providerId', 'modelId'], unique: true }]
})
export class MediaPlatformModel extends MediaConfigEntity {
  providerId!: string;
  modelId!: string;
  displayName!: string;
  capabilities: string[] = [];
  enabled = true;
}

export const MEDIA_CONFIG_COMMIT_STATUSES = [
  'prepared',
  'synced',
  'validated',
  'applied',
  'released',
  'rejected'
] as const;
export type MediaConfigCommitStatus = (typeof MEDIA_CONFIG_COMMIT_STATUSES)[number];
export const MEDIA_CONFIG_COMMIT_OPERATIONS = ['insert', 'update', 'delete'] as const;
export type MediaConfigCommitOperation = (typeof MEDIA_CONFIG_COMMIT_OPERATIONS)[number];

/** 配置提交的领域投影。 */
@Entity({
  name: 'MediaConfigCommit',
  tableName: 'media_config_projection_commits',
  namespace: 'public',
  displayName: '媒体配置提交',
  properties: [
    { name: 'workspaceId', type: PropertyType.uuid, displayName: '工作区' },
    { name: 'branchId', type: PropertyType.string, displayName: '配置分支' },
    { name: 'parentIds', type: PropertyType.stringArray, displayName: '父提交' },
    { name: 'authorId', type: PropertyType.uuid, displayName: '作者' },
    { name: 'message', type: PropertyType.string, displayName: '提交说明' },
    { name: 'operationId', type: PropertyType.uuid, displayName: '操作标识' },
    { name: 'contentFingerprint', type: PropertyType.string, displayName: '内容指纹' },
    { name: 'changeCount', type: PropertyType.integer, displayName: '变更数' },
    { name: 'status', type: PropertyType.enum, enum: MEDIA_CONFIG_COMMIT_STATUSES, displayName: '状态' },
    { name: 'appliedAt', type: PropertyType.date, nullable: true, displayName: '应用时间' },
    { name: 'releasedAt', type: PropertyType.date, nullable: true, displayName: '发布���间' },
    { name: 'rejectionCode', type: PropertyType.string, nullable: true, displayName: '拒绝原因' }
  ],
  indexes: [{ name: 'workspace_operation', properties: ['workspaceId', 'operationId'], unique: true }]
})
export class MediaConfigCommit extends EntityBase {
  workspaceId!: UUID;
  branchId!: string;
  parentIds: string[] = [];
  authorId!: UUID;
  message!: string;
  operationId!: UUID;
  contentFingerprint!: string;
  /** 提交内变更总数；同步到达的变更行少于它时，投影不完整，不能校验或应用。 */
  changeCount!: number;
  status: MediaConfigCommitStatus = 'prepared';
  appliedAt: Date | null = null;
  releasedAt: Date | null = null;
  rejectionCode: string | null = null;
}

/** 配置提交中的有序领域变更。 */
@Entity({
  name: 'MediaConfigCommitChange',
  tableName: 'media_config_projection_changes',
  namespace: 'public',
  displayName: '媒体配置提交变更',
  properties: [
    { name: 'workspaceId', type: PropertyType.uuid, displayName: '工作区' },
    { name: 'commitId', type: PropertyType.uuid, displayName: '提交' },
    { name: 'sequence', type: PropertyType.integer, displayName: '序号' },
    { name: 'entity', type: PropertyType.string, displayName: '实体' },
    { name: 'entityId', type: PropertyType.string, displayName: '实体标识' },
    { name: 'operation', type: PropertyType.enum, enum: MEDIA_CONFIG_COMMIT_OPERATIONS, displayName: '操作' },
    { name: 'patch', type: PropertyType.json, displayName: '变更补丁' },
    { name: 'inversePatch', type: PropertyType.json, nullable: true, displayName: '回滚补丁' },
    { name: 'expectedRevision', type: PropertyType.integer, nullable: true, displayName: '预期修订号' },
    { name: 'contentFingerprint', type: PropertyType.string, displayName: '变更指纹' }
  ],
  indexes: [{ name: 'commit_sequence', properties: ['commitId', 'sequence'], unique: true }]
})
export class MediaConfigCommitChange extends EntityBase {
  /** 与所属提交相同的工作区，使变更行可以单独按工作区同步与授权。 */
  workspaceId!: UUID;
  commitId!: UUID;
  sequence!: number;
  entity!: string;
  entityId!: string;
  operation!: MediaConfigCommitOperation;
  patch: unknown = {};
  inversePatch: unknown = null;
  expectedRevision: number | null = null;
  contentFingerprint!: string;
}

export interface MediaConfigCommitChangeInput {
  id: string;
  sequence: number;
  entity: string;
  entityId: string;
  operation: MediaConfigCommitOperation;
  patch: unknown;
  inversePatch: unknown;
  expectedRevision: number | null;
}

export interface MediaConfigCommitEnvelope {
  commit: MediaConfigCommitInput & { contentFingerprint: string; changeCount: number };
  changes: Array<MediaConfigCommitChangeInput & { contentFingerprint: string }>;
}

export interface MediaConfigCommitInput {
  id: string;
  workspaceId: string;
  branchId: string;
  parentIds: string[];
  authorId: string;
  message: string;
  operationId: string;
  status: MediaConfigCommitStatus;
  changes: MediaConfigCommitChangeInput[];
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value: unknown): value is string => typeof value === 'string' && uuidPattern.test(value);

/** 检查配置提交状态是否允许前进。 */
export function canTransitionMediaConfigCommit(from: MediaConfigCommitStatus, to: MediaConfigCommitStatus): boolean {
  return (
    (from === 'prepared' && to === 'synced') ||
    (from === 'synced' && to === 'validated') ||
    (from === 'validated' && (to === 'applied' || to === 'rejected')) ||
    (from === 'applied' && to === 'released')
  );
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(',')}}`;
}

/**
 * 为完整提交 envelope 生成稳定的异步 SHA-256 指纹。
 *
 * @remarks
 * 只覆盖不可变内容：`status` 由服务端从 prepared 推进到 applied / released，计入指纹会让后台复核永远失败。
 */
export async function createMediaConfigCommitFingerprint(input: MediaConfigCommitInput): Promise<string> {
  const serialized = stableJson({
    id: input.id,
    workspaceId: input.workspaceId,
    branchId: input.branchId,
    parentIds: input.parentIds,
    authorId: input.authorId,
    message: input.message,
    operationId: input.operationId,
    changes: input.changes
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** 为单条配置变更生成稳定指纹，供 Supabase 投影和补偿扫描校验。 */
export async function createMediaConfigChangeFingerprint(change: MediaConfigCommitChangeInput): Promise<string> {
  const serialized = stableJson({
    id: change.id,
    sequence: change.sequence,
    entity: change.entity,
    entityId: change.entityId,
    operation: change.operation,
    patch: change.patch,
    inversePatch: change.inversePatch,
    expectedRevision: change.expectedRevision
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

/** 生成包含提交与变更指纹的完整领域 envelope。 */
export async function createMediaConfigCommitEnvelope(
  input: MediaConfigCommitInput
): Promise<MediaConfigCommitEnvelope> {
  assertValidMediaConfigCommit(input);
  const changes = await Promise.all(
    input.changes.map(async change => ({
      ...change,
      contentFingerprint: await createMediaConfigChangeFingerprint(change)
    }))
  );
  return {
    commit: {
      ...input,
      contentFingerprint: await createMediaConfigCommitFingerprint(input),
      changeCount: input.changes.length
    },
    changes
  };
}

/** 校验提交 envelope，阻止不完整提交进入同步或应用阶段。 */
export function assertValidMediaConfigCommit(input: MediaConfigCommitInput): void {
  if (!isUuid(input.id) || !isUuid(input.workspaceId) || !isUuid(input.authorId) || !isUuid(input.operationId))
    throw new Error('提交标识无效。');
  if (!input.branchId || input.branchId.length > 128 || !input.message.trim() || input.message.length > 500)
    throw new Error('提交内容无效。');
  if (!MEDIA_CONFIG_COMMIT_STATUSES.includes(input.status)) throw new Error('提交状态无效。');
  if (input.changes.length === 0) throw new Error('提交必须包含变更。');
  const seenSequences = new Set<number>();
  for (const change of input.changes) {
    if (
      !isUuid(change.id) ||
      !Number.isSafeInteger(change.sequence) ||
      change.sequence < 1 ||
      seenSequences.has(change.sequence)
    )
      throw new Error('提交变更序号无效。');
    if (!change.entity || !change.entityId || !MEDIA_CONFIG_COMMIT_OPERATIONS.includes(change.operation))
      throw new Error('提交变更无效。');
    if (
      change.expectedRevision !== null &&
      (!Number.isSafeInteger(change.expectedRevision) || change.expectedRevision < 0)
    )
      throw new Error('预期修订号无效。');
    seenSequences.add(change.sequence);
  }
  const sequences = [...seenSequences].sort((left, right) => left - right);
  if (sequences.some((sequence, index) => sequence !== index + 1)) throw new Error('提交变更序号必须连续。');
}
