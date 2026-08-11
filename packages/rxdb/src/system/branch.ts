import { Observable } from 'rxjs';
import {
  ENTITY_STATIC_TYPES,
  RelationEntitiesObservable,
  RelationEntityObservable
} from '../entity/entity.interface.js';
import { PropertyType, RelationKind } from '../entity/metadata-options.interface.js';
import { TreeEntity } from '../entity/tree-entity.decorator.js';
import {
  CountOptions,
  FindAllOptions,
  FindByCursorOptions,
  FindOneOptions,
  FindOneOrFailOptions,
  FindOptions
} from '../repository/query-options.interface.js';
import { FindTreeOptions } from '../repository/tree-repository.interface.js';
import { RxDBChange } from './change.js';
import type { RxDBSync } from './sync.js';
import {
  RxDBBranchOrderByField,
  RxDBBranchRuleGroup,
  RxDBBranchStaticTypes,
  RxDBBranchTreeRuleGroup
} from './types.js';

/**
 * 分支表
 *
 * 记录当前分支的信息，包括是否激活、是否本地分支、是否远程分支等
 */
@TreeEntity({
  namespace: 'rxdb',
  name: 'RxDBBranch',
  tableName: 'rxdb_branch',
  log: false,
  properties: [
    {
      name: 'id',
      type: PropertyType.string,
      primary: true,
      unique: true
    },
    {
      name: 'activated',
      type: PropertyType.boolean,
      default: false
    },
    {
      name: 'fromChangeId',
      type: PropertyType.number,
      nullable: true
    },
    {
      name: 'local',
      type: PropertyType.boolean,
      default: true
    },
    {
      name: 'remote',
      type: PropertyType.boolean,
      default: false
    },
    {
      name: 'createdAt',
      type: PropertyType.date,
      default: () => new Date(),
      readonly: true,
      nullable: true
    },
    {
      name: 'updatedAt',
      type: PropertyType.date,
      default: () => new Date(),
      readonly: true,
      nullable: true
    }
  ],
  relations: [
    {
      name: 'changes',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'RxDBChange',
      mappedProperty: 'branch'
    },
    {
      name: 'syncs',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'RxDBSync',
      mappedProperty: 'branch'
    },
    {
      name: 'children',
      kind: RelationKind.ONE_TO_MANY,
      mappedEntity: 'RxDBBranch',
      mappedProperty: 'parent'
    },
    {
      name: 'parent',
      kind: RelationKind.MANY_TO_ONE,
      mappedEntity: 'RxDBBranch',
      mappedProperty: 'children',
      nullable: true
    }
  ]
})
export class RxDBBranch {
  static [ENTITY_STATIC_TYPES]: RxDBBranchStaticTypes;
  /**
   * id
   */
  id!: string;
  /**
   * 本地分支
   */
  local!: boolean;

  /**
   * 线上已有分支
   */
  remote!: boolean;

  /**
   * 是否激活
   */
  activated!: boolean;

  /**
   * 父分支 ID
   */
  parentId?: string | null;

  /**
   * 来源变更 ID
   */
  fromChangeId?: number | null;

  /**
   * 创建时间
   * @default new Date()
   */
  createdAt?: Date | null;

  /**
   * 更新时间
   * @default new Date()
   */
  updatedAt?: Date | null;

  /**
   * 父分支
   */
  parent$!: RelationEntityObservable<typeof RxDBBranch>;

  /**
   * 变更
   */
  changes$!: RelationEntitiesObservable<typeof RxDBChange>;

  /**
   * syncs - 此分支的 Repository 同步记录
   */
  syncs$!: RelationEntitiesObservable<typeof RxDBSync>;

  /**
   * 子分支
   */
  children$!: RelationEntitiesObservable<typeof RxDBBranch>;

  /**
   * count 查询
   * @param options 查询选项
   */
  declare static count: (options: CountOptions<typeof RxDBBranch, RxDBBranchRuleGroup>) => Observable<number>;
  /**
   * 查询祖先实体数量
   * @param options 查询选项
   */
  declare static countAncestors: (
    options?: FindTreeOptions<typeof RxDBBranch, RxDBBranchTreeRuleGroup>
  ) => Observable<number>;
  /**
   * 查询子孙实体数量
   * @param options 查询选项
   */
  declare static countDescendants: (
    options?: FindTreeOptions<typeof RxDBBranch, RxDBBranchTreeRuleGroup>
  ) => Observable<number>;
  /**
   * find 查询
   * @param options 查询选项
   */
  declare static find: (
    options: FindOptions<typeof RxDBBranch, RxDBBranchRuleGroup, RxDBBranchOrderByField>
  ) => Observable<RxDBBranch[]>;
  /**
   * findAll 查询
   * @param options 查询选项
   */
  declare static findAll: (
    options: FindAllOptions<typeof RxDBBranch, RxDBBranchRuleGroup, RxDBBranchOrderByField>
  ) => Observable<RxDBBranch[]>;
  /**
   * 查询祖先实体
   * @param options 查询选项
   */
  declare static findAncestors: (
    options?: FindTreeOptions<typeof RxDBBranch, RxDBBranchTreeRuleGroup>
  ) => Observable<RxDBBranch[]>;
  /**
   * findByCursor 查询
   * @param options 查询选项
   */
  declare static findByCursor: (
    options: FindByCursorOptions<typeof RxDBBranch, RxDBBranchRuleGroup, RxDBBranchOrderByField>
  ) => Observable<RxDBBranch[]>;
  /**
   * 查询子孙实体
   * @param options 查询选项
   */
  declare static findDescendants: (
    options?: FindTreeOptions<typeof RxDBBranch, RxDBBranchTreeRuleGroup>
  ) => Observable<RxDBBranch[]>;
  /**
   * findOne 查询
   * @param options 查询选项
   */
  declare static findOne: (
    options: FindOneOptions<typeof RxDBBranch, RxDBBranchRuleGroup, RxDBBranchOrderByField>
  ) => Observable<RxDBBranch | null>;
  /**
   * findOneOrFail 查询
   * @param options 查询选项
   */
  declare static findOneOrFail: (
    options: FindOneOrFailOptions<typeof RxDBBranch, RxDBBranchRuleGroup, RxDBBranchOrderByField>
  ) => Observable<RxDBBranch>;
  /**
   * get 查询
   * @param options 查询选项
   */
  declare static get: (options: string) => Observable<RxDBBranch>;

  /**
   * 删除
   */
  declare remove: () => Promise<RxDBBranch>;
  /**
   * 重置数据
   */
  declare reset: () => void;
  /**
   * 保存
   */
  declare save: () => Promise<RxDBBranch>;
}
