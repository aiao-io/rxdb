import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { resolveProfileAppRoots } from './dashboard-profile-layout.mjs';

async function createWorkspace(t, paths) {
  const workspace = await mkdtemp(join(tmpdir(), 'dashboard profile-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  for (const path of paths) {
    const file = join(workspace, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, 'export {};\n');
  }
  return workspace;
}

const entries = [
  'rxdb/setup_rxdb.ts',
  'pages/dashboard-activity-source.ts',
  'pages/dashboard-model.ts',
  'backup/backup-ops.ts'
];

for (const framework of ['react', 'angular', 'vue']) {
  test(`${framework}：当前布局定位实际数据库与活动入口`, async t => {
    const root = `rxdb-admin-template/apps/${framework}/src/app`;
    const workspace = await createWorkspace(
      t,
      entries.map(entry => `${root}/${entry}`)
    );
    const roots = await resolveProfileAppRoots({ workspace, frameworks: [framework] });
    assert.deepEqual(roots, { [framework]: join(workspace, root) });
  });

  test(`${framework}：旧基线布局无需产品目录即可定位入口`, async t => {
    const root = `apps/rxdb-admin-template-${framework}/src/app`;
    const workspace = await createWorkspace(
      t,
      entries.map(entry => `${root}/${entry}`)
    );
    const roots = await resolveProfileAppRoots({ workspace, layout: 'legacy', frameworks: [framework] });
    assert.deepEqual(roots, { [framework]: join(workspace, root) });
  });
}

test('未知布局在启动浏览器前报错', async t => {
  const workspace = await createWorkspace(t, []);
  await assert.rejects(resolveProfileAppRoots({ workspace, layout: 'guess', frameworks: ['react'] }), /PROFILE_LAYOUT/);
});

test('未知框架在启动浏览器前报错', async t => {
  const workspace = await createWorkspace(t, []);
  await assert.rejects(resolveProfileAppRoots({ workspace, frameworks: ['svelte'] }), /PROFILE_FRAMEWORK/);
});

test('选错布局时拒绝自动改用另一目录，避免测错版本', async t => {
  const workspace = await createWorkspace(
    t,
    entries.map(entry => `apps/rxdb-admin-template-react/src/app/${entry}`)
  );
  await assert.rejects(
    resolveProfileAppRoots({ workspace, layout: 'product', frameworks: ['react'] }),
    /product.*react.*setup_rxdb\.ts/
  );
});

test('缺少活动源时报告具体文件，不能产出不完整测量', async t => {
  const workspace = await createWorkspace(t, ['rxdb-admin-template/apps/react/src/app/rxdb/setup_rxdb.ts']);
  await assert.rejects(resolveProfileAppRoots({ workspace, frameworks: ['react'] }), /dashboard-activity-source\.ts/);
});
