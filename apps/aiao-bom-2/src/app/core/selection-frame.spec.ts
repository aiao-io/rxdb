import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { SelectionFrame } from './selection-frame';

function renderer() {
  return {
    autoClear: true,
    getDrawingBufferSize: vi.fn((size: THREE.Vector2) => size.set(640, 480)),
    setRenderTarget: vi.fn<(target: THREE.WebGLRenderTarget | null) => void>(),
    render: vi.fn<(scene: THREE.Scene, camera: THREE.Camera) => void>()
  };
}
describe('静止视角的整车底图与深度复用', () => {
  it('切换高亮只绘制选中几何，相机、尺寸和显示模式变化才更新底图', () => {
    const gpu = renderer();
    const cache = new SelectionFrame(gpu);
    const camera = new THREE.PerspectiveCamera();
    const base = vi.fn();
    const overlay = vi.fn();
    cache.render(camera, base, overlay);
    cache.render(camera, base, overlay);
    expect(base).toHaveBeenCalledTimes(1);
    expect(overlay).toHaveBeenCalledTimes(2);
    const target = gpu.setRenderTarget.mock.calls[0][0] as THREE.WebGLRenderTarget;
    expect(target.depthTexture).toBeInstanceOf(THREE.DepthTexture);
    expect(target.width).toBe(640);
    const screen = gpu.render.mock.calls[0][0] as THREE.Scene;
    const quad = screen.children[0] as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    expect(quad.material.depthWrite).toBe(true);
    expect(quad.material.depthFunc).toBe(THREE.AlwaysDepth);
    expect(quad.material.fragmentShader).toContain('gl_FragDepth');
    camera.position.x = 3;
    cache.render(camera, base, overlay);
    expect(base).toHaveBeenCalledTimes(2);
    gpu.getDrawingBufferSize.mockImplementation(size => size.set(320, 240));
    cache.render(camera, base, overlay);
    expect(base).toHaveBeenCalledTimes(3);
    cache.invalidate();
    cache.render(camera, base, overlay);
    expect(base).toHaveBeenCalledTimes(4);
    const dispose = vi.spyOn(target, 'dispose');
    const geometry = vi.spyOn(quad.geometry, 'dispose');
    const material = vi.spyOn(quad.material, 'dispose');
    cache.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(geometry).toHaveBeenCalledTimes(1);
    expect(material).toHaveBeenCalledTimes(1);
    expect(gpu.autoClear).toBe(true);
  });
  it('底图与高亮异常都恢复渲染目标和自动清屏设置，失败底图允许重试', () => {
    const gpu = renderer();
    const cache = new SelectionFrame(gpu);
    const camera = new THREE.PerspectiveCamera();
    expect(() =>
      cache.render(
        camera,
        () => {
          throw new Error('base');
        },
        vi.fn()
      )
    ).toThrow('base');
    expect(gpu.setRenderTarget).toHaveBeenLastCalledWith(null);
    expect(gpu.autoClear).toBe(true);
    const base = vi.fn();
    expect(() =>
      cache.render(camera, base, () => {
        throw new Error('overlay');
      })
    ).toThrow('overlay');
    expect(base).toHaveBeenCalledOnce();
    expect(gpu.autoClear).toBe(true);
    cache.dispose();
  });
});
