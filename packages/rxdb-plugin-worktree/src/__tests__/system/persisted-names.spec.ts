/**
 * @fileoverview 持久化名的钉子：本插件写进库里、随库永久存在的名字，一个字都不许变。
 *
 * @remarks
 * US-309 改名用的是全局文本替换，`expectedWorkingTreeRevision` 列与物化指纹的域前缀就是这样被
 * 顺手改掉的——属性名即列名，改属性名等于改表结构，而 `#ensureSystemTables` 只建缺的表、
 * 从不补列，没有任何一层会报错。这份文件把「库里实际叫什么」写成字面量：
 *
 * - **物理形状**：11 张系统表的表名、每个属性落到的列名、唯一列（SQLite / PGlite 的唯一索引名
 *   由属性名派生）、外键列名、组合索引。属性名可以随公开 API 改，列名不行——两者分开时用
 *   `columnName` 钉住旧列名（`WorkingTreeRestoreSession.expectedWorktreeRevision` 就是这样）。
 * - **持久化字面量**：能力名、迁移名、物化指纹的域前缀（哈希输入，落在
 *   `rxdb_working_tree_materialization_stage.fingerprint`）。
 *
 * 这里的任何一处要改，都意味着既有库要跟着迁移：先写迁移、定版本口径，再改字面量。
 * 新增系统表或列时把它补进字面量，让「这是一次表结构变更」在评审里看得见。
 */

import { getEntityMetadata, RxDB, SyncType, type EntityType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { WORKING_TREE_CAPABILITY } from '../../capability-identity.js';
import { CommitBranchRef } from '../../commit/commit-branch-ref.entity.js';
import { CommitCapabilityState } from '../../commit/commit-capability-state.entity.js';
import { CommitChangeSet } from '../../commit/commit-change-set.entity.js';
import { Commit } from '../../commit/commit.entity.js';
import { WORKING_TREE_COMMITS_MIGRATION_NAME } from '../../migrations/0004-working-tree-commits.js';
import { WORKTREES_MIGRATION_NAME } from '../../migrations/0005-worktrees.js';
import { RxDBPluginWorktree } from '../../plugin.js';
import { MATERIALIZATION_FINGERPRINT_DOMAIN } from '../../working-tree/branch-materialization.js';
import { WorkingTreeActivationState } from '../../working-tree/working-tree-activation-state.entity.js';
import { WorkingTreeEntry } from '../../working-tree/working-tree-entry.entity.js';
import { WorkingTreeMaterializationPage } from '../../working-tree/working-tree-materialization-page.entity.js';
import { WorkingTreeMaterializationStage } from '../../working-tree/working-tree-materialization-stage.entity.js';
import { WorkingTreeRestoreSession } from '../../working-tree/working-tree-restore-session.entity.js';
import { WorkingTreeState } from '../../working-tree/working-tree-state.entity.js';
import { Worktree } from '../../worktree/worktree.entity.js';
import { createMockAdapter } from '../fixtures/test-db-setup.js';

/** 库里看得见的那一层：表、列、唯一列、外键列、组合索引。 */
interface PhysicalShape {
  readonly tableName: string;
  /** `[属性名, 列名]`，按声明顺序。 */
  readonly columns: readonly (readonly [string, string])[];
  readonly uniqueColumns: readonly string[];
  /** `[关系名, 外键列名]`；列名在关系元数据的联合类型里是可选的，缺了就让比对失败。 */
  readonly foreignKeys: readonly (readonly [string, string | undefined])[];
  readonly indexes: readonly {
    readonly name: string;
    readonly properties: readonly string[];
    readonly unique: boolean;
  }[];
}

/** 一个没 `init()` 过的宿主；读 `system` 不需要连接。 */
const createDatabase = (): RxDB => {
  const database = new RxDB({
    dbName: `rxdb-persisted-names-${Math.random().toString(36).slice(2)}`,
    entities: [],
    sync: { local: { adapter: 'local' }, type: SyncType.None }
  });
  database.adapter('local', db => createMockAdapter(db));
  return database;
};

const physicalShapeOf = (EntityClass: EntityType): PhysicalShape => {
  const metadata = getEntityMetadata(EntityClass);
  return {
    tableName: metadata.tableName,
    columns: metadata.properties.map(property => [property.name, property.columnName] as const),
    uniqueColumns: metadata.properties.filter(property => property.unique === true).map(property => property.name),
    foreignKeys: metadata.foreignKeyRelations.map(relation => [relation.name, relation.columnName] as const),
    indexes: metadata.indexes.map(index => ({
      name: index.name,
      properties: index.properties ?? [],
      unique: index.unique === true
    }))
  };
};

/** 按系统贡献的声明顺序（即建表顺序）排列。 */
const EXPECTED_SHAPES: readonly (readonly [EntityType, PhysicalShape])[] = [
  [
    CommitCapabilityState,
    {
      tableName: 'rxdb_commit_capability',
      columns: [
        ['id', 'id'],
        ['enabled', 'enabled'],
        ['protocolVersion', 'protocolVersion'],
        ['schemaVersion', 'schemaVersion'],
        ['codecVersion', 'codecVersion'],
        ['enabledAt', 'enabledAt']
      ],
      uniqueColumns: [],
      foreignKeys: [],
      indexes: []
    }
  ],
  [
    WorkingTreeActivationState,
    {
      tableName: 'rxdb_working_tree_activation',
      columns: [
        ['id', 'id'],
        ['activationRevision', 'activationRevision'],
        ['branchGenerationSeq', 'branchGenerationSeq']
      ],
      uniqueColumns: [],
      foreignKeys: [],
      indexes: []
    }
  ],
  [
    Commit,
    {
      tableName: 'rxdb_commit',
      columns: [
        ['id', 'id'],
        ['parentIds', 'parentIds'],
        ['firstParentId', 'firstParentId'],
        ['kind', 'kind'],
        ['message', 'message'],
        ['author', 'author'],
        ['createdAt', 'createdAt'],
        ['operationId', 'operationId'],
        ['changeSetCount', 'changeSetCount'],
        ['contentFingerprint', 'contentFingerprint']
      ],
      uniqueColumns: ['operationId'],
      foreignKeys: [],
      indexes: [{ name: 'idx_commit_first_parent', properties: ['firstParentId'], unique: false }]
    }
  ],
  [
    CommitChangeSet,
    {
      tableName: 'rxdb_commit_change_set',
      columns: [
        ['id', 'id'],
        ['sequence', 'sequence'],
        ['unitId', 'unitId'],
        ['transactionId', 'transactionId'],
        ['namespace', 'namespace'],
        ['entity', 'entity'],
        ['entityId', 'entityId'],
        ['operation', 'operation'],
        ['patch', 'patch'],
        ['inversePatch', 'inversePatch'],
        ['origin', 'origin']
      ],
      uniqueColumns: [],
      foreignKeys: [['commit', 'commitId']],
      indexes: [{ name: 'idx_commit_change_set_sequence', properties: ['commitId', 'sequence'], unique: true }]
    }
  ],
  [
    CommitBranchRef,
    {
      tableName: 'rxdb_commit_branch_ref',
      columns: [
        ['id', 'id'],
        ['generation', 'generation'],
        ['headCommitId', 'headCommitId'],
        ['headRevision', 'headRevision'],
        ['status', 'status'],
        ['corruptedAt', 'corruptedAt']
      ],
      uniqueColumns: [],
      foreignKeys: [['branch', 'branchId']],
      indexes: []
    }
  ],
  [
    WorkingTreeState,
    {
      tableName: 'rxdb_working_tree_state',
      columns: [
        ['id', 'id'],
        ['baseHeadCommitId', 'baseHeadCommitId'],
        ['workingTreeRevision', 'workingTreeRevision'],
        ['entryCount', 'entryCount'],
        ['updatedAt', 'updatedAt']
      ],
      uniqueColumns: [],
      foreignKeys: [['branch', 'branchId']],
      indexes: []
    }
  ],
  [
    WorkingTreeEntry,
    {
      tableName: 'rxdb_working_tree_entry',
      columns: [
        ['id', 'id'],
        ['unitId', 'unitId'],
        ['transactionId', 'transactionId'],
        ['namespace', 'namespace'],
        ['entity', 'entity'],
        ['entityId', 'entityId'],
        ['operation', 'operation'],
        ['patch', 'patch'],
        ['inversePatch', 'inversePatch'],
        ['fingerprint', 'fingerprint'],
        ['origin', 'origin'],
        ['sourceChangeId', 'sourceChangeId'],
        ['createdAt', 'createdAt'],
        ['updatedAt', 'updatedAt']
      ],
      uniqueColumns: [],
      foreignKeys: [['branch', 'branchId']],
      indexes: [
        { name: 'idx_working_tree_entry_unit', properties: ['branchId', 'unitId'], unique: false },
        {
          name: 'idx_working_tree_entry_identity',
          properties: ['branchId', 'namespace', 'entity', 'entityId'],
          unique: true
        }
      ]
    }
  ],
  [
    WorkingTreeRestoreSession,
    {
      tableName: 'rxdb_working_tree_restore_session',
      columns: [
        ['id', 'id'],
        ['targetCommitId', 'targetCommitId'],
        ['expectedHeadRevision', 'expectedHeadRevision'],
        ['expectedWorktreeRevision', 'expectedWorkingTreeRevision'],
        ['status', 'status'],
        ['activeKey', 'activeKey'],
        ['createdAt', 'createdAt'],
        ['updatedAt', 'updatedAt']
      ],
      uniqueColumns: ['activeKey'],
      foreignKeys: [['branch', 'branchId']],
      indexes: []
    }
  ],
  [
    WorkingTreeMaterializationStage,
    {
      tableName: 'rxdb_working_tree_materialization_stage',
      columns: [
        ['id', 'id'],
        ['targetBranchId', 'targetBranchId'],
        ['frozenRemoteWatermark', 'frozenRemoteWatermark'],
        ['scopeManifest', 'scopeManifest'],
        ['fingerprint', 'fingerprint'],
        ['status', 'status'],
        ['pageCount', 'pageCount'],
        ['createdAt', 'createdAt']
      ],
      uniqueColumns: [],
      foreignKeys: [],
      indexes: [{ name: 'idx_working_tree_materialization_target', properties: ['targetBranchId'], unique: false }]
    }
  ],
  [
    WorkingTreeMaterializationPage,
    {
      tableName: 'rxdb_working_tree_materialization_page',
      columns: [
        ['id', 'id'],
        ['pageIndex', 'pageIndex'],
        ['payload', 'payload'],
        ['fingerprint', 'fingerprint']
      ],
      uniqueColumns: [],
      foreignKeys: [['stage', 'stageId']],
      indexes: [
        { name: 'idx_working_tree_materialization_page_index', properties: ['stageId', 'pageIndex'], unique: true }
      ]
    }
  ],
  [
    Worktree,
    {
      tableName: 'rxdb_worktree',
      columns: [
        ['id', 'id'],
        ['label', 'label'],
        ['createdAt', 'createdAt']
      ],
      uniqueColumns: [],
      foreignKeys: [['branch', 'branchId']],
      indexes: [{ name: 'idx_worktree_branch', properties: ['branchId'], unique: true }]
    }
  ]
];

describe('持久化名', () => {
  it('11 张系统表的表名、列名、唯一列、外键列与组合索引与既有库一致', () => {
    const contributed = new RxDBPluginWorktree(createDatabase()).system.entities;

    expect(contributed).toEqual(EXPECTED_SHAPES.map(([EntityClass]) => EntityClass));
    for (const [EntityClass, shape] of EXPECTED_SHAPES) {
      expect(physicalShapeOf(EntityClass)).toEqual(shape);
    }
  });

  it('能力名、迁移名与物化指纹的域前缀不随改名变化', () => {
    expect({
      capability: WORKING_TREE_CAPABILITY,
      migrations: [WORKING_TREE_COMMITS_MIGRATION_NAME, WORKTREES_MIGRATION_NAME],
      materializationFingerprintDomain: MATERIALIZATION_FINGERPRINT_DOMAIN
    }).toEqual({
      capability: 'workingTree',
      migrations: ['0004-working-tree-commits', '0005-worktrees'],
      materializationFingerprintDomain: 'rxdb.working-tree.materialization.v1'
    });
  });
});
