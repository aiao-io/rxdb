import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { ModelViewport } from './model-viewport';
import { BomIndex } from './query';
import { makeStressDataset } from './stress-data';
const mocks = vi.hoisted(() => ({ parse: vi.fn(), rendererDispose: vi.fn(), contextLoss: vi.fn(), decoderDispose: vi.fn(), rendererRender: vi.fn() }));
vi.mock('three', async original => {
  const actual = await original<typeof import('three')>();
  return { ...actual, WebGLRenderer: class {
    readonly domElement = document.createElement('canvas');
    setPixelRatio() {} setClearColor() {} setSize() {}
    render = mocks.rendererRender;
    dispose = mocks.rendererDispose;
    forceContextLoss = mocks.contextLoss;
  } };
});
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({ GLTFLoader: class { setDRACOLoader() {} setMeshoptDecoder() {} parseAsync = mocks.parse; } }));
vi.mock('three/addons/loaders/DRACOLoader.js', () => ({ DRACOLoader: class { setDecoderPath() {} setWorkerLimit() {} dispose = mocks.decoderDispose; } }));
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const three = await import('three');
  return { OrbitControls: class { readonly target = new three.Vector3(); enableDamping = false; addEventListener() {} update() {} dispose() {} } };
});
function scene() {
  const root = new THREE.Group(); const geometry = new THREE.BoxGeometry(1, 1, 1); const material = new THREE.MeshStandardMaterial({ color: 0x777777 });
  const a = new THREE.Mesh(geometry, material); a.userData = { item_id: '1321315X9D01A' };
  const b = new THREE.Mesh(geometry, material); b.position.x = 2; b.userData = { item_id: '1321315X9D01A' };
  const hidden = new THREE.Mesh(geometry, material); hidden.position.x = -2; hidden.userData = { item_id: '1321315X9D01A', removed_by_pose_fix: '来源明确移除' };
  root.add(a, b, hidden);
  return { scene: root, parser: { associations: new Map<THREE.Object3D | THREE.Material, { nodes: number } | undefined>([[a, { nodes: 0 }], [b, { nodes: 1 }], [hidden, { nodes: 2 }], [material, undefined]]) }, a, b, hidden, geometry, material };
}
function row() { return { ...new BomIndex(makeStressDataset(1), 'catalog').rows.get('stress:0')!, partId: '1321315', compId: '1321315X9D01A', nodeIndex: 0 }; }
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-length': '3' } })));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());
describe('模型生命周期与精确位置语义', () => {
  it('读取缺省关联项、共享材质与来源移除节点，选择只影响具体位置', async () => {
    const asset = scene(); mocks.parse.mockResolvedValue(asset);
    const host = document.createElement('div'); host.getBoundingClientRect = () => ({ width: 640, height: 480 } as DOMRect);
    const ready = vi.fn(); const progress = vi.fn();
    const viewport = new ModelViewport(host, { ready, progress, selected: vi.fn() });
    await viewport.load('/test.glb');
    expect(ready).toHaveBeenCalledWith(3); expect(progress).toHaveBeenCalledWith(3, 3);
    expect(asset.hidden.visible).toBe(false);
    expect(viewport.select(row())).toEqual({ count: 1, level: 'occurrence' });
    expect(asset.a.material).not.toBe(asset.material); expect(asset.b.material).toBe(asset.material);
    viewport.ghost(true); expect((asset.b.material as THREE.Material).opacity).toBe(.09);
    viewport.isolate(true); expect(asset.b.visible).toBe(false);
    viewport.isolate(false); expect(asset.b.visible).toBe(true);
    viewport.ghost(false); viewport.focus(); viewport.view('front'); viewport.view('side'); viewport.view('top'); viewport.view('iso');
    viewport.reset(); expect(asset.a.material).toBe(asset.material); expect(asset.hidden.visible).toBe(false);
    const geometryDispose = vi.spyOn(asset.geometry, 'dispose'); const materialDispose = vi.spyOn(asset.material, 'dispose');
    viewport.dispose(); expect(host.querySelector('canvas')).toBeNull();
    expect(geometryDispose).toHaveBeenCalledTimes(1); expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(mocks.rendererDispose).toHaveBeenCalledTimes(1); expect(mocks.contextLoss).toHaveBeenCalledTimes(1); expect(mocks.decoderDispose).toHaveBeenCalledTimes(1);
  });
  it('旧模型晚完成时释放旧资源，保留后选模型；空选择与失败明确返回', async () => {
    const first = scene(); const second = scene(); const dispose = vi.spyOn(first.geometry, 'dispose');
    let finish!: (value: ReturnType<typeof scene>) => void;
    mocks.parse.mockImplementationOnce(() => new Promise(done => { finish = done; })).mockResolvedValueOnce(second);
    const viewport = new ModelViewport(document.createElement('div'), { ready: vi.fn(), progress: vi.fn(), selected: vi.fn() });
    const old = viewport.load('/first.glb');
    await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalledTimes(1));
    await viewport.load('/second.glb', true); finish(first); await old;
    expect(dispose).toHaveBeenCalledTimes(1); expect(viewport.select(row()).count).toBe(1);
    expect(viewport.select(null).count).toBe(0);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(viewport.load('/missing.glb')).rejects.toThrow('HTTP 404'); viewport.dispose();
  });
});
