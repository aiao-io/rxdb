import { PropertyType, RelationKind } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { RxDBClientGenerator } from '../core/RxDBClientGenerator.js';
import { compileGeneratedConsumer } from './helpers/generated-consumer.js';

const createGenerator = (): RxDBClientGenerator => {
  const generator = new RxDBClientGenerator();
  generator.addEntity({
    name: 'Owner',
    namespace: 'public',
    displayName: 'Owner',
    repository: 'Repository',
    extends: ['EntityBase'],
    properties: [{ name: 'id', type: PropertyType.bigint, primary: true }],
    computedProperties: [],
    relations: [
      {
        name: 'artifacts',
        kind: RelationKind.ONE_TO_MANY,
        mappedEntity: 'Artifact',
        mappedProperty: 'owner'
      }
    ],
    indexes: []
  });
  generator.addEntity({
    name: 'Artifact',
    namespace: 'public',
    displayName: 'Artifact',
    repository: 'Repository',
    extends: ['EntityBase'],
    properties: [
      { name: 'id', type: PropertyType.bigint, primary: true, sortable: true },
      { name: 'payload', type: PropertyType.binary, nullable: true }
    ],
    computedProperties: [],
    relations: [
      {
        name: 'owner',
        kind: RelationKind.MANY_TO_ONE,
        mappedEntity: 'Owner',
        mappedProperty: 'artifacts'
      }
    ],
    indexes: []
  });
  generator.exec();
  return generator;
};

const createManyToManyGenerator = (): RxDBClientGenerator => {
  const generator = new RxDBClientGenerator();
  generator.addEntity({
    name: 'Member',
    namespace: 'public',
    extends: ['EntityBase'],
    properties: [{ name: 'id', type: PropertyType.bigint, primary: true }],
    relations: [
      {
        name: 'teams',
        kind: RelationKind.MANY_TO_MANY,
        mappedEntity: 'Team',
        mappedProperty: 'members'
      }
    ]
  });
  generator.addEntity({
    name: 'Team',
    namespace: 'public',
    extends: ['EntityBase'],
    properties: [{ name: 'id', type: PropertyType.bigint, primary: true }],
    relations: [
      {
        name: 'members',
        kind: RelationKind.MANY_TO_MANY,
        mappedEntity: 'Member',
        mappedProperty: 'teams'
      }
    ]
  });
  generator.addEntity({
    name: 'Member_Team',
    namespace: 'public',
    extends: ['EntityBase'],
    relations: [
      {
        name: 'teams',
        kind: RelationKind.MANY_TO_ONE,
        mappedEntity: 'Team',
        mappedProperty: 'members'
      },
      {
        name: 'members',
        kind: RelationKind.MANY_TO_ONE,
        mappedEntity: 'Member',
        mappedProperty: 'teams'
      }
    ]
  });
  generator.exec();
  return generator;
};

describe('bigint and binary client generation', () => {
  it('generates runtime types, id type and legal query rules', () => {
    const source = createGenerator()
      .getSourceFiles()
      .map(file => file.getText())
      .join('\n');

    expect(source).toContain('id?: bigint');
    expect(source).toContain('payload?: Uint8Array | null');
    expect(source).toContain('idType: bigint');
    expect(source).toContain('ownerId?: bigint');
    expect(source).toContain("BigIntRules<Artifact, 'id'");
    expect(source).toContain("BinaryRules<Artifact, 'payload'");
    const orderBy = source.match(/type ArtifactOrderByField = ([^;]+);/)?.[1];
    expect(orderBy).not.toContain("'payload'");
  });

  it('compiles get(1n), bigint rules and binary equality rules', async () => {
    const generator = createGenerator();
    const diagnostics = await compileGeneratedConsumer(
      generator.getSourceFiles(),
      `import { Artifact } from './generated/index.js';
Artifact.get(1n);
new Artifact({ ownerId: 1n });
Artifact.find({ where: { combinator: 'and', rules: [
  { field: 'id', operator: 'between', value: [1n, 3n] },
  { field: 'payload', operator: 'in', value: [new Uint8Array([1])] }
] } });`
    );

    expect(diagnostics).toEqual([]);
  });

  it('keeps both many-to-many junction foreign keys as bigint', async () => {
    const generator = createManyToManyGenerator();
    const source = generator
      .getSourceFiles()
      .map(file => file.getText())
      .join('\n');

    expect(source).toContain('declare class Member extends EntityBase<bigint>');
    expect(source).toContain('declare class Team extends EntityBase<bigint>');
    expect(source).toContain('membersId?: bigint');
    expect(source).toContain('teamsId?: bigint');

    const diagnostics = await compileGeneratedConsumer(
      generator.getSourceFiles(),
      `import { Member, Member_Team, Team } from './generated/index.js';
new Member_Team({ membersId: 1n, teamsId: 2n });
declare const member: Member;
declare const team: Team;
member.teams$;
team.members$;`
    );

    expect(diagnostics).toEqual([]);
  });

  it('rejects string ids for bigint many-to-many junction foreign keys', async () => {
    const generator = createManyToManyGenerator();
    const diagnostics = await compileGeneratedConsumer(
      generator.getSourceFiles(),
      `import { Member_Team } from './generated/index.js';
new Member_Team({ membersId: '1', teamsId: '2' });`
    );

    expect(diagnostics.join('\n')).toContain("Type 'string' is not assignable to type 'bigint'");
  });
});
