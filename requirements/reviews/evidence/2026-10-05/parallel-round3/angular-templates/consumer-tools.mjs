import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const base = path.dirname(fileURLToPath(import.meta.url));
export const environment = JSON.parse(fs.readFileSync(path.join(base, 'environment.json'), 'utf8'));
export const consumer = environment.consumerDirectory;
export const consumerRequire = createRequire(path.join(consumer, 'package.json'));
export const virtualRoot = path.join(consumer, 'framework-tests/round3-angular-templates-virtual');
export const load = specifier => import(pathToFileURL(consumerRequire.resolve(specifier)).href);
export const hash = value => createHash('sha256').update(value).digest('hex');

export function assertFrozen() {
  const inputs = JSON.parse(fs.readFileSync(path.join(base, 'consumer-inputs.json'), 'utf8'));
  const changed = Object.entries(inputs).filter(([file, expected]) => !fs.existsSync(file) || hash(fs.readFileSync(file)) !== expected).map(([file]) => file);
  if (changed.length) throw new Error(`consumer changed: ${JSON.stringify(changed)}`);
  console.log(`consumer frozen files=${Object.keys(inputs).length}, changed=0`);
}

export function recordResolution() {
  const contexts = ['@aiao/rxdb-plugin-tree-angular', '@aiao/rxdb-plugin-search-angular', '@aiao/rxdb-angular'];
  const peers = ['@aiao/rxdb', '@aiao/rxdb-angular', '@angular/core', 'rxjs'];
  const result = [];
  for (const name of contexts) {
    const entry = consumerRequire.resolve(name);
    const requireFromEntry = createRequire(entry);
    const resolutions = {};
    for (const peer of peers) {
      try { resolutions[peer] = requireFromEntry.resolve(peer); }
      catch (error) { resolutions[peer] = { error: error.message }; }
    }
    result.push({ name, entry, resolutions });
  }
  fs.writeFileSync(path.join(base, 'runtime-resolution.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
}

export function installOutputResolution() {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const parent = context.parentURL;
      const isOutput = parent?.startsWith(pathToFileURL(path.join(base, 'aot') + path.sep).href) || parent?.startsWith(pathToFileURL(path.join(base, 'jit') + path.sep).href);
      if (isOutput && !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.includes(':')) {
        return nextResolve(specifier, { ...context, parentURL: pathToFileURL(path.join(virtualRoot, 'entry.mjs')).href });
      }
      return nextResolve(specifier, context);
    }
  });
}
