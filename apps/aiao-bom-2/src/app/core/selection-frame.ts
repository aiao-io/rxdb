import * as THREE from 'three';
type FrameRenderer = Pick<THREE.WebGLRenderer, 'autoClear' | 'getDrawingBufferSize' | 'setRenderTarget' | 'render'>;
export class SelectionFrame {
  private readonly target = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });
  private readonly screen = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new THREE.PlaneGeometry(2, 2);
  private readonly material = new THREE.ShaderMaterial({
    uniforms: { colorMap: { value: this.target.texture }, depthMap: { value: this.target.depthTexture } },
    vertexShader: 'varying vec2 uvCoord; void main() { uvCoord = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: 'uniform sampler2D colorMap; uniform sampler2D depthMap; varying vec2 uvCoord; void main() { gl_FragColor = texture2D(colorMap, uvCoord); gl_FragDepth = texture2D(depthMap, uvCoord).x;\n#include <colorspace_fragment>\n}',
    depthFunc: THREE.AlwaysDepth, depthWrite: true, toneMapped: false
  });
  private transform = '';
  private valid = false;
  constructor(private readonly renderer: FrameRenderer) { this.screen.add(new THREE.Mesh(this.geometry, this.material)); }
  invalidate(): void { this.valid = false; }
  render(camera: THREE.Camera, background: () => void, selection: () => void): void {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    if (size.x !== this.target.width || size.y !== this.target.height) { this.target.setSize(size.x, size.y); this.invalidate(); }
    camera.updateMatrixWorld(); const transform = [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements].join(',');
    const autoClear = this.renderer.autoClear;
    try {
      this.renderer.autoClear = true;
      if (!this.valid || transform !== this.transform) {
        this.renderer.setRenderTarget(this.target); background(); this.transform = transform; this.valid = true;
      }
      this.renderer.setRenderTarget(null); this.renderer.render(this.screen, this.camera);
      this.renderer.autoClear = false; selection();
    } finally { this.renderer.setRenderTarget(null); this.renderer.autoClear = autoClear; }
  }
  dispose(): void { this.target.dispose(); this.geometry.dispose(); this.material.dispose(); }
}
