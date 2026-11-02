import { getDefaultOperatorRegistry, type FieldMetadata } from '@aiao/rxdb-model/headless';

const registry = getDefaultOperatorRegistry();

/** 本页只渲染单值 / 无值操作符；区间、数组、子查询操作符交给有需要的消费方自己的控件。 */
export const operatorsFor = (field: FieldMetadata | undefined) =>
  field ?
    registry.getForField(field).filter(operator => operator.valueType === 'single' || operator.valueType === 'none')
  : [];
