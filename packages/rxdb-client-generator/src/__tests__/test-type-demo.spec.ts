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
      "import { BooleanRules, CountOptions, DateRules, ENTITY_STATIC_TYPES, EntityBase, EntityType, FindAllOptions, FindByCursorOptions, FindOneOptions, FindOneOrFailOptions, FindOptions, IEntity, ITreeEntity, KeyValueRules, NumberArrayRules, NumberRules, RelationBooleanRules, RelationDateRules, RelationNumberRules, RelationStringRules, RuleGroupBase, StringArrayRules, StringRules, UUID, UUIDRules } from '@aiao/rxdb';
      import { Observable } from 'rxjs';

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
      | RelationDateRules<'keyValue.date', Date | null>;

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
        |'keyValue.date',
      TypeDemoRule>;

      /**
       * OrderByField
       */
      declare type TypeDemoOrderByField = "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "uuid" | "string" | "number" | "integer" | "boolean" | "date" | "enum" | "stringArray" | "numberArray" | "keyValue" | "json";

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
         * 日期
         */
        date?: Date | null;
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
         * 数字
         */
        number?: number | null;
        /**
         * 数字数组
         */
        numberArray?: number[] | null;
        /**
         * 删除
         */
        remove: () => Promise<this>;
        /**
         * 重置数据
         */
        reset: () => void;
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
