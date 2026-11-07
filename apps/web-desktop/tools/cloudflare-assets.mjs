import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';

const output = new URL('../dist/', import.meta.url);
const archive = new URL('../.wrangler/release-archive/', import.meta.url);
await mkdir(archive, { recursive: true });
await cp(new URL('releases/', output), archive, { recursive: true });
await cp(archive, new URL('releases/', output), { recursive: true });
const { resources } = JSON.parse(await readFile(new URL('resources.json', output), 'utf8'));
const pages = resources
  .map(({ path }) => path)
  .filter(path => path.endsWith('.html') && !path.includes('/'));
const revalidate = ['/', ...pages.map(path => `/${path}`), '/sw.js', '/resources.json'];
const immutable = ['/assets/*', '/releases/*'];
const headers = [
  ...revalidate.map(path => `${path}\n  Cache-Control: no-cache, no-transform`),
  ...immutable.map(path => `${path}\n  Cache-Control: public, max-age=31536000, immutable, no-transform`)
].join('\n\n');

await Promise.all([
  writeFile(new URL('_headers', output), `${headers}\n`),
  writeFile(new URL('_redirects', output), '/ /index.html 200\n')
]);
