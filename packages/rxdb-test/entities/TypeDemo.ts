import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * 类型演示实体：覆盖全部 PropertyType 与全部 `format` 语义。
 *
 * @remarks
 * `format` 是纯展示/校验标注，不改变持久化列类型，因此本实体对所有 adapter
 * （含 Supabase remote）都合法。`bigint` / `binary` 两个本地专用类型见
 * {@link ./TypeDemoNative.ts}，Supabase remote 不支持它们，故单独成实体。
 */
@Entity({
  name: 'TypeDemo',
  tableName: 'type_demo',
  properties: [
    { displayName: 'UUID', name: 'uuid', type: PropertyType.uuid, nullable: true },
    { displayName: '字符串', name: 'string', type: PropertyType.string, nullable: true },
    { displayName: '数字', name: 'number', type: PropertyType.number, nullable: true },
    { displayName: '整数', name: 'integer', type: PropertyType.integer, nullable: true },
    { displayName: '布尔值', name: 'boolean', type: PropertyType.boolean, nullable: true },
    { displayName: '日期', name: 'date', type: PropertyType.date, nullable: true },
    {
      displayName: '枚举',
      name: 'enum',
      type: PropertyType.enum,
      enum: ['active', 'inactive', 'pending'],
      format: { kind: 'singleSelect' },
      options: {
        active: { label: '激活', color: '#22c55e' },
        inactive: { label: '停用', color: '#9ca3af' },
        pending: { label: '待定', disabled: true }
      },
      nullable: true
    },
    {
      displayName: '字符串数组',
      name: 'stringArray',
      columnName: 'string_array',
      type: PropertyType.stringArray,
      nullable: true
    },
    {
      displayName: '数字数组',
      name: 'numberArray',
      columnName: 'number_array',
      type: PropertyType.numberArray,
      nullable: true
    },
    {
      name: 'keyValue',
      columnName: 'key_value',
      type: PropertyType.keyValue,
      displayName: '键值对',
      nullable: true,
      properties: [
        { displayName: '字符串', name: 'string', type: PropertyType.string, nullable: true },
        { displayName: '数字', name: 'number', type: PropertyType.number, nullable: true },
        { displayName: '整数', name: 'integer', type: PropertyType.integer, nullable: true },
        { displayName: '布尔值', name: 'boolean', type: PropertyType.boolean, nullable: true },
        { displayName: '日期', name: 'date', type: PropertyType.date, nullable: true }
      ]
    },
    { displayName: 'JSON', name: 'json', type: PropertyType.json, nullable: true },
    // ── 字符串 format 语义 ──────────────────────────────────────────────
    {
      displayName: '多行文本',
      name: 'multilineText',
      type: PropertyType.string,
      nullable: true,
      format: { kind: 'multilineText' }
    },
    {
      displayName: '富文本',
      name: 'richText',
      type: PropertyType.string,
      nullable: true,
      format: { kind: 'richText', contentType: 'text/markdown' }
    },
    {
      displayName: '链接',
      name: 'url',
      type: PropertyType.string,
      nullable: true,
      format: { kind: 'url', schemes: ['HTTP', 'HTTPS'] }
    },
    { displayName: '邮箱', name: 'email', type: PropertyType.string, nullable: true, format: { kind: 'email' } },
    { displayName: '电话', name: 'phone', type: PropertyType.string, nullable: true, format: { kind: 'phone' } },
    {
      displayName: '代码',
      name: 'code',
      type: PropertyType.string,
      nullable: true,
      format: { kind: 'code', language: 'typescript' }
    },
    {
      displayName: '颜色',
      name: 'color',
      type: PropertyType.string,
      nullable: true,
      format: { kind: 'color', colorSpace: 'hex' }
    },
    // ── 数字 format 语义 ──────────────────────────────────────────────
    {
      displayName: '货币',
      name: 'currency',
      type: PropertyType.number,
      nullable: true,
      format: { kind: 'currency', currency: 'CNY' }
    },
    {
      displayName: '百分比',
      name: 'percentage',
      type: PropertyType.number,
      nullable: true,
      format: { kind: 'percentage', scale: '0..1' }
    },
    {
      displayName: '评分',
      name: 'rating',
      type: PropertyType.number,
      nullable: true,
      format: { kind: 'rating', min: 1, max: 5, step: 0.5 }
    },
    {
      displayName: '时长',
      name: 'duration',
      type: PropertyType.integer,
      nullable: true,
      format: { kind: 'duration', unit: 's' }
    },
    // ── 日期 format 语义 ──────────────────────────────────────────────
    {
      displayName: '日期（仅日期）',
      name: 'dateOnly',
      type: PropertyType.date,
      nullable: true,
      format: { kind: 'dateTime', display: 'date' }
    },
    {
      displayName: '时间（仅时间）',
      name: 'timeOnly',
      type: PropertyType.date,
      nullable: true,
      format: { kind: 'dateTime', display: 'time' }
    },
    // ── 数组 format 语义 ──────────────────────────────────────────────
    {
      displayName: '多选标签',
      name: 'tags',
      type: PropertyType.stringArray,
      enum: ['alpha', 'beta', 'gamma'],
      format: { kind: 'multiSelect' },
      options: {
        alpha: { label: '甲', color: '#112233' },
        beta: { label: '乙' }
      },
      nullable: true
    }
  ]
})
export class TypeDemo extends EntityBase {}
