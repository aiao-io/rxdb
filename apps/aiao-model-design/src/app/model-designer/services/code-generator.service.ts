import type { DesignEntity, DesignIndex, DesignProperty, DesignRelation } from '../models/index.js';
import {
  type EntityIndexMetadataOptions,
  type EntityMetadataOptions,
  type EntityPropertyMetadataOptions,
  type EntityRelationMetadataOptions,
  type KeyValuePropertyMetadata,
  type OnDeleteAction,
  type OnUpdateAction,
  type PropertyType,
  type RelationKind
} from '@aiao/rxdb';
import { RxDBClientGenerator } from '@aiao/rxdb-client-generator';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { zipSync } from 'fflate';
import type { GeneratedFile, GenerateResult } from '../interfaces/designer.interface';
import type { ClientDesignContract } from './client-package-adapter';
import { compareSortOrder } from './entity-utils';

/**
 * 代码生成服务
 *
 * 将模型设计转换为 TypeScript 实体代码，支持下载 ZIP 包。
 */
@Injectable()
export class CodeGeneratorService {
  readonly #document = inject(DOCUMENT);
  readonly #platformId = inject(PLATFORM_ID);

  /** 将单个实体及其属性、关系、索引转换为元数据选项 */
  toMetadataOptions(
    entity: DesignEntity,
    properties: DesignProperty[],
    relations: DesignRelation[],
    indexes: DesignIndex[],
    allEntities: DesignEntity[],
    childPropertiesMap?: Map<string, DesignProperty[]>
  ): EntityMetadataOptions {
    const name = this.#toPascalCase(entity.name);
    const namespace = entity.entityNamespace ? this.#toLowerCase(entity.entityNamespace) : undefined;
    return {
      name,
      tableName: entity.tableName ?? undefined,
      displayName: entity.displayName ?? undefined,
      namespace,
      extends: [entity.extendsBase],
      repository: entity.repositoryType,
      properties: properties.sort(compareSortOrder).map(p => this.#propertyToMetadata(p, childPropertiesMap)),
      relations: relations.sort(compareSortOrder).map(r => this.#relationToMetadata(r, allEntities)),
      indexes: indexes.sort(compareSortOrder).map(i => this.#indexToMetadata(i, properties))
    };
  }

  /** 批量将所有实体转换为元数据选项 */
  toAllMetadataOptions(
    entities: DesignEntity[],
    propertiesMap: Map<string, DesignProperty[]>,
    relationsMap: Map<string, DesignRelation[]>,
    indexesMap: Map<string, DesignIndex[]>,
    childPropertiesMap?: Map<string, DesignProperty[]>
  ): EntityMetadataOptions[] {
    return entities.map(entity =>
      this.toMetadataOptions(
        entity,
        propertiesMap.get(entity.id) ?? [],
        relationsMap.get(entity.id) ?? [],
        indexesMap.get(entity.id) ?? [],
        entities,
        childPropertiesMap
      )
    );
  }

  /** 将当前设计转换为客户端包 revision 使用的稳定契约。 */
  toClientDesignContract(
    entities: DesignEntity[],
    propertiesMap: Map<string, DesignProperty[]>,
    relationsMap: Map<string, DesignRelation[]>,
    metadata: Record<string, string>
  ): ClientDesignContract {
    return {
      entities: entities.map(entity => ({
        name: this.#toPascalCase(entity.name),
        ...(entity.entityNamespace ? { namespace: this.#toLowerCase(entity.entityNamespace) } : {}),
        ...(entity.tableName ? { tableName: entity.tableName } : {}),
        properties: (propertiesMap.get(entity.id) ?? []).map(property => ({
          name: this.#toCamelCase(property.name),
          ...(property.columnName ? { columnName: property.columnName } : {}),
          type: property.propertyType,
          ...(property.isRequired ? { required: true } : {}),
          ...(property.isNullable ? { nullable: true } : {}),
          ...(property.isUnique ? { unique: true } : {})
        })),
        relations: (relationsMap.get(entity.id) ?? []).map(relation => ({
          name: this.#toCamelCase(relation.name),
          kind: relation.relationKind,
          mappedEntity: this.#mappedEntityName(relation, entities),
          ...(relation.mappedPropertyId ? { mappedProperty: relation.mappedPropertyId } : {})
        }))
      })),
      metadata
    };
  }

  /** 根据元数据选项生成 TypeScript 源码文件 */
  generate(metadataOptions: EntityMetadataOptions[]): GenerateResult {
    try {
      const generator = new RxDBClientGenerator();
      for (const options of metadataOptions) {
        generator.addEntity(options);
      }
      generator.exec();
      const sourceFiles = generator.getSourceFiles();
      const files: GeneratedFile[] = sourceFiles.map(sf => ({
        path: sf.getFilePath(),
        content: sf.getText()
      }));
      return { success: true, files, errors: [] };
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return { success: false, files: [], errors: [errorMessage] };
    }
  }

  /** 将生成的文件打包为 ZIP Blob */
  createZipBlob(files: GeneratedFile[]): Blob {
    const encoder = new TextEncoder();
    const zipFiles: Record<string, Uint8Array> = {};
    for (const file of files) {
      zipFiles[file.path] = encoder.encode(file.content);
    }
    const zipData = zipSync(zipFiles, { level: 9, mem: 8 });
    return new Blob([zipData as BlobPart], { type: 'application/zip' });
  }

  /** 生成 ZIP 并触发浏览器下载 */
  downloadZip(files: GeneratedFile[], filename: string): void {
    this.downloadBlob(this.createZipBlob(files), filename.endsWith('.zip') ? filename : `${filename}.zip`);
  }

  /** 在浏览器中下载 Blob；SSR 调用不会产生副作用。 */
  downloadBlob(blob: Blob, filename: string): void {
    if (!isPlatformBrowser(this.#platformId)) return;
    const url = URL.createObjectURL(blob);
    const a = this.#document.createElement('a');
    a.href = url;
    a.download = filename;
    this.#document.body.appendChild(a);
    try {
      a.click();
    } finally {
      this.#document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }

  #propertyToMetadata(
    p: DesignProperty,
    childPropertiesMap?: Map<string, DesignProperty[]>
  ): EntityPropertyMetadataOptions {
    const base = {
      name: this.#toCamelCase(p.name),
      type: p.propertyType as PropertyType,
      unique: p.isUnique || undefined,
      nullable: p.isNullable || undefined,
      required: p.isRequired || undefined,
      readonly: p.isReadonly || undefined,
      sortable: p.isSortable || undefined,
      default:
        p.defaultValue ? (this.#tryParseJson(p.defaultValue) as EntityPropertyMetadataOptions['default']) : undefined,
      columnName: p.columnName ?? undefined,
      displayName: p.displayName ?? undefined
    };

    // keyValue 类型附加子属性
    if (p.propertyType === 'keyValue' && childPropertiesMap) {
      const children = childPropertiesMap.get(p.id) ?? [];
      const properties: KeyValuePropertyMetadata[] = children
        .sort((a, b) => (a.sortOrder > b.sortOrder ? 1 : -1))
        .map(child => ({
          name: this.#toCamelCase(child.name),
          type: child.propertyType as PropertyType,
          displayName: child.displayName ?? child.name,
          nullable: child.isNullable || undefined,
          required: child.isRequired || undefined,
          default:
            child.defaultValue ?
              (this.#tryParseJson(child.defaultValue) as KeyValuePropertyMetadata['default'])
            : undefined
        })) as KeyValuePropertyMetadata[];
      return { ...base, properties } as EntityPropertyMetadataOptions;
    }

    // enum 类型附加枚举选项
    if (p.propertyType === 'enum' && p.enumValues?.length) {
      return { ...base, enum: p.enumValues } as EntityPropertyMetadataOptions;
    }

    return base as EntityPropertyMetadataOptions;
  }

  #relationToMetadata(r: DesignRelation, allEntities: DesignEntity[]): EntityRelationMetadataOptions {
    const targetEntity = allEntities.find(e => e.id === r.mappedEntityId);
    const base = {
      name: this.#toCamelCase(r.name),
      kind: r.relationKind as RelationKind,
      mappedEntity: targetEntity ? this.#toPascalCase(targetEntity.name) : ('' as Capitalize<string>),
      mappedProperty: (r.mappedPropertyId || undefined) as EntityRelationMetadataOptions['mappedProperty'],
      mappedNamespace: r.mappedNamespace ? this.#toLowerCase(r.mappedNamespace) : undefined,
      columnName: r.columnName ?? undefined,
      onDelete: r.onDeleteAction ? (r.onDeleteAction as OnDeleteAction) : undefined,
      onUpdate: r.onUpdateAction ? (r.onUpdateAction as OnUpdateAction) : undefined
    };
    return base as EntityRelationMetadataOptions;
  }

  #mappedEntityName(relation: DesignRelation, entities: DesignEntity[]): string {
    const target = entities.find(entity => entity.id === relation.mappedEntityId);
    return target ? this.#toPascalCase(target.name) : '';
  }

  #indexToMetadata(i: DesignIndex, properties: DesignProperty[]): EntityIndexMetadataOptions {
    const propNames = i.propertyIds.map(id => properties.find(p => p.id === id)?.name ?? id);
    return {
      name: this.#toCamelCase(propNames.join('_')),
      properties: propNames,
      unique: i.isUnique || undefined
    };
  }

  #toPascalCase(str: string): Capitalize<string> {
    return (str.charAt(0).toUpperCase() + str.slice(1)) as Capitalize<string>;
  }

  #toLowerCase(str: string): Lowercase<string> {
    return str.toLowerCase() as Lowercase<string>;
  }

  #toCamelCase(str: string): Uncapitalize<string> {
    return (str.charAt(0).toLowerCase() + str.slice(1)) as Uncapitalize<string>;
  }

  #tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}
