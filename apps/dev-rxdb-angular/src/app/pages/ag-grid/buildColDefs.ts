import { EntityType, getEntityMetadata, PropertyType } from '@aiao/rxdb';
import type { I18n } from '@aiao/rxdb-i18n';
import type { ColDef, ValueFormatterParams } from 'ag-grid-enterprise';

interface GenerateAgGridContext {
  locale: string;
  t: I18n['t'];
}

export const buildColDefs = <T extends EntityType>(EntityType: T, context: GenerateAgGridContext): ColDef<T>[] => {
  const meta = getEntityMetadata(EntityType);
  const dateFormat = new Intl.DateTimeFormat(context.locale, { dateStyle: 'medium', timeStyle: 'medium' });
  const label = (field: string) => context.t(`common.${field}`, undefined, 'rxdb-model');
  const yes = label('yes');
  const no = label('no');
  const columnDefs: ColDef<T>[] = [];
  meta.propertyMap.forEach((prop, key) => {
    // 暂时隐藏
    if (['createdBy', 'updatedBy'].includes(key)) return;

    // ColDef.field 类型是 `keyof T` 的字符串，但 metadata 遍历产出的是 string；
    // 字段命名对齐运行时实体属性，cast 到字面量约束类型。
    let col: ColDef<T> = {
      field: key as ColDef<T>['field'],
      headerName: key === 'createdAt' || key === 'updatedAt' ? label(key) : prop.displayName || key
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
          valueFormatter: ({ value }: ValueFormatterParams<T, Date | string | number>) => {
            if (value == null || value === '') return '';
            const date = new Date(value);
            return Number.isNaN(date.getTime()) ? String(value) : dateFormat.format(date);
          },
          equals: (a: Date, b: Date) => (a && a.getTime()) === (b && b.getTime())
        };
        break;
      case PropertyType.boolean:
        col = {
          ...col,
          filter: 'agSetColumnFilter',
          filterParams: {
            valueFormatter: ({ value }: ValueFormatterParams<T, boolean | number>) =>
              value === true || value === 1 ? yes : no,
            values: [true, false]
          }
        };
        break;
    }
    columnDefs.push(col);
  });
  return columnDefs;
};
