import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
const localRequire = createRequire(import.meta.url);
const toolManifest = localRequire.resolve('vue-tsc/package.json');
const toolRequire = createRequire(toolManifest);
const compilerPath = toolRequire.resolve('typescript/lib/tsc');
const compilerRequire = createRequire(compilerPath);
const paths = {
  'vue-tsc': toolManifest,
  'typescript': compilerRequire.resolve('typescript/package.json'),
  '@vue/language-core': toolRequire.resolve('@vue/language-core/package.json'),
  '@volar/typescript': toolRequire.resolve('@volar/typescript/package.json'),
  'vue': localRequire.resolve('vue/package.json'),
  'rxjs': localRequire.resolve('rxjs/package.json'),
  '@types/node': localRequire.resolve('@types/node/package.json')
};
console.log(JSON.stringify({
  node: process.version,
  nodeExecutable: process.execPath,
  compilerPath,
  compilerRealPath: realpathSync(compilerPath),
  packages: Object.fromEntries(Object.entries(paths).map(([name, path]) => [name, {
    version: JSON.parse(readFileSync(path, 'utf8')).version,
    path,
    realPath: realpathSync(path),
    manifestSha256: createHash('sha256').update(readFileSync(path)).digest('hex')
  }]))
}, null, 2));
