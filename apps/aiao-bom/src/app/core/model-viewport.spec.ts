import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelViewport } from './model-viewport';
import { BomIndex } from './query';
import { makeStressDataset } from './stress-data';
const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  rendererDispose: vi.fn(),
  contextLoss: vi.fn(),
  decoderDispose: vi.fn(),
  rendererRender: vi.fn()
}));
vi.mock('three', async original => {
  const actual = await original<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: class {
      readonly domElement = document.createElement('canvas');
      readonly info = { render: { calls: 1, triangles: 12 } };
      autoClear = true;
      readonly getDrawingBufferSize = vi.fn((size: THREE.Vector2) => size.set(640, 480));
      readonly setRenderTarget = vi.fn();
      readonly setPixelRatio = vi.fn();
      readonly setClearColor = vi.fn();
      readonly setSize = vi.fn();
      render = mocks.rendererRender;
      dispose = mocks.rendererDispose;
      forceContextLoss = mocks.contextLoss;
    }
  };
});
vi.mock('three/addons/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    readonly setDRACOLoader = vi.fn();
    readonly setMeshoptDecoder = vi.fn();
    parseAsync = mocks.parse;
  }
}));
vi.mock('three/addons/loaders/DRACOLoader.js', () => ({
  DRACOLoader: class {
    readonly setDecoderPath = vi.fn();
    readonly setWorkerLimit = vi.fn();
    dispose = mocks.decoderDispose;
  }
}));
vi.mock('three/addons/controls/OrbitControls.js', async () => {
  const three = await import('three');
  return {
    OrbitControls: class {
      readonly target = new three.Vector3();
      enableDamping = false;
      readonly addEventListener = vi.fn();
      readonly update = vi.fn();
      readonly dispose = vi.fn();
    }
  };
});
function scene() {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x777777 });
  const a = new THREE.Mesh(geometry, material);
  a.userData = { item_id: '1321315X9D01A' };
  const b = new THREE.Mesh(geometry, material);
  b.position.x = 2;
  b.userData = { item_id: '1321315X9D01A' };
  const hidden = new THREE.Mesh(geometry, material);
  hidden.position.x = -2;
  hidden.userData = { item_id: '1321315X9D01A', removed_by_pose_fix: '来源明确移除' };
  root.add(a, b, hidden);
  return {
    scene: root,
    parser: {
      associations: new Map<THREE.Object3D | THREE.Material, { nodes: number } | undefined>([
        [a, { nodes: 0 }],
        [b, { nodes: 1 }],
        [hidden, { nodes: 2 }],
        [material, undefined]
      ])
    },
    a,
    b,
    hidden,
    geometry,
    material
  };
}
function row() {
  return {
    ...new BomIndex(makeStressDataset(1), 'catalog').rows.get('stress:0')!,
    partId: '1321315',
    compId: '1321315X9D01A',
    nodeIndex: 0
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-length': '3' } }))
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      readonly observe = vi.fn();
      readonly disconnect = vi.fn();
    }
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  mocks.rendererRender.mockReset();
});
describe('模型生命周期与精确位置语义', () => {
  it('读取缺省关联项、共享材质与来源移除节点，选择只影响具体位置', async () => {
    const asset = scene();
    mocks.parse.mockResolvedValue(asset);
    const host = document.createElement('div');
    host.getBoundingClientRect = () => ({ width: 640, height: 480 }) as DOMRect;
    const ready = vi.fn();
    const progress = vi.fn();
    const viewport = new ModelViewport(host, { ready, progress, selected: vi.fn() });
    await viewport.load('/test.glb');
    expect(ready).toHaveBeenCalledWith(3);
    expect(progress).toHaveBeenCalledWith(3, 3);
    expect(asset.hidden.visible).toBe(false);
    expect(viewport.select(row())).toEqual({ count: 1, level: 'occurrence' });
    expect(asset.a.material).not.toBe(asset.material);
    expect(asset.b.material).toBe(asset.material);
    viewport.ghost(true);
    expect((asset.b.material as THREE.Material).opacity).toBe(0.09);
    viewport.isolate(true);
    expect(asset.b.visible).toBe(false);
    viewport.isolate(false);
    expect(asset.b.visible).toBe(true);
    viewport.ghost(false);
    viewport.focus();
    viewport.view('front');
    viewport.view('side');
    viewport.view('top');
    viewport.view('iso');
    viewport.reset();
    expect(asset.a.material).toBe(asset.material);
    expect(asset.hidden.visible).toBe(false);
    const geometryDispose = vi.spyOn(asset.geometry, 'dispose');
    const materialDispose = vi.spyOn(asset.material, 'dispose');
    viewport.dispose();
    expect(host.querySelector('canvas')).toBeNull();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(mocks.rendererDispose).toHaveBeenCalledTimes(1);
    expect(mocks.contextLoss).toHaveBeenCalledTimes(1);
    expect(mocks.decoderDispose).toHaveBeenCalledTimes(1);
  });
  it('旧模型晚完成时释放旧资源，保留后选模型；空选择与失败明确返回', async () => {
    const first = scene();
    const second = scene();
    const dispose = vi.spyOn(first.geometry, 'dispose');
    let finish!: (value: ReturnType<typeof scene>) => void;
    mocks.parse
      .mockImplementationOnce(
        () =>
          new Promise(done => {
            finish = done;
          })
      )
      .mockResolvedValueOnce(second);
    const viewport = new ModelViewport(document.createElement('div'), {
      ready: vi.fn(),
      progress: vi.fn(),
      selected: vi.fn()
    });
    const old = viewport.load('/first.glb');
    await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalledTimes(1));
    await viewport.load('/second.glb', true);
    finish(first);
    await old;
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(viewport.select(row()).count).toBe(1);
    expect(viewport.select(null).count).toBe(0);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    await expect(viewport.load('/missing.glb')).rejects.toThrow('HTTP 404');
    viewport.dispose();
  });
});

describe('拾取与重复加载资源边界', () => {
  it('拖动不误触拾取，点击沿几何父链返回具体发生位置', async () => {
    const asset = scene();
    const geometry = new THREE.Mesh(new THREE.BoxGeometry(), asset.material);
    asset.a.add(geometry);
    mocks.parse.mockResolvedValue(asset);
    const selected = vi.fn();
    const host = document.createElement('div');
    const viewport = new ModelViewport(host, { ready: vi.fn(), progress: vi.fn(), selected });
    await viewport.load('/model.glb');
    const canvas = host.querySelector('canvas')!;
    canvas.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 600, height: 400 }) as DOMRect;
    const hits = vi
      .spyOn(THREE.Raycaster.prototype, 'intersectObjects')
      .mockReturnValue([{ distance: 1, point: new THREE.Vector3(), object: geometry }]);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 300, clientY: 200 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 310, clientY: 200 }));
    expect(selected).not.toHaveBeenCalled();
    canvas.dispatchEvent(new PointerEvent('pointerdown', { clientX: 300, clientY: 200 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 300, clientY: 200 }));
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ index: 0, partId: '1321315' }));
    expect(hits.mock.calls[0][0]).not.toContain(asset.hidden);
    hits.mockReturnValue([]);
    canvas.dispatchEvent(new PointerEvent('pointerup', { clientX: 300, clientY: 200 }));
    expect(selected).toHaveBeenCalledTimes(1);
    hits.mockRestore();
    viewport.dispose();
  });
  it('底图与高亮绘制分开，选择变化保留缓存并恢复所有原始图层', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const asset = scene();
    mocks.parse.mockResolvedValue(asset);
    const draws: Array<{ batch: boolean; selected: boolean; hidden: boolean }> = [];
    mocks.rendererRender.mockImplementation((scene: THREE.Scene) => {
      if (!scene.children.includes(asset.scene)) return;
      draws.push({
        batch: scene.children.some(object => object instanceof THREE.BatchedMesh && object.visible),
        selected: asset.a.layers.isEnabled(0),
        hidden: asset.hidden.visible
      });
    });
    const viewport = new ModelViewport(document.createElement('div'), {
      ready: vi.fn(),
      progress: vi.fn(),
      selected: vi.fn()
    });
    await viewport.load('/model.glb');
    viewport.select(row());
    frames.shift()!(0);
    expect(draws).toEqual([
      { batch: true, selected: false, hidden: false },
      { batch: false, selected: true, hidden: false }
    ]);
    viewport.select({ ...row(), nodeIndex: 1 });
    frames.shift()!(16);
    expect(draws.at(-1)).toEqual({ batch: false, selected: false, hidden: false });
    expect(draws).toHaveLength(3);
    expect(asset.a.layers.isEnabled(0)).toBe(false);
    expect(asset.b.layers.isEnabled(0)).toBe(true);
    viewport.ghost(true);
    frames.shift()!(32);
    expect(draws).toHaveLength(5);
    viewport.select(null);
    frames.shift()!(48);
    expect(draws).toHaveLength(7);
    const renderedScene = mocks.rendererRender.mock.calls.find(([scene]) =>
      (scene as THREE.Scene).children.includes(asset.scene)
    )![0] as THREE.Scene;
    expect(
      (renderedScene.children.find(object => object instanceof THREE.BatchedMesh) as THREE.BatchedMesh).material
    ).toBe(asset.material);
    viewport.dispose();
    mocks.rendererRender.mockReset();
  });
  it('隔离嵌套零件保留祖先可遍历，同时排除祖先自身几何与其他零件', async () => {
    const asset = scene();
    asset.a.add(asset.b);
    mocks.parse.mockResolvedValue(asset);
    const host = document.createElement('div');
    const viewport = new ModelViewport(host, { ready: vi.fn(), progress: vi.fn(), selected: vi.fn() });
    await viewport.load('/nested.glb');
    viewport.select({ ...row(), nodeIndex: 1 });
    viewport.isolate(true);
    expect(asset.a.visible).toBe(true);
    expect(asset.a.layers.isEnabled(0)).toBe(false);
    expect(asset.b.visible).toBe(true);
    expect(asset.b.layers.isEnabled(0)).toBe(true);
    expect(asset.hidden.visible).toBe(false);
    const hits = vi.spyOn(THREE.Raycaster.prototype, 'intersectObjects').mockReturnValue([]);
    host.querySelector('canvas')!.dispatchEvent(new PointerEvent('pointerup', { clientX: 0, clientY: 0 }));
    expect(hits.mock.calls[0][0]).toEqual([asset.b]);
    hits.mockRestore();
    viewport.isolate(false);
    expect(asset.a.visible).toBe(true);
    viewport.dispose();
  });
  it('隔离和透明状态随旧模型清空，新资产不继承上一个场景的显示模式', async () => {
    const first = scene();
    const second = scene();
    mocks.parse.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const viewport = new ModelViewport(document.createElement('div'), {
      ready: vi.fn(),
      progress: vi.fn(),
      selected: vi.fn()
    });
    await viewport.load('/first.glb');
    viewport.select(row());
    viewport.ghost(true);
    viewport.isolate(true);
    await viewport.load('/second.glb');
    expect(second.b.visible).toBe(true);
    expect(second.b.material).toBe(second.material);
    expect(second.hidden.visible).toBe(false);
    viewport.dispose();
  });
  it('连续切换二十个模型时每份几何、材质和纹理只释放一次', async () => {
    const viewport = new ModelViewport(document.createElement('div'), {
      ready: vi.fn(),
      progress: vi.fn(),
      selected: vi.fn()
    });
    const released: Array<{
      geometry: ReturnType<typeof vi.spyOn>;
      material: ReturnType<typeof vi.spyOn>;
      texture: ReturnType<typeof vi.spyOn>;
    }> = [];
    for (let index = 0; index < 20; index++) {
      const asset = scene();
      const texture = new THREE.Texture();
      asset.material.map = texture;
      released.push({
        geometry: vi.spyOn(asset.geometry, 'dispose'),
        material: vi.spyOn(asset.material, 'dispose'),
        texture: vi.spyOn(texture, 'dispose')
      });
      mocks.parse.mockResolvedValueOnce(asset);
      await viewport.load(`/model-${index}.glb`);
      viewport.select(row());
      viewport.ghost(true);
      viewport.reset();
    }
    viewport.dispose();
    for (const asset of released) {
      expect(asset.geometry).toHaveBeenCalledTimes(1);
      expect(asset.material).toHaveBeenCalledTimes(1);
      expect(asset.texture).toHaveBeenCalledTimes(1);
    }
  });
});
