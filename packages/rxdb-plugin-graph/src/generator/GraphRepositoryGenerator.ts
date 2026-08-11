import type { KeyValuePropertyMetadata } from '@aiao/rxdb';
import type { GeneratorContext } from '@aiao/rxdb-client-generator';
import { RepositoryGeneratorBase } from '@aiao/rxdb-client-generator';

type EdgeTypeEntry = { filter: string; info: string };

// 根据 weight/properties 组合选择对应的边类型
const EDGE_TYPE_MAP = {
  full: { filter: 'EdgeFilterOptionsFull', info: 'EdgeInfoFull' },
  weight: { filter: 'EdgeFilterOptionsWithWeight', info: 'EdgeInfoWithWeight' },
  properties: { filter: 'EdgeFilterOptionsWithProperties', info: 'EdgeInfoWithProperties' },
  basic: { filter: 'EdgeFilterOptions', info: 'EdgeInfo' }
} as const satisfies Record<string, EdgeTypeEntry>;

// 元数据属性类型 → TypeScript 类型的映射
const PROPERTY_TYPE_MAP: Record<string, string> = {
  string: 'string',
  enum: 'string',
  number: 'number',
  integer: 'number',
  boolean: 'boolean',
  date: 'Date'
};

const GRAPH_MODULE = '@aiao/rxdb-plugin-graph';
const GRAPH_IMPORTED_TYPES = [
  'EdgeFilterOptions',
  'GraphEntityBase',
  'FindNeighborsOptions',
  'FindPathsOptions',
  'GraphEdgeInfoType',
  'GraphEdgePropertiesRecord',
  'GraphWhere',
  'GraphPath',
  'GraphQueryResult',
  'NeighborResult'
] as const;

/**
 * 图结构 Repository 方法生成器
 * 继承 Repository 基类方法，新增 GraphRepository 特有的图查询方法
 */
export class GraphRepositoryGenerator extends RepositoryGeneratorBase {
  override readonly name: string = 'GraphRepository';
  readonly entityBaseModuleSpecifier = GRAPH_MODULE;

  protected override generateMethods(context: GeneratorContext): void {
    // Graph 特有方法（基类方法已在 generator_entity_definition.ts 中单独生成）
    const { metadata, rxdbNamedImports } = context;
    const { name: className } = metadata;

    // 添加图查询相关类型
    rxdbNamedImports.add('FindNeighborsOptions');
    rxdbNamedImports.add('FindPathsOptions');
    rxdbNamedImports.add('GraphWhere');
    rxdbNamedImports.add('GraphPath');
    rxdbNamedImports.add('NeighborResult');
    rxdbNamedImports.add('GraphQueryResult');

    // 检查是否启用权重和属性
    const hasWeight = metadata.features?.graph?.weight === true;
    const hasProperties = (metadata.features?.graph?.properties?.length ?? 0) > 0;

    // 确定具体的 EdgeFilterOptions 和 EdgeInfo 类型
    const { edgeFilterTypeName, edgeInfoTypeName, edgePropertiesTypeName } = this.determineEdgeTypes(
      context,
      hasWeight,
      hasProperties
    );

    // 构建类型参数
    const edgeFilterTypeParam =
      edgePropertiesTypeName ? `${edgeFilterTypeName}<${edgePropertiesTypeName}>` : edgeFilterTypeName;

    const edgeInfoTypeParam =
      edgePropertiesTypeName ? `${edgeInfoTypeName}<${edgePropertiesTypeName}>` : edgeInfoTypeName;

    // Promise API 保持兼容，带 $ 的版本进入响应式查询管理器。
    this.addStaticMethod(context, {
      method: 'findNeighbors',
      options: `FindNeighborsOptions<typeof ${className}, GraphWhere<typeof ${className}>, ${edgeFilterTypeParam}>`,
      returnType: `GraphQueryResult<NeighborResult<typeof ${className}, ${edgeInfoTypeParam}>>`,
      metHodDoc: '查找邻居节点（带边信息）',
      optionsIsRequired: true,
      resultWrapper: 'Promise'
    });
    this.addStaticMethod(context, {
      method: 'findNeighbors$',
      options: `FindNeighborsOptions<typeof ${className}, GraphWhere<typeof ${className}>, ${edgeFilterTypeParam}>`,
      returnType: `GraphQueryResult<NeighborResult<typeof ${className}, ${edgeInfoTypeParam}>>`,
      metHodDoc: '响应式查找邻居节点（带边信息）',
      optionsIsRequired: true,
      registerOptions: false
    });

    // countNeighbors 方法
    this.addStaticMethod(context, {
      method: 'countNeighbors',
      options: `FindNeighborsOptions<typeof ${className}, GraphWhere<typeof ${className}>, ${edgeFilterTypeParam}>`,
      returnType: `number`,
      metHodDoc: '统计邻居节点数量（不包含起始节点）',
      optionsIsRequired: true,
      resultWrapper: 'Promise'
    });
    this.addStaticMethod(context, {
      method: 'countNeighbors$',
      options: `FindNeighborsOptions<typeof ${className}, GraphWhere<typeof ${className}>, ${edgeFilterTypeParam}>`,
      returnType: `number`,
      metHodDoc: '响应式统计邻居节点数量（不包含起始节点）',
      optionsIsRequired: true,
      registerOptions: false
    });

    // findPaths 方法
    this.addStaticMethod(context, {
      method: 'findPaths',
      options: `FindPathsOptions<typeof ${className}, GraphWhere<typeof ${className}>, ${edgeFilterTypeParam}>`,
      returnType: `GraphQueryResult<GraphPath<typeof ${className}>>`,
      metHodDoc: '查找两个节点之间的所有路径',
      optionsIsRequired: true,
      resultWrapper: 'Promise'
    });
    this.addStaticMethod(context, {
      method: 'findPaths$',
      options: `FindPathsOptions<typeof ${className}, GraphWhere<typeof ${className}>, ${edgeFilterTypeParam}>`,
      returnType: `GraphQueryResult<GraphPath<typeof ${className}>>`,
      metHodDoc: '响应式查找两个节点之间的路径',
      optionsIsRequired: true,
      registerOptions: false
    });

    // addEdge 和 removeEdge 实例方法
    this.generateEdgeMethods(context, hasWeight, edgePropertiesTypeName);
    this.generateBaseOverloads(context);

    const graphImports = context.namedImportsByModule.get(GRAPH_MODULE) ?? new Set<string>();
    [...GRAPH_IMPORTED_TYPES, edgeFilterTypeName, edgeInfoTypeName].forEach(name => {
      rxdbNamedImports.delete(name);
      graphImports.add(name);
    });
    context.namedImportsByModule.set(GRAPH_MODULE, graphImports);
  }

  private generateBaseOverloads(context: GeneratorContext): void {
    const graphQueryTypeParameters = ['T extends GraphEntityBase', 'U extends EdgeFilterOptions = EdgeFilterOptions'];
    const neighborOptions = 'FindNeighborsOptions<new () => T, GraphWhere<new () => T>, U>';
    const pathOptions = 'FindPathsOptions<new () => T, GraphWhere<new () => T>, U>';
    const neighborResult = 'GraphQueryResult<NeighborResult<new () => T, GraphEdgeInfoType<U>>>';

    [
      { name: 'findNeighbors', options: neighborOptions, returnType: `Promise<${neighborResult}>` },
      { name: 'findNeighbors$', options: neighborOptions, returnType: `Observable<${neighborResult}>` },
      { name: 'countNeighbors', options: neighborOptions, returnType: 'Promise<number>' },
      { name: 'countNeighbors$', options: neighborOptions, returnType: 'Observable<number>' },
      {
        name: 'findPaths',
        options: pathOptions,
        returnType: 'Promise<GraphQueryResult<GraphPath<new () => T>>>'
      },
      {
        name: 'findPaths$',
        options: pathOptions,
        returnType: 'Observable<GraphQueryResult<GraphPath<new () => T>>>'
      }
    ].forEach(method => {
      context.classMethods.push({
        name: method.name,
        returnType: method.returnType,
        parameters: [
          { name: 'this', type: 'new () => T' },
          { name: 'options', type: method.options }
        ],
        typeParameters: graphQueryTypeParameters,
        isStatic: true
      });
    });

    context.classMethods.push(
      {
        name: 'addEdge',
        returnType: 'Promise<void>',
        parameters: [
          { name: 'this', type: 'new () => T' },
          { name: 'from', type: 'T' },
          { name: 'to', type: 'T' },
          { name: 'weight', type: 'number | null', hasQuestionToken: true },
          { name: 'properties', type: 'GraphEdgePropertiesRecord | null', hasQuestionToken: true }
        ],
        typeParameters: ['T extends GraphEntityBase'],
        isStatic: true
      },
      {
        name: 'removeEdge',
        returnType: 'Promise<void>',
        parameters: [
          { name: 'this', type: 'new () => T' },
          { name: 'from', type: 'T' },
          { name: 'to', type: 'T' }
        ],
        typeParameters: ['T extends GraphEntityBase'],
        isStatic: true
      }
    );
  }

  /**
   * 确定边类型名称
   */
  private determineEdgeTypes(
    context: GeneratorContext,
    hasWeight: boolean,
    hasProperties: boolean
  ): {
    edgeFilterTypeName: string;
    edgeInfoTypeName: string;
    edgePropertiesTypeName: string | undefined;
  } {
    const { metadata, file, rxdbNamedImports } = context;
    const { name: className } = metadata;

    const variant: keyof typeof EDGE_TYPE_MAP =
      hasWeight && hasProperties ? 'full'
      : hasWeight ? 'weight'
      : hasProperties ? 'properties'
      : 'basic';
    const { filter: edgeFilterTypeName, info: edgeInfoTypeName } = EDGE_TYPE_MAP[variant];
    rxdbNamedImports.add(edgeFilterTypeName);
    rxdbNamedImports.add(edgeInfoTypeName);

    let edgePropertiesTypeName: string | undefined;

    // 生成边属性类型（如果定义了 properties）
    if (hasProperties) {
      edgePropertiesTypeName = `${className}EdgeProperties`;
      const properties = metadata.features!.graph!.properties!;

      file.addInterface({
        name: edgePropertiesTypeName,
        isExported: true,
        properties: properties.map((prop: KeyValuePropertyMetadata) => ({
          name: prop.name,
          type: PROPERTY_TYPE_MAP[prop.type] ?? 'unknown',
          hasQuestionToken: prop.nullable,
          docs: prop.displayName ? [prop.displayName] : undefined
        })),
        docs: [`${className} 边属性类型（根据元数据自动生成）`]
      });
    }

    return { edgeFilterTypeName, edgeInfoTypeName, edgePropertiesTypeName };
  }

  /**
   * 生成边操作方法（addEdge, removeEdge）
   */
  private generateEdgeMethods(
    context: GeneratorContext,
    hasWeight: boolean,
    edgePropertiesTypeName: string | undefined
  ): void {
    const { metadata } = context;
    const { name: className } = metadata;

    // addEdge 方法
    const addEdgeParameters: Array<{ name: string; type: string; hasQuestionToken?: boolean }> = [
      { name: 'from', type: className },
      { name: 'to', type: className }
    ];
    const addEdgeDocs = ['添加边', '@param from 起始节点', '@param to 目标节点'];

    // weight 槽必须占位。运行时 ABI 固定是 (from, to, weight?, properties?)，静态代理
    // 只做位置透传（entity-manager 的 setRuntimeObjectKey），一旦按特性开关跳过 weight，
    // properties-only 图就会生成 addEdge(from, to, properties?)，属性对象落进 weight 槽（GRAPH-004）。
    // 未启用 weight 时把该槽标成 undefined，让类型系统强制调用方写出真实位置。
    if (hasWeight) {
      addEdgeParameters.push({ name: 'weight', type: 'number | null', hasQuestionToken: true });
      addEdgeDocs.push('@param weight 权重');
    } else if (edgePropertiesTypeName) {
      addEdgeParameters.push({ name: 'weight', type: 'undefined' });
      addEdgeDocs.push('@param weight 该图未启用 weight，固定传 undefined（保持与运行时参数位置一致）');
    }

    if (edgePropertiesTypeName) {
      addEdgeParameters.push({ name: 'properties', type: `${edgePropertiesTypeName} | null`, hasQuestionToken: true });
      addEdgeDocs.push('@param properties 边属性（类型安全）');
    }

    context.classMethods.push({
      name: 'addEdge',
      isStatic: true,
      parameters: addEdgeParameters,
      returnType: 'Promise<void>',
      docs: addEdgeDocs
    });

    // removeEdge 方法
    context.classMethods.push({
      name: 'removeEdge',
      isStatic: true,
      parameters: [
        { name: 'from', type: className },
        { name: 'to', type: className }
      ],
      returnType: 'Promise<void>',
      docs: ['移除边', '@param from 起始节点', '@param to 目标节点']
    });
  }
}
