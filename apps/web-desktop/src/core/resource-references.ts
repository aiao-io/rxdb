export interface ResourceReference {
  id: string;
  key: string;
}

export class ResourceReferences {
  private readonly owners = new Map<string, ResourceReference[]>();

  replace(owner: string, references: ResourceReference[]): void {
    if (
      references.some(ref => typeof ref.id !== 'string' || !ref.id || typeof ref.key !== 'string' || !ref.key) ||
      new Set(references.map(ref => ref.id)).size !== references.length
    )
      throw new Error('INVALID: 资源引用身份无效或重复');
    this.owners.set(
      owner,
      references.map(ref => ({ ...ref }))
    );
  }

  count(key: string): number {
    return [...this.owners.values()].flat().filter(ref => ref.key === key).length;
  }

  keys(): string[] {
    return [...new Set([...this.owners.values()].flat().map(ref => ref.key))];
  }
}
