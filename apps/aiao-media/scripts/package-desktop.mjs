import { spawnSync } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
if (process.platform !== 'darwin' || process.arch !== 'arm64')
  throw new Error('当前发行目标仅验收 macOS Apple Silicon。');
const config = JSON.parse(await readFile(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'));
function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      CARGO_BUILD_JOBS: '2',
      NX_LOAD_DOT_ENV_FILES: 'false',
      NX_NO_CLOUD: 'true',
      NX_DAEMON: 'false',
      NX_ISOLATE_PLUGINS: 'false',
      ...(process.env.AIAO_DESKTOP_ENABLE_PLATFORM === 'true' ?
        {}
      : { AIAO_SUPABASE_URL: '', AIAO_SUPABASE_ANON_KEY: '' })
    }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}
run('pnpm', ['exec', 'tauri', 'build', '--bundles', 'app']);
const directory = resolve(root, 'tmp/desktop-release');
await mkdir(directory, { recursive: true });
const archive = resolve(directory, `Aiao-Media-${config.version}-macos-arm64.zip`);
run('/usr/bin/ditto', [
  '-c',
  '-k',
  '--sequesterRsrc',
  '--keepParent',
  resolve(root, 'src-tauri/target/release/bundle/macos/Aiao Media.app'),
  archive
]);
console.log(`Local desktop archive: ${archive}`);
console.log('本地产物；正式发行仍需签名、公证及安装升级验收。');
