import { ClientPackageError } from './npm-runner';
import type { PackageDesignContract, PackageDesignEntity } from './package-builder';

/** 客户端包版本提升类别。 */
export type ClientPackageVersionBump = 'initial' | 'major' | 'minor' | 'patch';

/** registry 上一版的版本与设计契约。 */
export interface PreviousVersionContract {
  version: string;
  designContract: PackageDesignContract;
}

/** 可解释的下一版本决策。 */
export interface ClientPackageVersionDecision {
  version: string;
  bump: ClientPackageVersionBump;
}

function key(entity: PackageDesignEntity): string {
  return `${entity.namespace ?? ''}\0${entity.name}`;
}

function indexBy<T>(items: T[], selector: (item: T) => string): Map<string, T> {
  return new Map(items.map(item => [selector(item), item]));
}

function isBreaking(current: PackageDesignContract, previous: PackageDesignContract): boolean {
  const currentEntities = indexBy(current.entities, key);
  for (const oldEntity of previous.entities) {
    const nextEntity = currentEntities.get(key(oldEntity));
    if (!nextEntity) return true;
    const nextProperties = indexBy(nextEntity.properties, property => property.name);
    for (const oldProperty of oldEntity.properties) {
      const nextProperty = nextProperties.get(oldProperty.name);
      if (!nextProperty) return true;
      if (nextProperty.type !== oldProperty.type) return true;
      if (!oldProperty.required && nextProperty.required) return true;
    }
    const nextRelations = indexBy(nextEntity.relations, relation => relation.name);
    for (const oldRelation of oldEntity.relations) {
      const nextRelation = nextRelations.get(oldRelation.name);
      if (!nextRelation) return true;
      if (
        nextRelation.kind !== oldRelation.kind ||
        nextRelation.mappedEntity !== oldRelation.mappedEntity ||
        nextRelation.mappedProperty !== oldRelation.mappedProperty
      ) {
        return true;
      }
    }
  }
  return false;
}

function isAdditive(current: PackageDesignContract, previous: PackageDesignContract): boolean {
  const previousEntities = indexBy(previous.entities, key);
  for (const nextEntity of current.entities) {
    const oldEntity = previousEntities.get(key(nextEntity));
    if (!oldEntity) return true;
    const oldProperties = new Set(oldEntity.properties.map(property => property.name));
    if (nextEntity.properties.some(property => !oldProperties.has(property.name))) return true;
    const oldRelations = new Set(oldEntity.relations.map(relation => relation.name));
    if (nextEntity.relations.some(relation => !oldRelations.has(relation.name))) return true;
  }
  return false;
}

function nextVersion(version: string, bump: Exclude<ClientPackageVersionBump, 'initial'>): string {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match)
    throw new ClientPackageError('registry_failed', 502, 'Previous package version is not a semantic version');
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** 根据设计兼容性规则计算可解释的下一版本。 */
export function decideClientPackageVersion(
  current: PackageDesignContract,
  previous: PreviousVersionContract | null
): ClientPackageVersionDecision {
  if (!previous) return { version: '1.0.0', bump: 'initial' };
  const bump: Exclude<ClientPackageVersionBump, 'initial'> =
    isBreaking(current, previous.designContract) ? 'major'
    : isAdditive(current, previous.designContract) ? 'minor'
    : 'patch';
  return { version: nextVersion(previous.version, bump), bump };
}
