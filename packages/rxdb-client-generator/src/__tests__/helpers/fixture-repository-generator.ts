/**
 * @fileoverview 测试用的扩展 Repository 生成器夹具
 *
 * @remarks
 * 生成器包**不依赖任何插件包**（依赖方向是插件 → 生成器），所以校验
 * 「扩展 Repository」这条机制的用例一律用这个夹具，而不是真的树或图。
 * 插件各自生成物的断言归各自的包。
 */

import { ENTITY_BASE_METADATA_OPTIONS, type EntityMetadata, type EntityMetadataOptions } from '@aiao/rxdb';
import type {
  GeneratorContext,
  IRepositoryGenerator,
  RepositoryGeneratorSymbols
} from '../../generators/RepositoryGenerator.interface.js';

/** 夹具插件的包名，等价于真实插件的 `@aiao/rxdb-plugin-*`。 */
export const GEO_MODULE = '@fixture/geo';

/** 夹具插件的 Repository 注册名。 */
export const GEO_REPOSITORY = 'GeoRepository';

/** 夹具插件的抽象实体基类名。 */
export const GEO_ENTITY_BASE = 'GeoEntityBase';

const GEO_ENTITY_BASE_OPTIONS: EntityMetadataOptions = {
  name: GEO_ENTITY_BASE,
  abstract: true
};

/**
 * 自报符号的夹具生成器
 *
 * 不继承生成器包里的任何类：自报机制必须只依赖 {@link IRepositoryGenerator} 这层结构。
 */
export class GeoRepositoryGenerator implements IRepositoryGenerator {
  readonly name = GEO_REPOSITORY;
  readonly entityBaseModuleSpecifier = GEO_MODULE;
  readonly abstractEntityMetadata: ReadonlyMap<string, EntityMetadataOptions[]> = new Map([
    [GEO_ENTITY_BASE, [GEO_ENTITY_BASE_OPTIONS, ENTITY_BASE_METADATA_OPTIONS]]
  ]);

  declareSymbols(metadata: EntityMetadata): RepositoryGeneratorSymbols {
    return {
      types: [{ name: `${metadata.name}GeoRule` }, { exported: true, name: `${metadata.name}GeoRuleGroup` }],
      entityInterfaces: ['IGeoEntity']
    };
  }

  generate(context: GeneratorContext): void {
    const { file, metadata } = context;
    file.addTypeAlias({ hasDeclareKeyword: true, name: `${metadata.name}GeoRule`, type: 'string' });
    file.addTypeAlias({
      hasDeclareKeyword: true,
      isExported: true,
      name: `${metadata.name}GeoRuleGroup`,
      type: `${metadata.name}GeoRule[]`
    });
  }
}
