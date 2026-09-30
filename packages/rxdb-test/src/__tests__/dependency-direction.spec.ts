/**
 * @fileoverview `@aiao/rxdb-test` 依赖方向的门禁。
 *
 * 规则写在 `README.md`「依赖方向」一节，这里是它的机械判据：**十六个适配器与框架绑定包
 * 反向依赖本包**（见下方 `REVERSE_DEPENDENTS` 的来源说明），本包再依赖回去就是一条 back-edge，
 * Nx 图上直接成环、`run-many` 排不出拓扑序。
 *
 * 这条规则此前只以「复杂的分支、触发器和 adapter 专属清理仍保留在对应 adapter 包内」这句
 * README 散文存在，于是每次想把测试工具下沉到本包都要重新论证一遍方向对不对——三条评审
 * ⚠️（6 个测试工厂骨架、`cleanup_db` 重复实现、`cleanup_db` 不恢复单例行）就是这么卡住的。
 * 判据落成代码之后，方向是绿是红当场可判，不必再讨论。
 */

import { readFileSync } from 'node:fs';

interface DependencyManifest {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as DependencyManifest;

/**
 * 反向依赖本包的工作区包前缀。
 *
 * `@aiao/rxdb-adapter-*` 十个、框架绑定六个（`rxdb-angular` / `rxdb-react` / `rxdb-vue`
 * 与三个 `rxdb-model-*`）——它们的 `devDependencies` 里都写着 `@aiao/rxdb-test`。
 */
const REVERSE_DEPENDENT_PATTERNS: readonly RegExp[] = [
  /^@aiao\/rxdb-adapter-/,
  /^@aiao\/rxdb-(angular|react|vue)$/,
  /^@aiao\/rxdb-model-/
];

const runtimeDependencies = [
  ...Object.keys(manifest.dependencies ?? {}),
  ...Object.keys(manifest.peerDependencies ?? {})
];

describe('@aiao/rxdb-test dependency direction', () => {
  it('never depends on an adapter or framework binding package', () => {
    const backEdges = runtimeDependencies.filter(name =>
      REVERSE_DEPENDENT_PATTERNS.some(pattern => pattern.test(name))
    );
    expect(backEdges).toEqual([]);
  });

  it('keeps the allowed workspace dependencies explicit', () => {
    // 白名单而不是「只要不在黑名单就行」：新增一个工作区依赖必须在这里露面，
    // 连同「本包测的是它的契约」这个理由一起过一次 review。
    const workspaceDependencies = runtimeDependencies.filter(name => name.startsWith('@aiao/'));
    expect(workspaceDependencies.toSorted()).toEqual(['@aiao/rxdb', '@aiao/rxdb-plugin-tree']);
  });
});
