import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const signingIdentity = process.env.APPLE_SIGNING_IDENTITY ?? '-';
if (process.platform !== 'darwin' || process.arch !== 'arm64')
  throw new Error('当前发行目标仅验收 macOS Apple Silicon。');
const apiOrigin = process.env.AIAO_MEDIA_API_ORIGIN ?? 'https://media.aiao.io';
if (apiOrigin !== 'https://media.aiao.io') throw new Error('正式桌面发行只允许使用 https://media.aiao.io。');
const config = JSON.parse(await readFile(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'));
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      CARGO_BUILD_JOBS: '2',
      APPLE_SIGNING_IDENTITY: signingIdentity,
      NX_LOAD_DOT_ENV_FILES: 'false',
      NX_NO_CLOUD: 'true',
      NX_DAEMON: 'false',
      NX_ISOLATE_PLUGINS: 'false',
      ...(process.env.AIAO_DESKTOP_ENABLE_PLATFORM === 'true' ?
        {}
      : { AIAO_SUPABASE_URL: '', AIAO_SUPABASE_ANON_KEY: '' }),
      ...(process.env.AIAO_MEDIA_API_ORIGIN ? { AIAO_MEDIA_API_ORIGIN: process.env.AIAO_MEDIA_API_ORIGIN } : {})
    }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}
run('pnpm', ['exec', 'tauri', 'build', '--bundles', 'app,dmg']);
const directory = resolve(root, 'tmp/desktop-release');
await mkdir(directory, { recursive: true });
const dmgDirectory = resolve(root, 'src-tauri/target/release/bundle/dmg');
const dmgFiles = (await readdir(dmgDirectory)).filter(name => name.endsWith('.dmg'));
if (!dmgFiles.length) throw new Error('Tauri 未生成 DMG 发行产物。');
const app = resolve(root, 'src-tauri/target/release/bundle/macos/Aiao Media.app');
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
const archive = resolve(directory, `Aiao-Media-${config.version}-macos-arm64.zip`);
run('/usr/bin/ditto', [
  '-c',
  '-k',
  '--sequesterRsrc',
  '--keepParent',
  app,
  archive
]);
console.log(`Local desktop archive: ${archive}`);
console.log(`Local desktop DMG: ${dmgFiles.map(name => resolve(dmgDirectory, name)).join(', ')}`);
console.log(
  signingIdentity === '-' ? '本地 ad-hoc 整包签名已校验。' : '配置的 Apple 签名整包校验通过。'
);
console.log('本地产物；正式发行仍需 Developer ID、公证及安装升级验收。');
