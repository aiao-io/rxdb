import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface AssetConfig {
  glob?: string;
  input?: string;
  output?: string;
}

interface TargetConfig {
  dependsOn?: string[];
  outputs?: string[];
  options?: {
    allowedCommonJsDependencies?: string[];
    assets?: Array<string | AssetConfig>;
    outputPath?: string;
  };
}

interface ProjectConfig {
  targets: Record<string, TargetConfig | undefined>;
}

const project = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../project.json'), 'utf8')) as ProjectConfig;
const buildOptions = project.targets['build']?.options;

describe('Tauri build configuration', () => {
  it('ships only assets used by the wa-sqlite runtime', () => {
    expect(buildOptions?.assets).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          input: expect.stringContaining('pglite')
        })
      ])
    );
  });

  it('allows only the CommonJS dependency confirmed by the production build', () => {
    expect(buildOptions?.allowedCommonJsDependencies).toEqual(['ms']);
  });
});

/**
 * 调试窗口的入口 `devtools/devtools.html` 必须在**两条**取前端的路径上都在。
 *
 * @remarks
 * `open_devtools_window` 用 `WebviewUrl::App("devtools/devtools.html")` 打开窗口，而
 * 「App(...)」解析到哪儿取决于跑法：`tauri build` 走 `frontendDist`（磁盘产物），
 * `tauri dev` 走 `devUrl`（`nx serve` 的 dev server）。dev server **只**服务 build target
 * 的产物与 assets，不服务 `outputPath` 目录里的东西——面板产物就算已经躺在
 * `dist/.../browser/devtools/` 里，它也一个字节都不会给。
 *
 * 而且失败形态不是 404：dev server 的 SPA 回退把主应用的 `index.html` 回了过去，
 * 调试窗口于是静默启动**第二份主应用**，看起来「窗口开了、有东西」，只是永远不是面板。
 *
 * 所以判据落在接线上：面板产物必须经 `assets` 进 build（两条路径共用同一份拷贝），
 * 且 `serve` 要自己拉一次 `build-devtools`（dev server 不跑 build 的 dependsOn）。
 */
describe('DevTools 面板的接线', () => {
  const devtoolsAsset = buildOptions?.assets?.find(
    (asset): asset is AssetConfig => typeof asset !== 'string' && asset.output === './devtools/'
  );

  it('面板产物经 assets 落到 devtools/：dev server 与磁盘产物共用这一份', () => {
    expect(devtoolsAsset).toBeDefined();
    expect(devtoolsAsset?.glob).toBe('**/*');
  });

  it('build 先建面板再建应用——assets 的输入目录得先存在', () => {
    expect(project.targets['build']?.dependsOn).toContain('build-devtools');
  });

  it('serve 自己拉一次 build-devtools：dev server 不会跑 build 的 dependsOn', () => {
    expect(project.targets['serve']?.dependsOn).toContain('build-devtools');
  });

  it('面板产物落在 build 的 outputPath 之外，且与它无前缀关系', () => {
    const outputPath = buildOptions?.outputPath;
    const panelOutputs = project.targets['build-devtools']?.outputs ?? [];

    expect(outputPath).toBeDefined();
    expect(panelOutputs).toHaveLength(1);

    // 落在 outputPath **之内**，正是「build 的缓存恢复整个换掉父目录、面板连带消失」那条老 bug；
    // 互为字符串前缀（`…/x` 与 `…/x-devtools`）则是同一类判定最容易踩空的形态，一并挡掉。
    const panelPath = panelOutputs[0].replace('{workspaceRoot}/', '');
    expect(panelPath.startsWith(`${outputPath}/`)).toBe(false);
    expect(panelPath.startsWith(outputPath as string)).toBe(false);
    expect(devtoolsAsset?.input).toBe(panelPath);
  });
});
