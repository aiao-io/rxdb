import { createBootstrapScript } from '@aiao/rxdb-admin';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { renderAppHtml } from './app-html-plugin.ts';
const template = await readFile(new URL('./index.html', import.meta.url), 'utf8');
const html = renderAppHtml(template, createBootstrapScript)
  .replace('<div id="root"></div>', '<app-root></app-root>')
  .replace('<script src="/src/main.ts" type="module"></script>', '')
  .replace('<head>', '<head><base href="/" />');
await mkdir(new URL('./.generated/', import.meta.url), { recursive: true });
await writeFile(new URL('./.generated/index.html', import.meta.url), html);
