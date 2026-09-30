/**
 * @fileoverview CLI 生成器插件加载的测试夹具
 * 模拟第三方插件包提供的 Repository 生成器：自带基类元数据与自带方法
 *
 * @module rxdb-client-generator/__tests__/fixtures/geo-repository-generator
 */

import { ENTITY_BASE_METADATA_OPTIONS, type EntityMetadataOptions } from '@aiao/rxdb';
import type { GeneratorContext, IRepositoryGenerator } from '../../generators/RepositoryGenerator.interface.js';

/** 夹具插件包名，与 {@link GeoRepositoryGenerator.entityBaseModuleSpecifier} 一致。 */
export const GEO_MODULE = '@fixture/geo';

/** 夹具抽象基类的元数据，对应插件源码里的 `@Entity(GEO_ENTITY_BASE_OPTIONS)`。 */
export const GEO_ENTITY_BASE_OPTIONS: EntityMetadataOptions = {
  name: 'GeoEntityBase',
  abstract: true
};

/**
 * 夹具 Repository 生成器
 *
 * 不继承 {@link RepositoryGeneratorBase}：CLI 只依赖 {@link IRepositoryGenerator} 这层结构，
 * 夹具保持最小实现才能证明「缝」本身不要求插件继承生成器包里的任何类。
 */
export class GeoRepositoryGenerator implements IRepositoryGenerator {
  readonly name = 'GeoRepository';

  readonly entityBaseModuleSpecifier = GEO_MODULE;

  readonly abstractEntityMetadata: ReadonlyMap<string, EntityMetadataOptions[]> = new Map([
    ['GeoEntityBase', [GEO_ENTITY_BASE_OPTIONS, ENTITY_BASE_METADATA_OPTIONS]]
  ]);

  generate(context: GeneratorContext): void {
    context.classMethods.push({
      name: 'findNearby',
      isStatic: true,
      parameters: [{ name: 'radius', type: 'number' }],
      returnType: `${context.metadata.name}[]`,
      docs: ['查询附近的实体（夹具方法）']
    });
  }
}

/** 与 {@link GeoRepositoryGenerator} 同名的生成器，用于验证重名注册被拒绝。 */
export class DuplicateNameGenerator implements IRepositoryGenerator {
  readonly name = 'Repository';

  generate(): void {
    // 只用来触发重名检测，不生成任何成员
  }
}

/** 非构造函数导出，用于验证规格必须指向一个生成器类。 */
export const notAGenerator = { name: 'GeoRepository' };
