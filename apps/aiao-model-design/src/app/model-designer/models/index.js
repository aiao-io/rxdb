import { Entity, EntityBase, PropertyType, RelationKind, __decorateClass } from '@aiao/rxdb';
import { TreeAdjacencyListEntityBase } from '@aiao/rxdb-plugin-tree';
let ModelDesign = class extends EntityBase {};
ModelDesign = __decorateClass(
  [
    Entity({
      name: 'ModelDesign',
      displayName: '模型设计',
      properties: [
        {
          name: 'name',
          type: PropertyType.string,
          displayName: '名称',
          columnName: 'name'
        },
        {
          name: 'description',
          type: PropertyType.string,
          nullable: true,
          displayName: '描述',
          columnName: 'description'
        },
        {
          name: 'namespace',
          type: PropertyType.string,
          default: 'public',
          displayName: '命名空间',
          columnName: 'namespace'
        }
      ],
      relations: [
        {
          name: 'entities',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'DesignEntity',
          mappedProperty: 'modelDesign',
          mappedNamespace: 'public',
          onDelete: 'CASCADE',
          onUpdate: 'RESTRICT'
        },
        {
          name: 'chatSessions',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'ChatSession',
          mappedProperty: 'modelDesign',
          mappedNamespace: 'public',
          onDelete: 'CASCADE',
          onUpdate: 'RESTRICT'
        }
      ],
      repository: 'Repository',
      namespace: 'public',
      indexes: [],
      foreignKeys: [],
      checks: [],
      exclusions: [],
      computedProperties: [],
      extends: ['EntityBase'],
      tableName: 'ModelDesign'
    })
  ],
  ModelDesign
);
let DesignRelation = class extends EntityBase {};
DesignRelation = __decorateClass(
  [
    Entity({
      name: 'DesignRelation',
      displayName: '设计关系',
      properties: [
        {
          name: 'name',
          type: PropertyType.string,
          displayName: '关系名',
          columnName: 'name'
        },
        {
          name: 'relationKind',
          type: PropertyType.string,
          displayName: '关系类型',
          columnName: 'relationKind'
        },
        {
          name: 'mappedEntityId',
          type: PropertyType.string,
          nullable: true,
          displayName: '目标实体',
          columnName: 'mappedEntityId'
        },
        {
          name: 'mappedPropertyId',
          type: PropertyType.string,
          nullable: true,
          displayName: '映射属性',
          columnName: 'mappedPropertyId'
        },
        {
          name: 'mappedNamespace',
          type: PropertyType.string,
          nullable: true,
          displayName: '目标命名空间',
          columnName: 'mappedNamespace'
        },
        {
          name: 'columnName',
          type: PropertyType.string,
          nullable: true,
          columnName: 'columnName'
        },
        {
          name: 'displayName',
          type: PropertyType.string,
          nullable: true,
          displayName: '显示名',
          columnName: 'displayName'
        },
        {
          name: 'onDeleteAction',
          type: PropertyType.string,
          nullable: true,
          columnName: 'onDeleteAction'
        },
        {
          name: 'onUpdateAction',
          type: PropertyType.string,
          nullable: true,
          columnName: 'onUpdateAction'
        },
        {
          name: 'sortOrder',
          type: PropertyType.string,
          default: '',
          columnName: 'sortOrder'
        }
      ],
      relations: [
        {
          name: 'designEntity',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'DesignEntity',
          mappedProperty: 'relations',
          onDelete: 'CASCADE',
          mappedNamespace: 'public',
          onUpdate: 'RESTRICT',
          columnName: 'designEntityId'
        }
      ],
      repository: 'Repository',
      namespace: 'public',
      indexes: [],
      foreignKeys: [],
      checks: [],
      exclusions: [],
      computedProperties: [],
      extends: ['EntityBase'],
      tableName: 'DesignRelation'
    })
  ],
  DesignRelation
);
let DesignProperty = class extends TreeAdjacencyListEntityBase {};
DesignProperty = __decorateClass(
  [
    Entity({
      name: 'DesignProperty',
      displayName: '设计属性',
      properties: [
        {
          name: 'name',
          type: PropertyType.string,
          displayName: '属性名',
          columnName: 'name'
        },
        {
          name: 'propertyType',
          type: PropertyType.enum,
          displayName: '类型',
          enum: [
            'uuid',
            'string',
            'enum',
            'number',
            'integer',
            'boolean',
            'date',
            'stringArray',
            'numberArray',
            'keyValue',
            'json'
          ],
          columnName: 'propertyType'
        },
        {
          name: 'columnName',
          type: PropertyType.string,
          nullable: true,
          displayName: '列名',
          columnName: 'columnName'
        },
        {
          name: 'displayName',
          type: PropertyType.string,
          nullable: true,
          displayName: '显示名',
          columnName: 'displayName'
        },
        {
          name: 'isUnique',
          type: PropertyType.boolean,
          default: false,
          columnName: 'isUnique'
        },
        {
          name: 'isNullable',
          type: PropertyType.boolean,
          default: false,
          columnName: 'isNullable'
        },
        {
          name: 'isRequired',
          type: PropertyType.boolean,
          default: false,
          columnName: 'isRequired'
        },
        {
          name: 'isReadonly',
          type: PropertyType.boolean,
          default: false,
          columnName: 'isReadonly'
        },
        {
          name: 'isSortable',
          type: PropertyType.boolean,
          default: false,
          columnName: 'isSortable'
        },
        {
          name: 'defaultValue',
          type: PropertyType.string,
          nullable: true,
          displayName: '默认值',
          columnName: 'defaultValue'
        },
        {
          name: 'enumValues',
          type: PropertyType.stringArray,
          nullable: true,
          displayName: '枚举选项',
          columnName: 'enumValues'
        },
        {
          name: 'sortOrder',
          type: PropertyType.string,
          default: '',
          columnName: 'sortOrder'
        }
      ],
      relations: [
        {
          name: 'designEntity',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'DesignEntity',
          mappedProperty: 'properties',
          onDelete: 'CASCADE',
          mappedNamespace: 'public',
          onUpdate: 'RESTRICT',
          columnName: 'designEntityId'
        }
      ],
      repository: 'TreeRepository',
      namespace: 'public',
      indexes: [],
      foreignKeys: [],
      checks: [],
      exclusions: [],
      computedProperties: [],
      extends: ['TreeAdjacencyListEntityBase', 'EntityBase'],
      tableName: 'DesignProperty',
      features: {
        tree: {
          type: 'adjacency-list',
          hasChildren: true
        }
      }
    })
  ],
  DesignProperty
);
let DesignIndex = class extends EntityBase {};
DesignIndex = __decorateClass(
  [
    Entity({
      name: 'DesignIndex',
      displayName: '设计索引',
      properties: [
        {
          name: 'propertyIds',
          type: PropertyType.stringArray,
          displayName: '属性ID列表',
          columnName: 'propertyIds'
        },
        {
          name: 'isUnique',
          type: PropertyType.boolean,
          default: false,
          displayName: '唯一索引',
          columnName: 'isUnique'
        },
        {
          name: 'displayName',
          type: PropertyType.string,
          nullable: true,
          displayName: '显示名',
          columnName: 'displayName'
        },
        {
          name: 'sortOrder',
          type: PropertyType.string,
          default: '',
          columnName: 'sortOrder'
        }
      ],
      relations: [
        {
          name: 'designEntity',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'DesignEntity',
          mappedProperty: 'indexes',
          onDelete: 'CASCADE',
          mappedNamespace: 'public',
          onUpdate: 'RESTRICT',
          columnName: 'designEntityId'
        }
      ],
      repository: 'Repository',
      namespace: 'public',
      indexes: [],
      foreignKeys: [],
      checks: [],
      exclusions: [],
      computedProperties: [],
      extends: ['EntityBase'],
      tableName: 'DesignIndex'
    })
  ],
  DesignIndex
);
let DesignEntity = class extends EntityBase {};
DesignEntity = __decorateClass(
  [
    Entity({
      name: 'DesignEntity',
      displayName: '设计实体',
      properties: [
        {
          name: 'name',
          type: PropertyType.string,
          displayName: '实体名',
          columnName: 'name'
        },
        {
          name: 'tableName',
          type: PropertyType.string,
          nullable: true,
          displayName: '表名',
          columnName: 'tableName'
        },
        {
          name: 'displayName',
          type: PropertyType.string,
          nullable: true,
          displayName: '显示名',
          columnName: 'displayName'
        },
        {
          name: 'entityNamespace',
          type: PropertyType.string,
          nullable: true,
          displayName: '命名空间',
          columnName: 'entityNamespace'
        },
        {
          name: 'extendsBase',
          type: PropertyType.string,
          default: 'EntityBase',
          displayName: '基类',
          columnName: 'extendsBase'
        },
        {
          name: 'repositoryType',
          type: PropertyType.string,
          default: 'Repository',
          displayName: 'Repository',
          columnName: 'repositoryType'
        },
        {
          name: 'nodeX',
          type: PropertyType.number,
          default: 0,
          columnName: 'nodeX'
        },
        {
          name: 'nodeY',
          type: PropertyType.number,
          default: 0,
          columnName: 'nodeY'
        },
        {
          name: 'nodeWidth',
          type: PropertyType.number,
          default: 240,
          columnName: 'nodeWidth'
        },
        {
          name: 'sortOrder',
          type: PropertyType.string,
          default: '',
          columnName: 'sortOrder'
        }
      ],
      relations: [
        {
          name: 'modelDesign',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'ModelDesign',
          mappedProperty: 'entities',
          onDelete: 'CASCADE',
          mappedNamespace: 'public',
          onUpdate: 'RESTRICT',
          columnName: 'modelDesignId'
        },
        {
          name: 'properties',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'DesignProperty',
          mappedProperty: 'designEntity',
          mappedNamespace: 'public',
          onDelete: 'CASCADE',
          onUpdate: 'RESTRICT'
        },
        {
          name: 'relations',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'DesignRelation',
          mappedProperty: 'designEntity',
          mappedNamespace: 'public',
          onDelete: 'CASCADE',
          onUpdate: 'RESTRICT'
        },
        {
          name: 'indexes',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'DesignIndex',
          mappedProperty: 'designEntity',
          mappedNamespace: 'public',
          onDelete: 'CASCADE',
          onUpdate: 'RESTRICT'
        }
      ],
      repository: 'Repository',
      namespace: 'public',
      indexes: [],
      foreignKeys: [],
      checks: [],
      exclusions: [],
      computedProperties: [],
      extends: ['EntityBase'],
      tableName: 'DesignEntity'
    })
  ],
  DesignEntity
);
let ChatSession = class extends EntityBase {};
ChatSession = __decorateClass(
  [
    Entity({
      name: 'ChatSession',
      displayName: 'AI 会话',
      properties: [
        {
          name: 'name',
          type: PropertyType.string,
          displayName: '会话名称',
          columnName: 'name'
        },
        {
          name: 'contextKind',
          type: PropertyType.enum,
          displayName: '会话场景',
          enum: ['model-designer', 'assistant', 'docs', 'web-llm'],
          default: 'model-designer',
          columnName: 'contextKind'
        },
        {
          name: 'lastUsedAt',
          type: PropertyType.date,
          displayName: '最近使用时间',
          columnName: 'lastUsedAt'
        },
        {
          name: 'createdAt',
          type: PropertyType.date,
          displayName: '创建时间',
          columnName: 'createdAt'
        }
      ],
      relations: [
        {
          name: 'modelDesign',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'ModelDesign',
          mappedProperty: 'chatSessions',
          nullable: true,
          onDelete: 'CASCADE',
          mappedNamespace: 'public',
          onUpdate: 'RESTRICT',
          columnName: 'modelDesignId'
        },
        {
          name: 'messages',
          kind: RelationKind.ONE_TO_MANY,
          mappedEntity: 'ChatMessage',
          mappedProperty: 'chatSession',
          mappedNamespace: 'public',
          onDelete: 'CASCADE',
          onUpdate: 'RESTRICT'
        }
      ],
      repository: 'Repository',
      namespace: 'public',
      indexes: [],
      foreignKeys: [],
      checks: [],
      exclusions: [],
      computedProperties: [],
      extends: ['EntityBase'],
      tableName: 'ChatSession'
    })
  ],
  ChatSession
);
let ChatMessage = class extends EntityBase {};
ChatMessage = __decorateClass(
  [
    Entity({
      name: 'ChatMessage',
      displayName: 'AI 消息',
      properties: [
        {
          name: 'role',
          type: PropertyType.enum,
          displayName: '角色',
          enum: ['user', 'assistant'],
          columnName: 'role'
        },
        {
          name: 'content',
          type: PropertyType.string,
          displayName: '消息内容',
          columnName: 'content'
        },
        {
          name: 'createdAt',
          type: PropertyType.date,
          displayName: '创建时间',
          columnName: 'createdAt'
        }
      ],
      relations: [
        {
          name: 'chatSession',
          kind: RelationKind.MANY_TO_ONE,
          mappedEntity: 'ChatSession',
          mappedProperty: 'messages',
          onDelete: 'CASCADE',
          mappedNamespace: 'public',
          onUpdate: 'RESTRICT',
          columnName: 'chatSessionId'
        }
      ],
      repository: 'Repository',
      namespace: 'public',
      indexes: [],
      foreignKeys: [],
      checks: [],
      exclusions: [],
      computedProperties: [],
      extends: ['EntityBase'],
      tableName: 'ChatMessage'
    })
  ],
  ChatMessage
);
const ENTITIES = [ChatMessage, ChatSession, DesignEntity, DesignIndex, DesignProperty, DesignRelation, ModelDesign];
export { ChatMessage, ChatSession, DesignEntity, DesignIndex, DesignProperty, DesignRelation, ENTITIES, ModelDesign };
