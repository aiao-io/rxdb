import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = await Promise.all(
    entries.map(entry => (entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)]))
  );
  return groups.flat();
}

export function offlineBuild() {
  let output;
  return {
    name: 'orbit-offline-build',
    configResolved(config) {
      output = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = (await walk(output))
        .filter(file => !['sw.js', 'resources.json'].includes(relative(output, file)))
        .sort();
      const resources = await Promise.all(
        files.map(async file => ({
          path: relative(output, file),
          sha256: createHash('sha256')
            .update(await readFile(file))
            .digest('hex')
        }))
      );
      const approved = JSON.parse(
        await readFile(new URL('../src/core/approved-releases.json', import.meta.url), 'utf8')
      );
      const releases = await createReleases(output, approved, files);
      const sharedSources = await Promise.all(
        ['release-cache', 'resource-scheduler', 'resource-references'].map(name =>
          readFile(new URL(`../src/core/${name}.ts`, import.meta.url), 'utf8')
        )
      );
      const shared = sharedSources
        .map(
          source =>
            ts.transpileModule(source, {
              compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
            }).outputText
        )
        .join('\n');
      const worker = await readFile(new URL('./service-worker.js', import.meta.url), 'utf8');
      const source = `const { ReleaseCache, ResourceScheduler, ResourceReferences } = (() => { const exports = {};\n${shared}\nreturn exports; })();\n${worker}`;
      const version = createHash('sha256')
        .update(JSON.stringify({ resources, releases }))
        .update(source)
        .digest('hex')
        .slice(0, 16);
      await writeFile(join(output, 'resources.json'), JSON.stringify({ version, resources, releases }, null, 2));
      await writeFile(
        join(output, 'sw.js'),
        `const BUILD = ${JSON.stringify({ version, resources, releases })};\n${source}`
      );
    }
  };
}

async function createReleases(output, approved, files) {
  const assets = await Promise.all(
    files
      .filter(file => relative(output, file).startsWith('assets/'))
      .map(async file => ({ path: relative(output, file), bytes: await readFile(file) }))
  );
  const releases = [];
  for (const release of approved) releases.push(await createRelease(output, release, assets));
  return releases;
}

async function createRelease(output, release, assets) {
  const entry = `${release.appId}.html`;
  const source = await readFile(join(output, entry), 'utf8');
  const html = source
    .replace(/((?:src|href)=["'])[^"']*?(assets\/[^"']+)(["'])/g, '$1./$2$3')
    .replace('</head>', `<meta name="desktop-release" content="${release.appId}@${release.version}"></head>`);
  const content = [{ path: entry, bytes: Buffer.from(html) }, ...assets];
  const resources = content.map(item => ({
    path: item.path,
    sha256: createHash('sha256').update(item.bytes).digest('hex')
  }));
  const definition = { appId: release.appId, version: release.version, entry, resources };
  const key = createHash('sha256').update(JSON.stringify(definition)).digest('hex');
  const target = join(output, 'releases', release.appId, release.version, key);
  for (const item of content) {
    const path = join(target, item.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, item.bytes);
  }
  const pkg = { ...definition, key };
  await writeFile(join(target, 'release.json'), JSON.stringify(pkg));
  return pkg;
}
