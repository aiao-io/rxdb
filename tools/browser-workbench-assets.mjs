import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const assetRoot = resolve(import.meta.dirname, '../packages/browser-workbench/dist/assets');
const mime = path =>
  path.endsWith('.wasm') ? 'application/wasm'
  : path.endsWith('.json') ? 'application/json'
  : path.endsWith('.js') ? 'text/javascript'
  : 'text/plain';

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(entry => (entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]))
  );
  return paths.flat();
}

export function browserWorkbenchAssets() {
  return {
    name: 'aiao-browser-workbench-assets',
    configureServer(server) {
      server.middlewares.use('/browser-workbench-assets', async (request, response, next) => {
        const path = request.url?.split('?')[0];
        if (!path || path.includes('..') || path.includes('%')) {
          next();
          return;
        }
        const target = resolve(assetRoot, `.${path}`);
        if (!target.startsWith(`${assetRoot}/`)) {
          next();
          return;
        }
        try {
          const bytes = await readFile(target);
          response.setHeader('Content-Type', mime(target));
          response.setHeader('Access-Control-Allow-Origin', '*');
          response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          response.end(bytes);
        } catch {
          next();
        }
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use('/browser-workbench-assets', async (request, response, next) => {
        const path = request.url?.split('?')[0];
        if (!path || path.includes('..') || path.includes('%')) {
          next();
          return;
        }
        const target = resolve(assetRoot, `.${path}`);
        if (!target.startsWith(`${assetRoot}/`)) {
          next();
          return;
        }
        try {
          const bytes = await readFile(target);
          response.setHeader('Content-Type', mime(target));
          response.setHeader('Access-Control-Allow-Origin', '*');
          response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          response.end(bytes);
        } catch {
          next();
        }
      });
    },
    async generateBundle() {
      for (const path of await files(assetRoot)) {
        this.emitFile({
          type: 'asset',
          fileName: `browser-workbench-assets/${relative(assetRoot, path)}`,
          source: await readFile(path)
        });
      }
    }
  };
}
