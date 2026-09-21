import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import analyze_file from '../cli/analyze-file.js';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('RxDBClientGenerator', () => {
  it('TypeDemo', { timeout: 120000 }, () => {
    const file = join(__dirname, '../../../..', 'packages/rxdb-test/entities/TypeDemo.ts');

    const result = analyze_file(file);
    const { metadataOptions, extendMetadataOptions } = result[0];
    const generator = new RxDBClientGenerator({
      relationQueryDeep: 10
    });
    generator.addEntity(metadataOptions, extendMetadataOptions);
    generator.exec();
    const files = generator.getSourceFiles();
    const indexJSFile = files.find(f => f.getFilePath() === 'index.js');
    expect(indexJSFile?.getText()).toMatchInlineSnapshot(`
      "import { Entity, EntityBase, PropertyType, __decorateClass } from '@aiao/rxdb';
      let TypeDemo = class extends EntityBase {};
      TypeDemo = __decorateClass(
      [
        Entity({
        name: "TypeDemo",
        tableName: "type_demo",
        properties: [
          {
            displayName: "UUID",
            name: "uuid",
            type: PropertyType.uuid,
            nullable: true,
            columnName: "uuid"
          },
          {
            displayName: "字符串",
            name: "string",
            type: PropertyType.string,
            nullable: true,
            columnName: "string"
          },
          {
            displayName: "数字",
            name: "number",
            type: PropertyType.number,
            nullable: true,
            columnName: "number"
          },
          {
            displayName: "整数",
            name: "integer",
            type: PropertyType.integer,
            nullable: true,
            columnName: "integer"
          },
          {
            displayName: "布尔值",
            name: "boolean",
            type: PropertyType.boolean,
            nullable: true,
            columnName: "boolean"
          },
          {
            displayName: "日期",
            name: "date",
            type: PropertyType.date,
            nullable: true,
            columnName: "date"
          },
          {
            displayName: "枚举",
            name: "enum",
            type: PropertyType.enum,
            enum: [
              "active",
              "inactive",
              "pending"
            ],
            format: {
              kind: "singleSelect"
            },
            options: {
              active: {
                label: "激活",
                color: "#22c55e"
              },
              inactive: {
                label: "停用",
                color: "#9ca3af"
              },
              pending: {
                label: "待定",
                disabled: true
              }
            },
            nullable: true,
            columnName: "enum"
          },
          {
            displayName: "字符串数组",
            name: "stringArray",
            columnName: "string_array",
            type: PropertyType.stringArray,
            nullable: true
          },
          {
            displayName: "数字数组",
            name: "numberArray",
            columnName: "number_array",
            type: PropertyType.numberArray,
            nullable: true
          },
          {
            name: "keyValue",
            columnName: "key_value",
            type: PropertyType.keyValue,
            displayName: "键值对",
            nullable: true,
            properties: [
              {
                displayName: "字符串",
                name: "string",
                type: PropertyType.string,
                nullable: true
              },
              {
                displayName: "数字",
                name: "number",
                type: PropertyType.number,
                nullable: true
              },
              {
                displayName: "整数",
                name: "integer",
                type: PropertyType.integer,
                nullable: true
              },
              {
                displayName: "布尔值",
                name: "boolean",
                type: PropertyType.boolean,
                nullable: true
              },
              {
                displayName: "日期",
                name: "date",
                type: PropertyType.date,
                nullable: true
              }
            ]
          },
          {
            displayName: "JSON",
            name: "json",
            type: PropertyType.json,
            nullable: true,
            columnName: "json"
          },
          {
            displayName: "多行文本",
            name: "multilineText",
            type: PropertyType.string,
            nullable: true,
            format: {
              kind: "multilineText"
            },
            columnName: "multilineText"
          },
          {
            displayName: "富文本",
            name: "richText",
            type: PropertyType.string,
            nullable: true,
            format: {
              kind: "richText",
              contentType: "text/markdown"
            },
            columnName: "richText"
          },
          {
            displayName: "链接",
            name: "url",
            type: PropertyType.string,
            nullable: true,
            format: {
              kind: "url",
              schemes: [
                "HTTP",
                "HTTPS"
              ]
            },
            columnName: "url"
          },
          {
            displayName: "邮箱",
            name: "email",
            type: PropertyType.string,
            nullable: true,
            format: {
              kind: "email"
            },
            columnName: "email"
          },
          {
            displayName: "电话",
            name: "phone",
            type: PropertyType.string,
            nullable: true,
            format: {
              kind: "phone"
            },
            columnName: "phone"
          },
          {
            displayName: "代码",
            name: "code",
            type: PropertyType.string,
            nullable: true,
            format: {
              kind: "code",
              language: "typescript"
            },
            columnName: "code"
          },
          {
            displayName: "颜色",
            name: "color",
            type: PropertyType.string,
            nullable: true,
            format: {
              kind: "color",
              colorSpace: "hex"
            },
            columnName: "color"
          },
          {
            displayName: "货币",
            name: "currency",
            type: PropertyType.number,
            nullable: true,
            format: {
              kind: "currency",
              currency: "CNY"
            },
            columnName: "currency"
          },
          {
            displayName: "百分比",
            name: "percentage",
            type: PropertyType.number,
            nullable: true,
            format: {
              kind: "percentage",
              scale: "0..1"
            },
            columnName: "percentage"
          },
          {
            displayName: "评分",
            name: "rating",
            type: PropertyType.number,
            nullable: true,
            format: {
              kind: "rating",
              min: 1,
              max: 5,
              step: 0.5
            },
            columnName: "rating"
          },
          {
            displayName: "时长",
            name: "duration",
            type: PropertyType.integer,
            nullable: true,
            format: {
              kind: "duration",
              unit: "s"
            },
            columnName: "duration"
          },
          {
            displayName: "日期（仅日期）",
            name: "dateOnly",
            type: PropertyType.date,
            nullable: true,
            format: {
              kind: "dateTime",
              display: "date"
            },
            columnName: "dateOnly"
          },
          {
            displayName: "时间（仅时间）",
            name: "timeOnly",
            type: PropertyType.date,
            nullable: true,
            format: {
              kind: "dateTime",
              display: "time"
            },
            columnName: "timeOnly"
          },
          {
            displayName: "多选标签",
            name: "tags",
            type: PropertyType.stringArray,
            enum: [
              "alpha",
              "beta",
              "gamma"
            ],
            format: {
              kind: "multiSelect"
            },
            options: {
              alpha: {
                label: "甲",
                color: "#112233"
              },
              beta: {
                label: "乙"
              }
            },
            nullable: true,
            columnName: "tags"
          }
        ],
        repository: "Repository",
        namespace: "public",
        relations: [],
        indexes: [],
        foreignKeys: [],
        computedProperties: [],
        extends: [
          "EntityBase"
        ],
        displayName: "TypeDemo"
      })
      ],
      TypeDemo
      );
      const ENTITIES = [ TypeDemo ];
      export { ENTITIES, TypeDemo };"
    `);

    const indexTsFile = files.find(f => f.getFilePath() === 'index.d.ts');
    expect(indexTsFile?.getText()).toMatchInlineSnapshot(`
      "import type { BooleanRules, CountOptions, DateRules, ENTITY_STATIC_TYPES, EntityBase, EntityType, FindAllOptions, FindByCursorOptions, FindOneOptions, FindOneOrFailOptions, FindOptions, IEntity, KeyValueRules, NumberArrayRules, NumberRules, RelationBooleanRules, RelationDateRules, RelationNumberRules, RelationStringRules, RuleGroupBase, StringArrayRules, StringRules, UUID, UUIDRules } from '@aiao/rxdb';
      import type { Observable } from 'rxjs';

      /**
       * rule
       */
      declare type TypeDemoRule = UUIDRules<TypeDemo, 'id'>
      | DateRules<TypeDemo, 'createdAt'>
      | DateRules<TypeDemo, 'updatedAt'>
      | StringRules<TypeDemo, 'createdBy'>
      | StringRules<TypeDemo, 'updatedBy'>
      | UUIDRules<TypeDemo, 'uuid'>
      | StringRules<TypeDemo, 'string'>
      | NumberRules<TypeDemo, 'number'>
      | NumberRules<TypeDemo, 'integer'>
      | BooleanRules<TypeDemo, 'boolean'>
      | DateRules<TypeDemo, 'date'>
      | StringRules<TypeDemo, 'enum'>
      | StringArrayRules<TypeDemo, 'stringArray', string>
      | NumberArrayRules<TypeDemo, 'numberArray', number>
      | KeyValueRules<TypeDemo, 'keyValue', Partial<TypeDemoKeyValueKeyValue>>
      | RelationStringRules<'keyValue.string', string | null>
      | RelationNumberRules<'keyValue.number', number | null>
      | RelationNumberRules<'keyValue.integer', number | null>
      | RelationBooleanRules<'keyValue.boolean', boolean | null>
      | RelationDateRules<'keyValue.date', Date | null>
      | StringRules<TypeDemo, 'multilineText'>
      | StringRules<TypeDemo, 'richText'>
      | StringRules<TypeDemo, 'url'>
      | StringRules<TypeDemo, 'email'>
      | StringRules<TypeDemo, 'phone'>
      | StringRules<TypeDemo, 'code'>
      | StringRules<TypeDemo, 'color'>
      | NumberRules<TypeDemo, 'currency'>
      | NumberRules<TypeDemo, 'percentage'>
      | NumberRules<TypeDemo, 'rating'>
      | NumberRules<TypeDemo, 'duration'>
      | DateRules<TypeDemo, 'dateOnly'>
      | DateRules<TypeDemo, 'timeOnly'>
      | StringArrayRules<TypeDemo, 'tags', string>;

      /**
       * RuleGroupBase
       */
      export declare type TypeDemoRuleGroup = RuleGroupBase<typeof TypeDemo,
        |'id'
        |'createdAt'
        |'updatedAt'
        |'createdBy'
        |'updatedBy'
        |'uuid'
        |'string'
        |'number'
        |'integer'
        |'boolean'
        |'date'
        |'enum'
        |'stringArray'
        |'numberArray'
        |'keyValue'
        |'keyValue.string'
        |'keyValue.number'
        |'keyValue.integer'
        |'keyValue.boolean'
        |'keyValue.date'
        |'multilineText'
        |'richText'
        |'url'
        |'email'
        |'phone'
        |'code'
        |'color'
        |'currency'
        |'percentage'
        |'rating'
        |'duration'
        |'dateOnly'
        |'timeOnly'
        |'tags',
      TypeDemoRule>;

      /**
       * OrderByField
       */
      declare type TypeDemoOrderByField = "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "uuid" | "string" | "number" | "integer" | "boolean" | "date" | "enum" | "stringArray" | "numberArray" | "keyValue" | "json" | "multilineText" | "richText" | "url" | "email" | "phone" | "code" | "color" | "currency" | "percentage" | "rating" | "duration" | "dateOnly" | "timeOnly" | "tags";

      /**
       * rxdb
       */
      declare module "@aiao/rxdb" {
        /**
         * RxDB
         */
        interface RxDB {
          /**
           * TypeDemo
           */
          TypeDemo: typeof TypeDemo;
        }
      }

      /**
       * 静态类型
       */
      export interface TypeDemoStaticTypes {
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
        findOneOrFailOptions: FindOneOrFailOptions<typeof TypeDemo,TypeDemoRuleGroup,TypeDemoOrderByField>;
        /**
         * 查询选项
         */
        findOptions: FindOptions<typeof TypeDemo,TypeDemoRuleGroup,TypeDemoOrderByField>;
        /**
         * 查询选项
         */
        findOneOptions: FindOneOptions<typeof TypeDemo,TypeDemoRuleGroup,TypeDemoOrderByField>;
        /**
         * 查询选项
         */
        findAllOptions: FindAllOptions<typeof TypeDemo,TypeDemoRuleGroup,TypeDemoOrderByField>;
        /**
         * 查询选项
         */
        findByCursorOptions: FindByCursorOptions<typeof TypeDemo,TypeDemoRuleGroup,TypeDemoOrderByField>;
        /**
         * 查询选项
         */
        countOptions: CountOptions<typeof TypeDemo,TypeDemoRuleGroup>;
      }

      /**
       * 初始化数据
       */
      export interface TypeDemoInitData {
        /**
         * UUID
         */
        uuid?: UUID | null;
        /**
         * 字符串
         */
        string?: string | null;
        /**
         * 数字
         */
        number?: number | null;
        /**
         * 整数
         */
        integer?: number | null;
        /**
         * 布尔值
         */
        boolean?: boolean | null;
        /**
         * 日期
         */
        date?: Date | null;
        /**
         * 枚举
         */
        enum?: "active" | "inactive" | "pending" | null;
        /**
         * 字符串数组
         */
        stringArray?: string[] | null;
        /**
         * 数字数组
         */
        numberArray?: number[] | null;
        /**
         * 键值对
         */
        keyValue?: TypeDemoKeyValueKeyValue | null;
        /**
         * JSON
         */
        json?: Record<string, unknown> | null;
        /**
         * 多行文本
         */
        multilineText?: string | null;
        /**
         * 富文本
         */
        richText?: string | null;
        /**
         * 链接
         */
        url?: string | null;
        /**
         * 邮箱
         */
        email?: string | null;
        /**
         * 电话
         */
        phone?: string | null;
        /**
         * 代码
         */
        code?: string | null;
        /**
         * 颜色
         */
        color?: string | null;
        /**
         * 货币
         */
        currency?: number | null;
        /**
         * 百分比
         */
        percentage?: number | null;
        /**
         * 评分
         */
        rating?: number | null;
        /**
         * 时长
         */
        duration?: number | null;
        /**
         * 日期（仅日期）
         */
        dateOnly?: Date | null;
        /**
         * 时间（仅时间）
         */
        timeOnly?: Date | null;
        /**
         * 多选标签
         */
        tags?: string[] | null;
      }

      /**
       * 键值对
       */
      export interface TypeDemoKeyValueKeyValue {
        /**
         * 字符串
         */
        string?: string | null;
        /**
         * 数字
         */
        number?: number | null;
        /**
         * 整数
         */
        integer?: number | null;
        /**
         * 布尔值
         */
        boolean?: boolean | null;
        /**
         * 日期
         */
        date?: Date | null;
      }

      /**
       * TypeDemo
       */
      export declare class TypeDemo extends EntityBase implements IEntity {
        static [ENTITY_STATIC_TYPES]: TypeDemoStaticTypes;
        /**
         * 布尔值
         */
        boolean?: boolean | null;
        /**
         * 代码
         */
        code?: string | null;
        /**
         * 颜色
         */
        color?: string | null;
        /**
         * 货币
         */
        currency?: number | null;
        /**
         * 日期
         */
        date?: Date | null;
        /**
         * 日期（仅日期）
         */
        dateOnly?: Date | null;
        /**
         * 时长
         */
        duration?: number | null;
        /**
         * 邮箱
         */
        email?: string | null;
        /**
         * 枚举
         */
        enum?: "active" | "inactive" | "pending" | null;
        /**
         * 整数
         */
        integer?: number | null;
        /**
         * JSON
         */
        json?: Record<string, unknown> | null;
        /**
         * 键值对
         */
        keyValue?: TypeDemoKeyValueKeyValue | null;
        /**
         * 多行文本
         */
        multilineText?: string | null;
        /**
         * 数字
         */
        number?: number | null;
        /**
         * 数字数组
         */
        numberArray?: number[] | null;
        /**
         * 百分比
         */
        percentage?: number | null;
        /**
         * 电话
         */
        phone?: string | null;
        /**
         * 评分
         */
        rating?: number | null;
        /**
         * 删除
         */
        remove: () => Promise<this>;
        /**
         * 重置数据
         */
        reset: () => void;
        /**
         * 富文本
         */
        richText?: string | null;
        /**
         * 保存
         */
        save: () => Promise<this>;
        /**
         * 字符串
         */
        string?: string | null;
        /**
         * 字符串数组
         */
        stringArray?: string[] | null;
        /**
         * 多选标签
         */
        tags?: string[] | null;
        /**
         * 时间（仅时间）
         */
        timeOnly?: Date | null;
        /**
         * 链接
         */
        url?: string | null;
        /**
         * UUID
         */
        uuid?: UUID | null;
        /**
         * 初始化数据
         * @param initData 初始化数据
         */
        constructor(initData?: TypeDemoInitData);
        /**
         * 统计实体数量
         * @param options 查询选项
         * @example
         * TypeDemo.count({ where: { combinator: 'and', rules: [] } }).subscribe(total => console.log(total));
         */
        static count(options: CountOptions<typeof TypeDemo,TypeDemoRuleGroup>): Observable<number>;
        static count<T extends EntityBase>(this: new () => T, options: CountOptions<new () => T>): Observable<number>;
        /**
         * 查询多个实体
         * @param options 查询选项
         * @example
         * TypeDemo.find({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
         */
        static find(options: FindOptions<typeof TypeDemo,TypeDemoRuleGroup,TypeDemoOrderByField>): Observable<TypeDemo[]>;
        static find<T extends EntityBase>(this: new () => T, options: FindOptions<new () => T>): Observable<T[]>;
        /**
         * 查询所有实体
         * @param options 查询选项
         * @example
         * TypeDemo.findAll({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
         */
        static findAll(options: FindAllOptions<typeof TypeDemo,TypeDemoRuleGroup,TypeDemoOrderByField>): Observable<TypeDemo[]>;
        static findAll<T extends EntityBase>(this: new () => T, options: FindAllOptions<new () => T>): Observable<T[]>;
        /**
         * 游标分页查询
         * @param options 查询选项
         * @example
         * TypeDemo.findByCursor({ where: { combinator: 'and', rules: [] } }).subscribe(list => console.log(list));
         */
        static findByCursor(options: FindByCursorOptions<typeof TypeDemo,TypeDemoRuleGroup,TypeDemoOrderByField>): Observable<TypeDemo[]>;
        static findByCursor<T extends EntityBase>(this: new () => T, options: FindByCursorOptions<new () => T>): Observable<T[]>;
        /**
         * 查询单个实体,未找到时返回 null
         * @param options 查询选项
         * @example
         * TypeDemo.findOne({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
         */
        static findOne(options: FindOneOptions<typeof TypeDemo,TypeDemoRuleGroup,TypeDemoOrderByField>): Observable<TypeDemo | null>;
        static findOne<T extends EntityBase>(this: new () => T, options: FindOneOptions<new () => T>): Observable<T | null>;
        /**
         * 查询单个实体,未找到时抛出错误
         * @param options 查询选项
         * @example
         * TypeDemo.findOneOrFail({ where: { combinator: 'and', rules: [] } }).subscribe(entity => console.log(entity));
         */
        static findOneOrFail(options: FindOneOrFailOptions<typeof TypeDemo,TypeDemoRuleGroup,TypeDemoOrderByField>): Observable<TypeDemo>;
        static findOneOrFail<T extends EntityBase>(this: new () => T, options: FindOneOrFailOptions<new () => T>): Observable<T>;
        /**
         * 根据 ID 获取单个实体
         * @param options 查询选项
         * @example
         * TypeDemo.get('123').subscribe(entity => console.log(entity));
         */
        static get(options: UUID): Observable<TypeDemo>;
        static get<T extends EntityBase>(this: new () => T, id: UUID): Observable<T>;
      }

      export declare const ENTITIES: EntityType[];

      "
    `);
  });
});
