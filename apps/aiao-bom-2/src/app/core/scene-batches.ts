import * as THREE from 'three';
interface BatchItem {
  source: THREE.Mesh;
  instance: number;
  layers: number;
}
interface BatchGroup {
  mesh: THREE.BatchedMesh;
  material: THREE.Material;
  items: BatchItem[];
}
export class SceneBatches {
  private readonly groups: BatchGroup[] = [];
  constructor(
    private readonly scene: THREE.Scene,
    sources: THREE.Mesh[]
  ) {
    const groups = new Map<string, THREE.Mesh[]>();
    for (const source of sources) {
      if (!this.eligible(source)) continue;
      const key = this.key(source);
      const group = groups.get(key) ?? [];
      group.push(source);
      groups.set(key, group);
    }
    for (const group of groups.values()) if (group.length > 1) this.groups.push(this.build(group));
  }
  update(selected: Set<THREE.Mesh>, isolated: boolean, ghost: THREE.Material | null): void {
    for (const group of this.groups) this.updateGroup(group, selected, isolated, ghost);
  }
  hide(): void {
    for (const group of this.groups) group.mesh.visible = false;
  }
  dispose(): void {
    for (const group of this.groups) {
      for (const item of group.items) item.source.layers.mask = item.layers;
      this.scene.remove(group.mesh);
      group.mesh.dispose();
    }
    this.groups.length = 0;
  }
  private eligible(source: THREE.Mesh): boolean {
    return (
      !Array.isArray(source.material) &&
      !(source instanceof THREE.SkinnedMesh) &&
      !(source instanceof THREE.InstancedMesh) &&
      source.matrixWorld.determinant() > 0 &&
      Object.keys(source.geometry.morphAttributes).length === 0 &&
      Boolean(source.geometry.getAttribute('position'))
    );
  }
  private key(source: THREE.Mesh): string {
    const attributes = Object.entries(source.geometry.attributes)
      .map(([name, attribute]) => [name, attribute.itemSize, attribute.normalized])
      .sort(([left], [right]) => String(left).localeCompare(String(right)));
    return JSON.stringify([(source.material as THREE.Material).uuid, Boolean(source.geometry.index), attributes]);
  }
  private build(sources: THREE.Mesh[]): BatchGroup {
    const geometries = [...new Set(sources.map(source => source.geometry))];
    const vertices = geometries.reduce((total, geometry) => total + geometry.getAttribute('position').count, 0);
    const indices = geometries.reduce((total, geometry) => total + (geometry.index?.count ?? 0), 0);
    const material = sources[0].material as THREE.Material;
    const mesh = new THREE.BatchedMesh(sources.length, vertices, indices, material);
    mesh.sortObjects = material.transparent;
    const ids = new Map(geometries.map(geometry => [geometry, mesh.addGeometry(geometry)]));
    const items = sources.map(source => {
      const instance = mesh.addInstance(ids.get(source.geometry)!);
      mesh.setMatrixAt(instance, source.matrixWorld);
      const layers = source.layers.mask;
      source.layers.set(1);
      return { source, instance, layers };
    });
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    this.scene.add(mesh);
    return { mesh, material, items };
  }
  private updateGroup(
    group: BatchGroup,
    selected: Set<THREE.Mesh>,
    isolated: boolean,
    ghost: THREE.Material | null
  ): void {
    group.mesh.visible = !isolated || !selected.size;
    group.mesh.material = ghost ?? group.material;
    group.mesh.sortObjects = group.mesh.material.transparent;
    for (const item of group.items) {
      const chosen = selected.has(item.source);
      group.mesh.setVisibleAt(item.instance, !chosen);
      item.source.layers.mask = chosen ? item.layers : 2;
    }
  }
}
