/**
 * @fileoverview 字段业务语义与级联默认值
 *
 * 本文件只声明"**字段语义标注**"层面的形状：`format` 判别联合、标量类型、
 * 单/多选项展示元数据。本层不引入任何字段元数据接口，仅供 property-types
 * 和 relation-types 在 `format` 字段上引用。
 *
 * @remarks
 * `format` 是纯粹的语义/展示标注：给字段加、改、删 `format` 不改变它的运行时值类型、
 * 持久化列类型或序列化形状。单值/多值的唯一表达方式是选对 {@link PropertyType}
 * 或 {@link RelationKind}，`format` 不参与。
 */

/**
 * 标量类型
 * 定义可以直接存储的基本数据类型
 */
export type RxDBScalar = boolean | number | string | bigint | Date | Uint8Array;

/**
 * 单行纯文本。
 */
export interface PlainTextFormat {
  kind: 'plainText';
}

/** 多行纯文本。 */
export interface MultilineTextFormat {
  kind: 'multilineText';
}

/**
 * 富文本。
 *
 * @remarks
 * 通信格式必须是 `text/markdown` 或 `text/html`；禁止把编辑器私有 JSON 当作公共协议。
 * 本层只做无损透传，不做净化，也不承诺内容安全。
 */
export interface RichTextFormat {
  kind: 'richText';
  contentType: 'text/html' | 'text/markdown';
}

/**
 * URL。
 *
 * @remarks
 * `schemes` 中每项必须匹配 `/^[A-Za-z][A-Za-z0-9+.-]*$/`（不带冒号）。
 */
export interface UrlFormat {
  kind: 'url';
  schemes?: readonly string[];
}

/** 邮箱地址。 */
export interface EmailFormat {
  kind: 'email';
}

/** 电话号码。 */
export interface PhoneFormat {
  kind: 'phone';
}

/** 源代码。`language` 非空时原样透传，不校验语言是否存在。 */
export interface CodeFormat {
  kind: 'code';
  language?: string;
}

/** 颜色。 */
export interface ColorFormat {
  kind: 'color';
  colorSpace?: 'hex' | 'hsl' | 'hsv' | 'lab' | 'lch' | 'rgb';
}

/** 普通数字。 */
export interface NumberFormat {
  kind: 'number';
  min?: number;
  max?: number;
  step?: number;
}

/** 货币。`currency` 只校验 ISO 4217 的代码形状 `/^[A-Z]{3}$/`，不内置货币分配表。 */
export interface CurrencyFormat {
  kind: 'currency';
  currency: string;
  min?: number;
  max?: number;
  step?: number;
}

/** 百分比。`scale` 决定固有值域：`0..1` 为 `[0, 1]`，`0..100` 为 `[0, 100]`。 */
export interface PercentageFormat {
  kind: 'percentage';
  scale: '0..1' | '0..100';
  min?: number;
  max?: number;
  step?: number;
}

/** 评分。要求 `min < max` 且 `(max - min) / step` 为整数，保证两个端点都可选。 */
export interface RatingFormat {
  kind: 'rating';
  min: number;
  max: number;
  step: number;
}

/** 时长。必须声明单位。 */
export interface DurationFormat {
  kind: 'duration';
  unit: 'd' | 'h' | 'min' | 'ms' | 's';
  min?: number;
  max?: number;
  step?: number;
}

/** 日期时间。`timezone` 是 opaque hint，本层不验证 IANA 数据库。 */
export interface DateTimeFormat {
  kind: 'dateTime';
  timezone?: string;
  display?: 'date' | 'datetime' | 'time';
}

/** 单项选择。载体是 {@link EnumProperty}，选项集合由其 `enum` 决定。 */
export interface SingleSelectFormat {
  kind: 'singleSelect';
}

/** 多项选择。载体是 {@link StringArrayProperty}，此时其 `enum` 必填。 */
export interface MultiSelectFormat {
  kind: 'multiSelect';
}

/**
 * 字段业务语义与默认渲染方式的判别联合。
 *
 * @remarks
 * 只声明在具体属性接口上；四种关系接口一律不接受 `format`。
 */
export type FieldFormat =
  | ColorFormat
  | CodeFormat
  | CurrencyFormat
  | DateTimeFormat
  | DurationFormat
  | EmailFormat
  | MultilineTextFormat
  | MultiSelectFormat
  | NumberFormat
  | PercentageFormat
  | PhoneFormat
  | PlainTextFormat
  | RatingFormat
  | RichTextFormat
  | SingleSelectFormat
  | UrlFormat;

/**
 * 单个枚举选项的展示元数据。
 *
 * @remarks
 * 选项值的唯一真相源是 `enum` 数组，本接口只承载展示信息：删除、禁用或重命名 `label`
 * 都不能破坏已有数据。`disabled` 只影响展示，不改变枚举合法性。
 */
export interface FieldOptionDisplay {
  label?: string;
  color?: string;
  disabled?: boolean;
}

/**
 * 按枚举值索引的展示元数据。键必须是 `enum` 的子集。
 */
export type FieldOptions = Readonly<Record<string, FieldOptionDisplay>>;
