/**
 * @fileoverview RCG-007：many-to-many 反向校验必须确认对端指回本端
 *
 * 反向查找原先只比 `kind` / `name` / `mappedProperty` 三项，不比对端的
 * `mappedEntity` / `mappedNamespace` —— A.x→B.y、B.y→C.x、C.x→B.y 这种
 * 三实体错连整体被接受，生成的客户端两端对不上。
 */
import { PropertyType, RelationKind } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';

interface ManyToManyLink {
  name: string;
  mappedEntity: string;
  mappedNamespace?: string;
  mappedProperty: string;
}

const addEntity = (generator: RxDBClientGenerator, name: string, namespace: string, links: ManyToManyLink[]) => {
  generator.addEntity({
    name: name as Capitalize<string>,
    namespace: namespace as Lowercase<string>,
    displayName: name,
    repository: 'Repository',
    extends: ['EntityBase'],
    properties: [{ name: 'id', type: PropertyType.uuid, nullable: false, readonly: true }],
    computedProperties: [],
    indexes: [],
    relations: links.map(link => ({
      name: link.name as Uncapitalize<string>,
      kind: RelationKind.MANY_TO_MANY as const,
      mappedEntity: link.mappedEntity as Capitalize<string>,
      mappedNamespace: (link.mappedNamespace ?? namespace) as Lowercase<string>,
      mappedProperty: link.mappedProperty as Uncapitalize<string>
    }))
  });
};

describe('RCG-007 many-to-many 反向校验', () => {
  it('两端正确互指时通过', () => {
    const generator = new RxDBClientGenerator();
    addEntity(generator, 'A', 'public', [{ name: 'bs', mappedEntity: 'B', mappedProperty: 'as' }]);
    addEntity(generator, 'B', 'public', [{ name: 'as', mappedEntity: 'A', mappedProperty: 'bs' }]);

    expect(() => generator.exec()).not.toThrow();
  });

  it('对端指向第三个实体时必须报错', () => {
    const generator = new RxDBClientGenerator();
    // A.bs 说自己的对端是 B.as，而 B.as 指向的是 C
    addEntity(generator, 'A', 'public', [{ name: 'bs', mappedEntity: 'B', mappedProperty: 'as' }]);
    addEntity(generator, 'B', 'public', [{ name: 'as', mappedEntity: 'C', mappedProperty: 'bs' }]);
    addEntity(generator, 'C', 'public', [{ name: 'bs', mappedEntity: 'B', mappedProperty: 'as' }]);

    expect(() => generator.exec()).toThrow(/mapped relation/);
  });

  // 谓词里的 mappedNamespace 比较目前**不可达**，原因记录在这里：
  // addEntity 要求实体名全局唯一（跨 namespace 也不允许重名），
  // 所以「名字对得上但 namespace 不对」构造不出来。
  // 保留该比较是防御性的 —— 一旦重名约束放宽，它就是必需的。
  it('实体名跨 namespace 也必须唯一（这条约束让 namespace 错指不可达）', () => {
    const generator = new RxDBClientGenerator();
    addEntity(generator, 'A', 'shopA', []);

    expect(() => addEntity(generator, 'A', 'shopC', [])).toThrow(/Duplicate entity name A/);
  });

  // 对端根本解析不出来的情况，由 entity-rules.ts:240 更早拦下并给出
  // `metadata "X" not found`。m2m 反向校验管的是**两端都能解析、但指错了对象**那一类。
  it('对端 namespace 指向不存在的 namespace 时必须报错', () => {
    const generator = new RxDBClientGenerator();
    addEntity(generator, 'A', 'shopA', [
      { name: 'bs', mappedEntity: 'B', mappedNamespace: 'shopB', mappedProperty: 'as' }
    ]);
    addEntity(generator, 'B', 'shopB', [
      { name: 'as', mappedEntity: 'A', mappedNamespace: 'shopC', mappedProperty: 'bs' }
    ]);

    expect(() => generator.exec()).toThrow(/not found/);
  });

  it('错误信息必须带上两端 identity', () => {
    const generator = new RxDBClientGenerator();
    addEntity(generator, 'A', 'public', [{ name: 'bs', mappedEntity: 'B', mappedProperty: 'as' }]);
    addEntity(generator, 'B', 'public', [{ name: 'as', mappedEntity: 'C', mappedProperty: 'bs' }]);
    addEntity(generator, 'C', 'public', [{ name: 'bs', mappedEntity: 'B', mappedProperty: 'as' }]);

    // 只报本端的话，使用者拿不到「该去查哪一端」
    expect(() => generator.exec()).toThrow(/public\.A\.bs[\s\S]*public\.B\.as/);
  });
});
