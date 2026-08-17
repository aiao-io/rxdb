import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import analyze_file from '../cli/analyze-file.js';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('RxDBClientGenerator', () => {
  it('MenuLarge', { timeout: 120000 }, () => {
    const file = join(__dirname, '../../../..', 'packages/rxdb-test/entities/MenuLarge.ts');
    const result = analyze_file(file);
    const { metadataOptions, extendMetadataOptions } = result.find(r => r.metadataOptions.name === 'MenuLarge')!;
    const generator = new RxDBClientGenerator({
      relationQueryDeep: 10
    });
    generator.addEntity(metadataOptions, extendMetadataOptions);
    generator.exec();
    const files = generator.getSourceFiles();
    const indexJSFile = files.find(f => f.getFilePath() === 'index.js');
    expect(indexJSFile?.getText()).toMatchInlineSnapshot(`
      "import { Entity, PropertyType, TreeAdjacencyListEntityBase, __decorateClass } from '@aiao/rxdb';
      let MenuLarge = class extends TreeAdjacencyListEntityBase {};
      MenuLarge = __decorateClass(
      [
        Entity({
        name: "MenuLarge",
        tableName: "menu_large",
        properties: [
          {
            name: "title",
            type: PropertyType.string,
            columnName: "title"
          },
          {
            name: "sortOrder",
            columnName: "sort_order",
            type: PropertyType.string,
            nullable: true
          }
        ],
        features: {
          tree: {
            type: "adjacency-list",
            hasChildren: true
          }
        },
        indexes: [
          {
            name: "parent_sort",
            properties: [
              "parentId",
              "sortOrder"
            ]
          },
          {
            name: "parent_title",
            properties: [
              "parentId",
              "title"
            ],
            unique: true,
            normalized: true
          }
        ],
        repository: "TreeRepository",
        namespace: "public",
        relations: [],
        foreignKeys: [],
        computedProperties: [],
        extends: [
          "TreeAdjacencyListEntityBase",
          "EntityBase"
        ],
        displayName: "MenuLarge"
      })
      ],
      MenuLarge
      );
      const ENTITIES = [ MenuLarge ];
      export { ENTITIES, MenuLarge };"
    `);

    const indexTsFile = files.find(f => f.getFilePath() === 'index.d.ts');
    expect(indexTsFile?.getText()).toMatchInlineSnapshot(`
      "import type { CountOptions, DateRules, ENTITY_STATIC_TYPES, EntityBase, EntityType, FindAllOptions, FindByCursorOptions, FindOneOptions, FindOneOrFailOptions, FindOptions, FindTreeOptions, IEntity, ITreeEntity, RelationDateRules, RelationEntitiesObservable, RelationEntityObservable, RelationExistsRules, RelationStringRules, RelationUUIDRules, RuleGroupBase, StringRules, TreeAdjacencyListEntityBase, UUID, UUIDRules } from '@aiao/rxdb';
      import type { Observable } from 'rxjs';

      /**
       * rule
       */
      declare type MenuLargeRule = UUIDRules<MenuLarge, 'id'>
      | DateRules<MenuLarge, 'createdAt'>
      | DateRules<MenuLarge, 'updatedAt'>
      | StringRules<MenuLarge, 'createdBy'>
      | StringRules<MenuLarge, 'updatedBy'>
      | StringRules<MenuLarge, 'title'>
      | StringRules<MenuLarge, 'sortOrder'>
      | UUIDRules<MenuLarge, 'parentId'>
      | RelationExistsRules<'children', MenuLargeRuleGroup>
      | RelationUUIDRules<'children.id', UUID>
      | RelationDateRules<'children.createdAt', Date>
      | RelationDateRules<'children.updatedAt', Date>
      | RelationStringRules<'children.createdBy', string | null>
      | RelationStringRules<'children.updatedBy', string | null>
      | RelationStringRules<'children.title', string>
      | RelationStringRules<'children.sortOrder', string | null>
      | RelationUUIDRules<'children.parentId', UUID>
      | RelationExistsRules<'parent', MenuLargeRuleGroup>
      | RelationUUIDRules<'parent.id', UUID>
      | RelationDateRules<'parent.createdAt', Date>
      | RelationDateRules<'parent.updatedAt', Date>
      | RelationStringRules<'parent.createdBy', string | null>
      | RelationStringRules<'parent.updatedBy', string | null>
      | RelationStringRules<'parent.title', string>
      | RelationStringRules<'parent.sortOrder', string | null>
      | RelationUUIDRules<'parent.parentId', UUID>;

      /**
       * RuleGroupBase
       */
      export declare type MenuLargeRuleGroup = RuleGroupBase<typeof MenuLarge,
        |'id'
        |'createdAt'
        |'updatedAt'
        |'createdBy'
        |'updatedBy'
        |'title'
        |'sortOrder'
        |'parentId'
        |'children'
        |'children.id'
        |'children.createdAt'
        |'children.updatedAt'
        |'children.createdBy'
        |'children.updatedBy'
        |'children.title'
        |'children.sortOrder'
        |'children.parentId'
        |'parent'
        |'parent.id'
        |'parent.createdAt'
        |'parent.updatedAt'
        |'parent.createdBy'
        |'parent.updatedBy'
        |'parent.title'
        |'parent.sortOrder'
        |'parent.parentId',
      MenuLargeRule>;

      /**
       * OrderByField
       */
      declare type MenuLargeOrderByField = "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "title" | "sortOrder";

      /**
       * TreeRule
       */
      declare type MenuLargeTreeRule = RelationDateRules<'children.createdAt', Date>
      | RelationDateRules<'children.updatedAt', Date>
      | RelationStringRules<'children.createdBy', string | null>
      | RelationStringRules<'children.updatedBy', string | null>
      | RelationStringRules<'children.title', string>
      | RelationStringRules<'children.sortOrder', string | null>
      | RelationUUIDRules<'children.parentId', UUID>;

      /**
       * TreeRuleGroup
       */
      export declare type MenuLargeTreeRuleGroup = RuleGroupBase<typeof MenuLarge, 'children.createdAt' | 'children.updatedAt' | 'children.createdBy' | 'children.updatedBy' | 'children.title' | 'children.sortOrder' | 'children.parentId', MenuLargeTreeRule>;

      /**
       * rxdb
       */
      declare module "@aiao/rxdb" {
        /**
         * RxDB
         */
        interface RxDB {
          /**
           * MenuLarge
           */
          MenuLarge: typeof MenuLarge;
        }
      }

      /**
       * 静态类型
       */
      export interface MenuLargeStaticTypes {
        /**
         * id 类型
         */
        idType: UUID;
        /**
         * 查询选项
         */
        getOptions: UUID;
        /**
         * 查询选项
         */
        findOneOrFailOptions: FindOneOrFailOptions<typeof MenuLarge,MenuLargeRuleGroup,MenuLargeOrderByField>;
        /**
         * 查询选项
         */
        findOptions: FindOptions<typeof MenuLarge,MenuLargeRuleGroup,MenuLargeOrderByField>;
        /**
         * 查询选项
         */
        findOneOptions: FindOneOptions<typeof MenuLarge,MenuLargeRuleGroup,MenuLargeOrderByField>;
        /**
         * 查询选项
         */
        findAllOptions: FindAllOptions<typeof MenuLarge,MenuLargeRuleGroup,MenuLargeOrderByField>;
        /**
         * 查询选项
         */
        findByCursorOptions: FindByCursorOptions<typeof MenuLarge,MenuLargeRuleGroup,MenuLargeOrderByField>;
        /**
         * 查询选项
         */
        countOptions: CountOptions<typeof MenuLarge,MenuLargeRuleGroup>;
        /**
         * 查询的实体
         */
        entity: MenuLarge;
        /**
         * 查询选项
         */
        findDescendantsOptions: FindTreeOptions<typeof MenuLarge,MenuLargeTreeRuleGroup>;
        /**
         * 查询选项
         */
        countDescendantsOptions: FindTreeOptions<typeof MenuLarge,MenuLargeTreeRuleGroup>;
        /**
         * 查询选项
         */
        findAncestorsOptions: FindTreeOptions<typeof MenuLarge,MenuLargeTreeRuleGroup>;
        /**
         * 查询选项
         */
        countAncestorsOptions: FindTreeOptions<typeof MenuLarge,MenuLargeTreeRuleGroup>;
      }

      /**
       * 初始化数据
       */
      export interface MenuLargeInitData {
        /**
         * title
         */
        title?: string;
        /**
         * sortOrder
         */
        sortOrder?: string | null;
        /**
         * 父节点 id
         */
        parentId?: UUID | null;
      }

      /**
       * MenuLarge
       */
      export declare class MenuLarge extends TreeAdjacencyListEntityBase implements ITreeEntity {
        static [ENTITY_STATIC_TYPES]: MenuLargeStaticTypes;
        /**
         * 子节点
         */
        readonly children$: RelationEntitiesObservable<typeof MenuLarge>;
        /**
         * 是否有子节点
         */
        readonly hasChildren?: boolean | null;
        /**
         * 父节点
         */
        readonly parent$: RelationEntityObservable<typeof MenuLarge>;
        /**
         * 父节点 id
         */
        parentId?: UUID | null;
        /**
         * 删除
         */
        remove: () => Promise<this>;
        /**
         * 重置数据
         */
        reset: () => void;
        /**
         * 保存
         */
        save: () => Promise<this>;
        /**
         * sortOrder
         */
        sortOrder?: string | null;
        /**
         * title
         */
        title: string;
        /**
         * 初始化数据
         * @param initData 初始化数据
         */
        constructor(initData?: MenuLargeInitData);
        /**
         * 统计实体数量
         * @param options 查询选项
         * @example
         * MenuLarge.count({ where: { combinator: 'and', rules: [] } }).subscribe(total => console.log(total));
         */
        static count(options: CountOptions<typeof MenuLarge,MenuLargeRuleGroup>): Observable<number>;
        static count<T extends EntityBase>(this: new () => T, options: CountOptions<new () => T>): Observable<number>;
        /**
         * 统计祖先实体数量（不包含自身）
         * @param options 查询选项
         * @example
         * // 统计某节点的祖先层级深度
         * MenuLarge.countAncestors({ entityId: grand.id }).subscribe(depth => console.log(depth));
         */
        static countAncestors(options?: FindTreeOptions<typeof MenuLarge,MenuLargeTreeRuleGroup>): Observable<number>;
        static countAncestors<T extends TreeAdjacencyListEntityBase>(this: new () => T, options: FindTreeOptions<new () => T>): Observable<number>;
        /**
         * 统计子孙实体数量（不包含自身）
         * @param options 查询选项
         * @example
         * // 统计某节点下的后代数量
         * MenuLarge.countDescendants({ entityId: root.id }).subscribe(count => console.log(count));
         */
        static countDescendants(options?: FindTreeOptions<typeof MenuLarge,MenuLargeTreeRuleGroup>): Observable<number>;
        static countDescendants<T extends TreeAdjacencyListEntityBase>(this: new () => T, options: FindTreeOptions<new () => T>): Observable<number>;
        /**
         * 查询多个实体
         * @param options 查询选项
         * @example
         * MenuLarge.find({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
         */
        static find(options: FindOptions<typeof MenuLarge,MenuLargeRuleGroup,MenuLargeOrderByField>): Observable<MenuLarge[]>;
        static find<T extends EntityBase>(this: new () => T, options: FindOptions<new () => T>): Observable<T[]>;
        /**
         * 查询所有实体
         * @param options 查询选项
         * @example
         * MenuLarge.findAll({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
         */
        static findAll(options: FindAllOptions<typeof MenuLarge,MenuLargeRuleGroup,MenuLargeOrderByField>): Observable<MenuLarge[]>;
        static findAll<T extends EntityBase>(this: new () => T, options: FindAllOptions<new () => T>): Observable<T[]>;
        /**
         * 查询祖先实体（包含自身）
         * @param options 查询选项
         * @example
         * // 查询某节点的所有祖先（面包屑导航）
         * MenuLarge.findAncestors({ entityId: grand.id }).subscribe(ancestors => console.log(ancestors));
         *
         * // 仅查询直接父节点（level 1）
         * MenuLarge.findAncestors({ entityId: grand.id, level: 1 }).subscribe(parents => console.log(parents));
         */
        static findAncestors(options?: FindTreeOptions<typeof MenuLarge,MenuLargeTreeRuleGroup>): Observable<MenuLarge[]>;
        static findAncestors<T extends TreeAdjacencyListEntityBase>(this: new () => T, options: FindTreeOptions<new () => T>): Observable<T[]>;
        /**
         * 游标分页查询
         * @param options 查询选项
         * @example
         * MenuLarge.findByCursor({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
         */
        static findByCursor(options: FindByCursorOptions<typeof MenuLarge,MenuLargeRuleGroup,MenuLargeOrderByField>): Observable<MenuLarge[]>;
        static findByCursor<T extends EntityBase>(this: new () => T, options: FindByCursorOptions<new () => T>): Observable<T[]>;
        /**
         * 查询子孙实体（包含自身）
         * @param options 查询选项
         * @example
         * // 查询某节点的所有后代
         * MenuLarge.findDescendants({ entityId: root.id }).subscribe(list => console.log(list));
         *
         * // 仅查询直接子节点（level 1）
         * MenuLarge.findDescendants({ entityId: root.id, level: 1 }).subscribe(children => console.log(children));
         */
        static findDescendants(options?: FindTreeOptions<typeof MenuLarge,MenuLargeTreeRuleGroup>): Observable<MenuLarge[]>;
        static findDescendants<T extends TreeAdjacencyListEntityBase>(this: new () => T, options: FindTreeOptions<new () => T>): Observable<T[]>;
        /**
         * 查询单个实体,未找到时返回 null
         * @param options 查询选项
         * @example
         * MenuLarge.findOne({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
         */
        static findOne(options: FindOneOptions<typeof MenuLarge,MenuLargeRuleGroup,MenuLargeOrderByField>): Observable<MenuLarge | null>;
        static findOne<T extends EntityBase>(this: new () => T, options: FindOneOptions<new () => T>): Observable<T | null>;
        /**
         * 查询单个实体,未找到时抛出错误
         * @param options 查询选项
         * @example
         * MenuLarge.findOneOrFail({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
         */
        static findOneOrFail(options: FindOneOrFailOptions<typeof MenuLarge,MenuLargeRuleGroup,MenuLargeOrderByField>): Observable<MenuLarge>;
        static findOneOrFail<T extends EntityBase>(this: new () => T, options: FindOneOrFailOptions<new () => T>): Observable<T>;
        /**
         * 根据 ID 获取单个实体
         * @param options 查询选项
         * @example
         * MenuLarge.get('123').subscribe(entity => console.log(entity));
         */
        static get(options: UUID): Observable<MenuLarge>;
        static get<T extends EntityBase>(this: new () => T, id: UUID): Observable<T>;
      }

      export declare const ENTITIES: EntityType[];

      "
    `);
  });
});
