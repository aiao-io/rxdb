/**
 * RxDB 查询输出格式（对齐 Angular 侧 `RxDBQueryOutput`）。
 */
export interface RxDBQueryOutput<T> {
  combinator: 'and' | 'or';
  rules: Array<RxDBQueryOutput<T> | { field: keyof T & string; operator: string; value: unknown }>;
}
