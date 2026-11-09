import { build } from 'esbuild';

await build({
  entryPoints: ['src/node-server.ts'],
  outfile: 'dist-node/server.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node26',
  packages: 'bundle',
  sourcemap: false
});
