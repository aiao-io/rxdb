import { ENTITY_BASE_METADATA_OPTIONS, type EntityType, getEntityMetadata, PropertyType } from '@aiao/rxdb';
import { RxDBClientGenerator } from '@aiao/rxdb-client-generator';
import { describe, expect, it } from 'vitest';
import { GraphEntity } from '../../@GraphEntity.js';
import { GRAPH_ENTITY_BASE_OPTIONS, GraphEntityBase } from '../../GraphEntityBase.js';
import { GraphRepositoryGenerator } from '../../generator/GraphRepositoryGenerator.js';

/**
 * Person 实体 - 社交网络节点
 * 代表社交网络中的用户
 */
@GraphEntity({
  name: 'Person',
  displayName: '用户',
  properties: [
    {
      type: PropertyType.string,
      name: 'name',
      displayName: '姓名'
    },
    {
      type: PropertyType.number,
      name: 'age',
      displayName: '年龄',
      nullable: true
    },
    {
      type: PropertyType.string,
      name: 'city',
      displayName: '城市',
      nullable: true
    },
    {
      type: PropertyType.string,
      name: 'bio',
      displayName: '个人简介',
      nullable: true
    }
  ],
  features: {
    graph: {
      type: 'directed-graph',
      weight: true
    }
  }
})
export class Person extends GraphEntityBase {}

@GraphEntity({
  name: 'Workflow',
  properties: [
    {
      type: PropertyType.string,
      name: 'name'
    }
  ],
  features: {
    graph: {
      type: 'directed-graph',
      properties: [
        {
          type: PropertyType.string,
          name: 'metadata'
        }
      ]
    }
  }
})
export class Workflow extends GraphEntityBase {}

@GraphEntity({
  name: 'BasicGraphNode',
  properties: [{ type: PropertyType.string, name: 'name' }],
  features: { graph: { type: 'directed-graph' } }
})
class BasicGraphNode extends GraphEntityBase {}

@GraphEntity({
  name: 'FullGraphNode',
  properties: [{ type: PropertyType.string, name: 'name' }],
  features: {
    graph: {
      type: 'directed-graph',
      weight: true,
      properties: [{ type: PropertyType.string, name: 'kind' }]
    }
  }
})
class FullGraphNode extends GraphEntityBase {}

const generateGraphEntity = (EntityType: EntityType): string => {
  const generator = new RxDBClientGenerator({ relationQueryDeep: 10 });
  generator.addEntity(EntityType);
  generator.registerAbstractMetadata('GraphEntityBase', [GRAPH_ENTITY_BASE_OPTIONS, ENTITY_BASE_METADATA_OPTIONS]);
  generator.registerRepositoryGenerator(new GraphRepositoryGenerator());
  generator.exec();
  return (
    generator
      .getSourceFiles()
      .find(file => file.getFilePath() === 'index.d.ts')
      ?.getText() ?? ''
  );
};

describe('graph', () => {
  it('Person', { timeout: 30000 }, () => {
    const generator = new RxDBClientGenerator({
      relationQueryDeep: 10
    });
    generator.addEntity(Person);
    generator.registerAbstractMetadata('GraphEntityBase', [GRAPH_ENTITY_BASE_OPTIONS, ENTITY_BASE_METADATA_OPTIONS]);
    generator.registerRepositoryGenerator(new GraphRepositoryGenerator());
    generator.exec();
    const files = generator.getSourceFiles();
    const indexJSFile = files.find(f => f.getFilePath() === 'index.js');
    const indexDJSFile = files.find(f => f.getFilePath() === 'index.d.ts');
    const javascript = indexJSFile?.getText() ?? '';
    const declaration = indexDJSFile?.getText() ?? '';

    expect(javascript).toContain("import { GraphEntityBase } from '@aiao/rxdb-plugin-graph';");
    expect(javascript).not.toMatch(/import \{[^}]*GraphEntityBase[^}]*\} from '@aiao\/rxdb';/);
    expect(declaration).toContain(
      "import type { EdgeFilterOptions, EdgeFilterOptionsWithWeight, EdgeInfoWithWeight, FindNeighborsOptions, FindPathsOptions, GraphEdgeInfoType, GraphEdgePropertiesRecord, GraphEntityBase, GraphPath, GraphQueryResult, GraphWhere, NeighborResult } from '@aiao/rxdb-plugin-graph';"
    );
    expect(declaration).not.toMatch(/import type \{[^}]*GraphEntityBase[^}]*\} from '@aiao\/rxdb';/);
    expect(declaration).toContain(
      'static findNeighbors(options: FindNeighborsOptions<typeof Person, GraphWhere<typeof Person>, EdgeFilterOptionsWithWeight>): Promise<GraphQueryResult<NeighborResult<typeof Person, EdgeInfoWithWeight>>>;'
    );
    expect(declaration).toContain(
      'static findNeighbors$(options: FindNeighborsOptions<typeof Person, GraphWhere<typeof Person>, EdgeFilterOptionsWithWeight>): Observable<GraphQueryResult<NeighborResult<typeof Person, EdgeInfoWithWeight>>>;'
    );
    expect(indexJSFile?.getText()).toMatchInlineSnapshot(`
      "import { Entity, PropertyType, __decorateClass } from '@aiao/rxdb';
      import { GraphEntityBase } from '@aiao/rxdb-plugin-graph';
      let Person = class extends GraphEntityBase {};
      Person = __decorateClass(
      [
        Entity({
        name: "Person",
        displayName: "用户",
        properties: [
          {
            type: PropertyType.string,
            name: "name",
            displayName: "姓名",
            columnName: "name"
          },
          {
            type: PropertyType.number,
            name: "age",
            displayName: "年龄",
            nullable: true,
            columnName: "age"
          },
          {
            type: PropertyType.string,
            name: "city",
            displayName: "城市",
            nullable: true,
            columnName: "city"
          },
          {
            type: PropertyType.string,
            name: "bio",
            displayName: "个人简介",
            nullable: true,
            columnName: "bio"
          }
        ],
        features: {
          graph: {
            type: "directed-graph",
            weight: true
          }
        },
        repository: "GraphRepository",
        namespace: "public",
        relations: [],
        indexes: [],
        foreignKeys: [],
        computedProperties: [],
        extends: [
          "GraphEntityBase",
          "EntityBase"
        ],
        tableName: "Person"
      })
      ],
      Person
      );
      const ENTITIES = [ Person ];
      export { ENTITIES, Person };"
    `);
    expect(indexDJSFile?.getText()).toMatchInlineSnapshot(`
      "import type { CountOptions, DateRules, ENTITY_STATIC_TYPES, EntityBase, EntityType, FindAllOptions, FindByCursorOptions, FindOneOptions, FindOneOrFailOptions, FindOptions, IEntity, ITreeEntity, NumberRules, RuleGroupBase, StringRules, UUID, UUIDRules } from '@aiao/rxdb';
      import type { EdgeFilterOptions, EdgeFilterOptionsWithWeight, EdgeInfoWithWeight, FindNeighborsOptions, FindPathsOptions, GraphEdgeInfoType, GraphEdgePropertiesRecord, GraphEntityBase, GraphPath, GraphQueryResult, GraphWhere, NeighborResult } from '@aiao/rxdb-plugin-graph';
      import type { Observable } from 'rxjs';

      /**
       * rule
       */
      declare type PersonRule = UUIDRules<Person, 'id'>
      | DateRules<Person, 'createdAt'>
      | DateRules<Person, 'updatedAt'>
      | StringRules<Person, 'createdBy'>
      | StringRules<Person, 'updatedBy'>
      | StringRules<Person, 'name'>
      | NumberRules<Person, 'age'>
      | StringRules<Person, 'city'>
      | StringRules<Person, 'bio'>;

      /**
       * RuleGroupBase
       */
      export declare type PersonRuleGroup = RuleGroupBase<typeof Person,
        |'id'
        |'createdAt'
        |'updatedAt'
        |'createdBy'
        |'updatedBy'
        |'name'
        |'age'
        |'city'
        |'bio',
      PersonRule>;

      /**
       * OrderByField
       */
      declare type PersonOrderByField = "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "name" | "age" | "city" | "bio";

      /**
       * rxdb
       */
      declare module "@aiao/rxdb" {
        /**
         * RxDB
         */
        interface RxDB {
          /**
           * 用户
           */
          Person: typeof Person;
        }
      }

      /**
       * 静态类型
       */
      export interface PersonStaticTypes {
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
        findOneOrFailOptions: FindOneOrFailOptions<typeof Person,PersonRuleGroup,PersonOrderByField>;
        /**
         * 查询选项
         */
        findOptions: FindOptions<typeof Person,PersonRuleGroup,PersonOrderByField>;
        /**
         * 查询选项
         */
        findOneOptions: FindOneOptions<typeof Person,PersonRuleGroup,PersonOrderByField>;
        /**
         * 查询选项
         */
        findAllOptions: FindAllOptions<typeof Person,PersonRuleGroup,PersonOrderByField>;
        /**
         * 查询选项
         */
        findByCursorOptions: FindByCursorOptions<typeof Person,PersonRuleGroup,PersonOrderByField>;
        /**
         * 查询选项
         */
        countOptions: CountOptions<typeof Person,PersonRuleGroup>;
        /**
         * 查询选项
         */
        findNeighborsOptions: FindNeighborsOptions<typeof Person, GraphWhere<typeof Person>, EdgeFilterOptionsWithWeight>;
        /**
         * 查询选项
         */
        countNeighborsOptions: FindNeighborsOptions<typeof Person, GraphWhere<typeof Person>, EdgeFilterOptionsWithWeight>;
        /**
         * 查询选项
         */
        findPathsOptions: FindPathsOptions<typeof Person, GraphWhere<typeof Person>, EdgeFilterOptionsWithWeight>;
      }

      /**
       * 初始化数据
       */
      export interface PersonInitData {
        /**
         * 姓名
         */
        name?: string;
        /**
         * 年龄
         */
        age?: number | null;
        /**
         * 城市
         */
        city?: string | null;
        /**
         * 个人简介
         */
        bio?: string | null;
      }

      /**
       * 用户
       */
      export declare class Person extends GraphEntityBase implements IEntity {
        static [ENTITY_STATIC_TYPES]: PersonStaticTypes;
        /**
         * 年龄
         */
        age?: number | null;
        /**
         * 个人简介
         */
        bio?: string | null;
        /**
         * 城市
         */
        city?: string | null;
        /**
         * 姓名
         */
        name: string;
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
         * 初始化数据
         * @param initData 初始化数据
         */
        constructor(initData?: PersonInitData);
        /**
         * 添加边
         * @param from 起始节点
         * @param to 目标节点
         * @param weight 权重
         */
        static addEdge(from: Person, to: Person, weight?: number | null): Promise<void>;
        static addEdge<T extends GraphEntityBase>(this: new () => T, from: T, to: T, weight?: number | null, properties?: GraphEdgePropertiesRecord | null): Promise<void>;
        /**
         * 统计实体数量
         * @param options 查询选项
         * @example
         * Person.count({ where: { combinator: 'and', rules: [] } }).subscribe(total => console.log(total));
         */
        static count(options: CountOptions<typeof Person,PersonRuleGroup>): Observable<number>;
        static count<T extends EntityBase>(this: new () => T, options: CountOptions<new () => T>): Observable<number>;
        /**
         * 统计邻居节点数量（不包含起始节点）
         * @param options 查询选项
         */
        static countNeighbors(options: FindNeighborsOptions<typeof Person, GraphWhere<typeof Person>, EdgeFilterOptionsWithWeight>): Promise<number>;
        static countNeighbors<T extends GraphEntityBase, U extends EdgeFilterOptions = EdgeFilterOptions>(this: new () => T, options: FindNeighborsOptions<new () => T, GraphWhere<new () => T>, U>): Promise<number>;
        /**
         * 响应式统计邻居节点数量（不包含起始节点）
         * @param options 查询选项
         */
        static countNeighbors$(options: FindNeighborsOptions<typeof Person, GraphWhere<typeof Person>, EdgeFilterOptionsWithWeight>): Observable<number>;
        static countNeighbors$<T extends GraphEntityBase, U extends EdgeFilterOptions = EdgeFilterOptions>(this: new () => T, options: FindNeighborsOptions<new () => T, GraphWhere<new () => T>, U>): Observable<number>;
        /**
         * 查询多个实体
         * @param options 查询选项
         * @example
         * Person.find({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
         */
        static find(options: FindOptions<typeof Person,PersonRuleGroup,PersonOrderByField>): Observable<Person[]>;
        static find<T extends EntityBase>(this: new () => T, options: FindOptions<new () => T>): Observable<T[]>;
        /**
         * 查询所有实体
         * @param options 查询选项
         * @example
         * Person.findAll({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
         */
        static findAll(options: FindAllOptions<typeof Person,PersonRuleGroup,PersonOrderByField>): Observable<Person[]>;
        static findAll<T extends EntityBase>(this: new () => T, options: FindAllOptions<new () => T>): Observable<T[]>;
        /**
         * 游标分页查询
         * @param options 查询选项
         * @example
         * Person.findByCursor({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
         */
        static findByCursor(options: FindByCursorOptions<typeof Person,PersonRuleGroup,PersonOrderByField>): Observable<Person[]>;
        static findByCursor<T extends EntityBase>(this: new () => T, options: FindByCursorOptions<new () => T>): Observable<T[]>;
        /**
         * 查找邻居节点（带边信息）
         * @param options 查询选项
         */
        static findNeighbors(options: FindNeighborsOptions<typeof Person, GraphWhere<typeof Person>, EdgeFilterOptionsWithWeight>): Promise<GraphQueryResult<NeighborResult<typeof Person, EdgeInfoWithWeight>>>;
        static findNeighbors<T extends GraphEntityBase, U extends EdgeFilterOptions = EdgeFilterOptions>(this: new () => T, options: FindNeighborsOptions<new () => T, GraphWhere<new () => T>, U>): Promise<GraphQueryResult<NeighborResult<new () => T, GraphEdgeInfoType<U>>>>;
        /**
         * 响应式查找邻居节点（带边信息）
         * @param options 查询选项
         */
        static findNeighbors$(options: FindNeighborsOptions<typeof Person, GraphWhere<typeof Person>, EdgeFilterOptionsWithWeight>): Observable<GraphQueryResult<NeighborResult<typeof Person, EdgeInfoWithWeight>>>;
        static findNeighbors$<T extends GraphEntityBase, U extends EdgeFilterOptions = EdgeFilterOptions>(this: new () => T, options: FindNeighborsOptions<new () => T, GraphWhere<new () => T>, U>): Observable<GraphQueryResult<NeighborResult<new () => T, GraphEdgeInfoType<U>>>>;
        /**
         * 查询单个实体,未找到时返回 null
         * @param options 查询选项
         * @example
         * Person.findOne({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
         */
        static findOne(options: FindOneOptions<typeof Person,PersonRuleGroup,PersonOrderByField>): Observable<Person | null>;
        static findOne<T extends EntityBase>(this: new () => T, options: FindOneOptions<new () => T>): Observable<T | null>;
        /**
         * 查询单个实体,未找到时抛出错误
         * @param options 查询选项
         * @example
         * Person.findOneOrFail({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
         */
        static findOneOrFail(options: FindOneOrFailOptions<typeof Person,PersonRuleGroup,PersonOrderByField>): Observable<Person>;
        static findOneOrFail<T extends EntityBase>(this: new () => T, options: FindOneOrFailOptions<new () => T>): Observable<T>;
        /**
         * 查找两个节点之间的所有路径
         * @param options 查询选项
         */
        static findPaths(options: FindPathsOptions<typeof Person, GraphWhere<typeof Person>, EdgeFilterOptionsWithWeight>): Promise<GraphQueryResult<GraphPath<typeof Person>>>;
        static findPaths<T extends GraphEntityBase, U extends EdgeFilterOptions = EdgeFilterOptions>(this: new () => T, options: FindPathsOptions<new () => T, GraphWhere<new () => T>, U>): Promise<GraphQueryResult<GraphPath<new () => T>>>;
        /**
         * 响应式查找两个节点之间的路径
         * @param options 查询选项
         */
        static findPaths$(options: FindPathsOptions<typeof Person, GraphWhere<typeof Person>, EdgeFilterOptionsWithWeight>): Observable<GraphQueryResult<GraphPath<typeof Person>>>;
        static findPaths$<T extends GraphEntityBase, U extends EdgeFilterOptions = EdgeFilterOptions>(this: new () => T, options: FindPathsOptions<new () => T, GraphWhere<new () => T>, U>): Observable<GraphQueryResult<GraphPath<new () => T>>>;
        /**
         * 根据 ID 获取单个实体
         * @param options 查询选项
         * @example
         * Person.get('123').subscribe(entity => console.log(entity));
         */
        static get(options: UUID): Observable<Person>;
        static get<T extends EntityBase>(this: new () => T, id: UUID): Observable<T>;
        /**
         * 移除边
         * @param from 起始节点
         * @param to 目标节点
         */
        static removeEdge(from: Person, to: Person): Promise<void>;
        static removeEdge<T extends GraphEntityBase>(this: new () => T, from: T, to: T): Promise<void>;
      }

      export declare const ENTITIES: EntityType[];

      "
    `);
  });

  it('Workflow（properties-only 图的 addEdge 参数位置必须与运行时 ABI 一致，GRAPH-004）', { timeout: 30000 }, () => {
    const generator = new RxDBClientGenerator({ relationQueryDeep: 10 });
    generator.addEntity(Workflow);
    generator.registerAbstractMetadata('GraphEntityBase', [GRAPH_ENTITY_BASE_OPTIONS, ENTITY_BASE_METADATA_OPTIONS]);
    generator.registerRepositoryGenerator(new GraphRepositoryGenerator());
    generator.exec();
    const indexDJSFile = generator.getSourceFiles().find(f => f.getFilePath() === 'index.d.ts');
    const declaration = indexDJSFile?.getText() ?? '';

    // 运行时 ABI 固定为 addEdge(from, to, weight?, properties?)。该图未启用 weight，
    // 但 weight 槽必须占位，否则属性对象会落进 weight 槽被丢掉。
    expect(declaration).toContain(
      'static addEdge(from: Workflow, to: Workflow, weight: undefined, properties?: WorkflowEdgeProperties | null): Promise<void>;'
    );
    expect(declaration).not.toContain(
      'static addEdge(from: Workflow, to: Workflow, properties?: WorkflowEdgeProperties)'
    );
  });

  it.each([
    {
      variant: 'basic',
      EntityType: BasicGraphNode,
      edgeFilterType: 'EdgeFilterOptions',
      edgeInfoType: 'EdgeInfo',
      addEdge: 'static addEdge(from: BasicGraphNode, to: BasicGraphNode): Promise<void>;'
    },
    {
      variant: 'weight',
      EntityType: Person,
      edgeFilterType: 'EdgeFilterOptionsWithWeight',
      edgeInfoType: 'EdgeInfoWithWeight',
      addEdge: 'static addEdge(from: Person, to: Person, weight?: number | null): Promise<void>;'
    },
    {
      variant: 'properties',
      EntityType: Workflow,
      edgeFilterType: 'EdgeFilterOptionsWithProperties<WorkflowEdgeProperties>',
      edgeInfoType: 'EdgeInfoWithProperties<WorkflowEdgeProperties>',
      addEdge:
        'static addEdge(from: Workflow, to: Workflow, weight: undefined, properties?: WorkflowEdgeProperties | null): Promise<void>;'
    },
    {
      variant: 'full',
      EntityType: FullGraphNode,
      edgeFilterType: 'EdgeFilterOptionsFull<FullGraphNodeEdgeProperties>',
      edgeInfoType: 'EdgeInfoFull<FullGraphNodeEdgeProperties>',
      addEdge:
        'static addEdge(from: FullGraphNode, to: FullGraphNode, weight?: number | null, properties?: FullGraphNodeEdgeProperties | null): Promise<void>;'
    }
  ])('为 $variant 图生成可编译的插件类型与双查询 API', ({ EntityType, edgeFilterType, edgeInfoType, addEdge }) => {
    const declaration = generateGraphEntity(EntityType);
    const className = getEntityMetadata(EntityType).name;
    const options = `FindNeighborsOptions<typeof ${className}, GraphWhere<typeof ${className}>, ${edgeFilterType}>`;
    const result = `GraphQueryResult<NeighborResult<typeof ${className}, ${edgeInfoType}>>`;
    const graphImport = declaration.split('\n').find(line => line.endsWith("from '@aiao/rxdb-plugin-graph';"));

    expect(graphImport).toContain('GraphEntityBase');
    expect(graphImport).toContain(edgeFilterType.split('<')[0]);
    expect(graphImport).toContain(edgeInfoType.split('<')[0]);
    expect(declaration).not.toMatch(/import \{[^}]*GraphEntityBase[^}]*\} from '@aiao\/rxdb';/);
    expect(declaration).toContain(`static findNeighbors(options: ${options}): Promise<${result}>;`);
    expect(declaration).toContain(`static findNeighbors$(options: ${options}): Observable<${result}>;`);
    expect(declaration).toContain(addEdge);
  });
});
