import { EntityType, getEntityMetadata, PropertyType } from '@aiao/rxdb';
import type { ColDef, GridApi, SetFilterValuesFuncParams, ValueFormatterParams } from 'ag-grid-enterprise';

/**
 * 应用增量 Grid 更新
 */
export function applyIncrementalGridUpdate<T extends { id: string }>(
  gridApi: GridApi,
  newData: T[],
  fingerprintMap: Map<string, string>,
  getFingerprintFn: (item: T) => string
): void {
  const add: T[] = [];
  const update: T[] = [];
  const newFingerprintMap = new Map<string, string>();

  // 计算 add/update
  for (const item of newData) {
    const fingerprint = getFingerprintFn(item);
    newFingerprintMap.set(item.id, fingerprint);

    const oldFingerprint = fingerprintMap.get(item.id);
    if (!oldFingerprint) {
      add.push(item);
    } else if (oldFingerprint !== fingerprint) {
      update.push(item);
    }
  }

  // 计算 remove
  const remove: T[] = [];
  for (const [id] of fingerprintMap) {
    if (!newFingerprintMap.has(id)) {
      remove.push({ id } as T);
    }
  }

  // 应用事务
  gridApi.applyTransaction({ add, update, remove });

  // 更新指纹映射表（原地修改）
  fingerprintMap.clear();
  newFingerprintMap.forEach((fingerprint, id) => {
    fingerprintMap.set(id, fingerprint);
  });
}

interface GenerateAgGridContext {
  locale: string;
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
          valueFormatter: params => {
            if (!params.value) return '';
            try {
              return new Intl.DateTimeFormat(context.locale, {
                dateStyle: 'medium',
                timeStyle: 'medium'
              }).format(new Date(params.value));
            } catch {
              return params.value;
            }
          },
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
