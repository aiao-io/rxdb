import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { partGroup, selectModelNodes, type ModelNodeIdentity } from './model-mapping';
import type { BomRow } from './types';
export interface ViewportEvents {
  progress: (loaded: number, total: number) => void;
  ready: (nodes: number) => void;
  selected: (selection: ModelNodeIdentity) => void;
}
export class ModelViewport {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000);
  private readonly controls: OrbitControls;
  private readonly loader = new GLTFLoader();
  private readonly draco = new DRACOLoader();
  private readonly observer: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private readonly objects = new Map<number, THREE.Object3D>();
  private readonly identities: ModelNodeIdentity[] = [];
  private readonly sourceHidden = new Set<THREE.Mesh>();
  private readonly originalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private readonly highlightCache = new Map<THREE.Material, THREE.Material>();
  private readonly ghostMaterial = new THREE.MeshStandardMaterial({ color: 0xa7bdb9, transparent: true, opacity: 0.09, depthWrite: false });
  private readonly highlightMaterials = new Set<THREE.Material>();
  private root: THREE.Group | null = null;
  private meshes: THREE.Mesh[] = [];
  private selectedMeshes = new Set<THREE.Mesh>();
  private pendingSelection: BomRow | null = null;
  private generation = 0;
  private request: AbortController | null = null;
  private frame = 0;
  private disposed = false;
  private isolated = false;
  private ghosted = false;
  private pointerStart = new THREE.Vector2();

  constructor(private readonly host: HTMLElement, private readonly events: ViewportEvents) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0xf3f5f8, 1);
    this.renderer.domElement.setAttribute('aria-label', 'BOM 三维模型，使用表格选择也可定位零件');
    this.renderer.domElement.setAttribute('role', 'img');
    this.host.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener('change', this.render);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8c98b1, 3));
    const light = new THREE.DirectionalLight(0xffffff, 3.2);
    light.position.set(12, 18, 10); this.scene.add(light);
    const fill = new THREE.DirectionalLight(0xc8d6ff, 1.8);
    fill.position.set(-10, 6, -10); this.scene.add(fill);
    this.draco.setDecoderPath('/draco/');
    this.draco.setWorkerLimit(2);
    this.loader.setDRACOLoader(this.draco);
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.renderer.domElement.addEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.pointerUp);
    this.resize();
  }

  async load(url: string, standalone = false): Promise<void> {
    const generation = ++this.generation;
    this.request?.abort();
    this.request = new AbortController();
    const response = await fetch(url, { signal: this.request.signal });
    if (!response.ok || !response.body) throw new Error(`模型读取失败：HTTP ${response.status}`);
    const total = Number(response.headers.get('content-length') ?? 0);
    const chunks: Uint8Array[] = [];
    const reader = response.body.getReader();
    let loaded = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      loaded += chunk.value.length; chunks.push(chunk.value); this.events.progress(loaded, total);
    }
    const buffer = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
    const gltf = await this.loader.parseAsync(buffer.buffer, new URL('.', new URL(url, location.href)).href);
    if (this.disposed || generation !== this.generation) { this.releaseRoot(gltf.scene); return; }
    this.clear(); this.root = gltf.scene;
    this.root.scale.setScalar(0.001);
    this.scene.add(this.root);
    gltf.parser.associations.forEach((reference, object) => { if (reference?.nodes !== undefined && object instanceof THREE.Object3D) this.objects.set(reference.nodes, object); });
    this.objects.forEach((object, index) => {
      const compId = String(object.userData['item_id'] ?? object.userData['gid'] ?? object.name);
      this.identities.push({ index, partId: partGroup(compId), compId, systemId: String(object.userData['system_id'] ?? '') });
    });
    this.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      let parent: THREE.Object3D | null = object;
      while (parent) { if (parent.userData['removed_by_pose_fix'] || parent.userData['_gen2Superseded']) this.sourceHidden.add(object); parent = parent.parent; }
      this.meshes.push(object); this.originalMaterials.set(object, object.material);
      object.visible = !this.sourceHidden.has(object);
    });
    if (standalone) this.pendingSelection = null;
    this.fit();
    if (this.pendingSelection) this.select(this.pendingSelection);
    this.events.ready(this.identities.length);
  }

  select(row: BomRow | null): { count: number; level: string } {
    this.pendingSelection = row;
    if (!this.root || !row) { this.resetSelection(); return { count: 0, level: 'none' }; }
    this.resetSelection();
    const selected = selectModelNodes(this.identities, row);
    const system = row.kind === 'system' ? this.identities.filter(n => n.partId.startsWith(row.compId)) : this.identities.filter(n => n.systemId === row.compId);
    const indices = system.length && !selected.indices.length ? system.map(n => n.index) : selected.indices;
    for (const index of indices) this.objects.get(index)?.traverse(object => { if (object instanceof THREE.Mesh && !this.sourceHidden.has(object)) this.selectedMeshes.add(object); });
    for (const mesh of this.selectedMeshes) this.highlight(mesh);
    this.applyVisibility(); this.render();
    return { count: this.selectedMeshes.size, level: system.length && !selected.indices.length ? 'system' : selected.level };
  }

  focus(): void { if (!this.selectedMeshes.size) return; this.fitBox(this.boxOf([...this.selectedMeshes])); }
  fit(): void { if (this.root) this.fitBox(new THREE.Box3().setFromObject(this.root)); }
  view(direction: 'front' | 'side' | 'top' | 'iso'): void {
    const distance = this.camera.position.distanceTo(this.controls.target);
    const offsets = { front: new THREE.Vector3(1, 0, 0), side: new THREE.Vector3(0, 0, 1), top: new THREE.Vector3(0.001, 1, 0), iso: new THREE.Vector3(1, 0.6, 1) };
    this.camera.position.copy(this.controls.target).addScaledVector(offsets[direction].normalize(), distance); this.controls.update(); this.render();
  }
  isolate(value: boolean): void { this.isolated = value; this.applyVisibility(); this.render(); }
  ghost(value: boolean): void { this.ghosted = value; const row = this.pendingSelection; this.resetSelection(); if (row) this.select(row); this.applyVisibility(); this.render(); }
  reset(): void { this.isolated = false; this.ghosted = false; this.resetSelection(); this.fit(); }
  cancel(): void { this.request?.abort(); this.generation++; }
  dispose(): void {
    this.disposed = true; this.cancel(); cancelAnimationFrame(this.frame); this.observer.disconnect(); this.controls.dispose(); this.draco.dispose();
    this.renderer.domElement.removeEventListener('pointerdown', this.pointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.pointerUp);
    this.clear(); this.ghostMaterial.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }

  private readonly render = (): void => {
    if (this.disposed || this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.renderer.render(this.scene, this.camera); });
  };
  private readonly pointerDown = (event: PointerEvent): void => { this.pointerStart.set(event.clientX, event.clientY); };
  private readonly pointerUp = (event: PointerEvent): void => {
    if (this.pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera);
    const hit = this.raycaster.intersectObjects(this.meshes.filter(m => m.visible), false)[0];
    if (!hit) return;
    let object: THREE.Object3D | null = hit.object;
    while (object) {
      const match = this.identities.find(n => this.objects.get(n.index) === object);
      if (match) { this.events.selected(match); return; }
      object = object.parent;
    }
  };

  private resize(): void {
    const { width, height } = this.host.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height); this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.render();
  }
  private boxOf(objects: THREE.Object3D[]): THREE.Box3 { const box = new THREE.Box3(); for (const object of objects) box.expandByObject(object); return box; }
  private fitBox(box: THREE.Box3): void {
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3()); const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 0.03) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 0.72;
    this.controls.target.copy(center); this.camera.position.copy(center).addScaledVector(new THREE.Vector3(1, 0.65, 1).normalize(), radius);
    this.camera.near = Math.max(radius / 1000, 0.0001); this.camera.far = Math.max(radius * 100, 1000); this.camera.updateProjectionMatrix(); this.controls.update(); this.render();
  }
  private highlight(mesh: THREE.Mesh): void {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const clones = materials.map(material => {
      const cached = this.highlightCache.get(material);
      if (cached) return cached;
      const clone = material.clone();
      if (clone instanceof THREE.MeshStandardMaterial) { clone.color.set(0x21a07c); clone.emissive.set(0x137357); clone.emissiveIntensity = 0.25; }
      this.highlightCache.set(material, clone); this.highlightMaterials.add(clone); return clone;
    });
    mesh.material = Array.isArray(mesh.material) ? clones : clones[0];
  }
  private resetSelection(): void {
    this.originalMaterials.forEach((material, mesh) => { mesh.material = material; mesh.visible = !this.sourceHidden.has(mesh); });
    for (const material of this.highlightMaterials) material.dispose();
    this.highlightMaterials.clear(); this.highlightCache.clear(); this.selectedMeshes.clear();
  }
  private applyVisibility(): void {
    for (const mesh of this.meshes) {
      const selected = this.selectedMeshes.has(mesh);
      mesh.visible = !this.sourceHidden.has(mesh) && (!this.isolated || !this.selectedMeshes.size || selected);
      if (this.ghosted && this.selectedMeshes.size && !selected) this.makeGhost(mesh);
    }
  }
  private makeGhost(mesh: THREE.Mesh): void { mesh.material = this.ghostMaterial; }
  private clear(): void {
    this.resetSelection();
    if (this.root) { this.scene.remove(this.root); this.releaseRoot(this.root); }
    this.root = null; this.meshes = []; this.objects.clear(); this.identities.length = 0; this.originalMaterials.clear(); this.sourceHidden.clear();
  }
  private releaseRoot(root: THREE.Object3D): void {
    const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(); const textures = new Set<THREE.Texture>();
    root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material); });
    for (const material of materials) { for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); material.dispose(); }
    for (const texture of textures) texture.dispose();
    for (const geometry of geometries) geometry.dispose();
  }
}
