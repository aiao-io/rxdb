/**
 * @fileoverview RCG-001：metadataMap 的键不得被输入伪造
 *
 * namespace 与实体名都允许包含 `_`，拼接键 `${namespace}_${name}` 因此不是单射：
 * (ns=`a_b`, name=`C`) 与 (ns=`a`, name=`b_C`) 得到同一个键，后写覆盖先写，
 * 关系解析随后会解析到**错误的实体**且不报错。
 */
import { PropertyType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';

// 声明类型是 `Capitalize<string>` / `Lowercase<string>`，但运行时校验并不执行这两条：
// IDENTIFIER_PATTERN 允许小写开头，NAMESPACE_PATTERN 的 \p{L} 允许大写。
// **正是这个「声明强于校验」的缺口让拼接键的碰撞可达** —— 若两条约束都真的成立，
// 首个大写字母就唯一确定了分界点，拼接反而是单射的。
const addEntity = (generator: RxDBClientGenerator, name: string, namespace?: string) => {
  generator.addEntity({
    name: name as Capitalize<string>,
    namespace: namespace as Lowercase<string> | undefined,
    displayName: name,
    repository: 'Repository',
    extends: ['EntityBase'],
    properties: [{ name: 'id', type: PropertyType.uuid, nullable: false, readonly: true }],
    computedProperties: [],
    relations: [],
    indexes: []
  });
};

// 拼接键 `${namespace}_${name}` 下，这两个实体得到同一个键 `a_B_C`
const COLLIDING_PAIR = [
  { name: 'C', namespace: 'a_B' },
  { name: 'B_C', namespace: 'a' }
] as const;

describe('RCG-001 metadataMap 键碰撞', () => {
  it('namespace 与实体名里的下划线不得造成互相覆盖', () => {
    const generator = new RxDBClientGenerator();
    COLLIDING_PAIR.forEach(entity => addEntity(generator, entity.name, entity.namespace));

    expect(generator.metadataSet.size).toEqual(2);
    expect(generator.metadataMap.size).toEqual(2);
  });

  it('碰撞的两个实体必须各自解析到自己', () => {
    const generator = new RxDBClientGenerator();
    COLLIDING_PAIR.forEach(entity => addEntity(generator, entity.name, entity.namespace));

    expect(generator.getMetadata('C', 'a_B')?.name).toEqual('C');
    expect(generator.getMetadata('B_C', 'a')?.name).toEqual('B_C');
  });

  it('未声明 namespace 的实体可以按 public 读回（写入与读取的兜底必须一致）', () => {
    const generator = new RxDBClientGenerator();
    addEntity(generator, 'Loose');

    expect(generator.getMetadata('Loose', 'public')?.name).toEqual('Loose');
  });

  it('查不到时返回 undefined，而不是命中别的实体', () => {
    const generator = new RxDBClientGenerator();
    addEntity(generator, 'C', 'a_B');

    expect(generator.getMetadata('B_C', 'a')).toBeUndefined();
    expect(generator.getMetadata('C', 'other')).toBeUndefined();
  });
});
