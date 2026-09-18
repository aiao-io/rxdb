import type { OperatorDefinition } from './operator.interface.js';
import type { QueryBuilderRuleGroup, SchemaInfo } from './query-builder-state.js';
/**
 * 查询构建器配置
 */
export interface QueryBuilderConfig<T = Record<string, unknown>> {
  /**
   * Schema 信息
   */
  schema?: SchemaInfo;

  /**
   * 初始查询
   */
  initialQuery?: QueryBuilderRuleGroup<T>;

  /**
   * 最大嵌套层级（默认 5）
   */
  maxNestingLevel?: number;

  /**
   * 自定义操作符
   */
  customOperators?: OperatorDefinition[];

  /**
   * 是否只读模式
   */
  readonly?: boolean;
}
