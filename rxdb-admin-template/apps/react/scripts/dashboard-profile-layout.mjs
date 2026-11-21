import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const entries = [
  'rxdb/setup_rxdb.ts',
  'pages/dashboard-activity-source.ts',
  'pages/dashboard-model.ts',
  'backup/backup-ops.ts'
];

async function validateAppRoot(root, layout, framework) {
  for (const entry of entries) {
    const path = resolve(root, entry);
    const file = await stat(path).catch(cause => {
      throw new Error(`PROFILE_LAYOUT=${layout}，${framework} 入口不可读：${path}`, { cause });
    });
    assert(file.isFile(), `PROFILE_LAYOUT=${layout}，${framework} 入口不是文件：${path}`);
  }
}

export async function resolveProfileAppRoots({ workspace, layout = 'product', frameworks }) {
  assert(['product', 'legacy'].includes(layout), 'PROFILE_LAYOUT 必须是 product 或 legacy');
  assert(
    frameworks.every(framework => ['react', 'angular', 'vue'].includes(framework)),
    'PROFILE_FRAMEWORK 必须是 react、angular 或 vue'
  );
  const roots = {};
  for (const framework of frameworks) {
    const relative =
      layout === 'product' ? `rxdb-admin-template/apps/${framework}` : `apps/rxdb-admin-template-${framework}`;
    const root = resolve(workspace, relative, 'src/app');
    await validateAppRoot(root, layout, framework);
    roots[framework] = root;
  }
  return roots;
}
