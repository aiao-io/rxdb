import { EntityType, getEntityMetadata, PropertyType } from '@aiao/rxdb';
import type { ColDef, SetFilterValuesFuncParams, ValueFormatterParams } from 'ag-grid-enterprise';

interface GenerateAgGridContext {
  locale: string;
  formatDate: (date: Date | string | number) => string;
}

export const buildColDefs = <T extends EntityType>(EntityType: T, context: GenerateAgGridContext): ColDef<T>[] => {
  const meta = getEntityMetadata(EntityType);
  const columnDefs: ColDef<T>[] = [];
  meta.propertyMap.forEach((prop, key) => {
    // 暂时隐藏
    if (['createdBy', 'updatedBy'].includes(key)) return;

    // ColDef.field 类型是 `keyof T` 的字符串，但 metadata 遍历产出的是 string；
    // 字段命名对齐运行时实体属性，cast 到字面量约束类型。
    let col: ColDef<T> = {
      field: key as ColDef<T>['field'],
      headerName: prop.displayName || key
    };

    switch (prop.type) {
      case PropertyType.string:
        col = {
          ...col,
          filter: 'agTextColumnFilter'
        };
        break;

      case PropertyType.integer:
      case PropertyType.number:
        col = {
          ...col,
          filter: 'agNumberColumnFilter'
        };
        break;
      case PropertyType.date:
        col = {
          ...col,
          filter: 'agDateColumnFilter',
          valueFormatter: params => context.formatDate(params.value) || params.value,
          equals: (a: Date, b: Date) => (a && a.getTime()) === (b && b.getTime())
        };
        break;
      case PropertyType.boolean:
        col = {
          ...col,
          filter: 'agSetColumnFilter',
          filterParams: {
            valueFormatter: (params: ValueFormatterParams) =>
              params.value === true || params.value === 1 ? '是' : '否',
            values: (params: SetFilterValuesFuncParams) => {
              // ag-grid SetFilter 默认泛型 V=string，但 boolean 字段语义就是 boolean；
              // 这里在调用点 cast 跳过约束 — runtime 行为不变（valueFormatter 渲染 "是"/"否"）
              params.success([true, false] as unknown as (string | null)[]);
            }
          }
        };
        break;
    }
    columnDefs.push(col);
  });
  return columnDefs;
};
