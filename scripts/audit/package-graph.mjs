import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { discoverRelease, scanPackages } from './lib/package-discovery.mjs';
import { auditPackageGraph } from './lib/package-graph-validation.mjs';
import { buildKnowledge, renderKnowledge } from './lib/package-knowledge.mjs';

export { queryCacheRequirements } from './lib/package-knowledge.mjs';
export { auditPackageGraph, buildKnowledge, discoverRelease, renderKnowledge, scanPackages };

export function readKnowledgeInput(root) {
  const sampleRoot = join(root, 'scripts/examples/ai-local');
  const generatorFiles = [
    join(root, 'scripts/audit/package-graph.mjs'),
    ...readdirSync(join(root, 'scripts/audit/lib'))
      .filter(name => name.startsWith('package-') && name.endsWith('.mjs'))
      .map(name => join(root, 'scripts/audit/lib', name))
  ];
  const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const tools = JSON.parse(readFileSync(join(sampleRoot, 'dev-install.json'), 'utf8'));
  const compilerDependencies = Object.fromEntries(
    tools.map(name => {
      const range = rootManifest.devDependencies[name];
      if (!range) throw new Error(`package.json: 样例编译依赖 ${name} 未声明`);
      return [name, range];
    })
  );
  return {
    compilerDependencies,
    template: readFileSync(join(root, 'scripts/audit/templates/package-knowledge.md'), 'utf8'),
    sample: readFileSync(join(sampleRoot, 'main.ts'), 'utf8'),
    compilerOptions: JSON.parse(readFileSync(join(sampleRoot, 'tsconfig.json'), 'utf8')).compilerOptions,
    install: JSON.parse(readFileSync(join(sampleRoot, 'install.json'), 'utf8')),
    generatorSources: generatorFiles.sort().map(file => readFileSync(file, 'utf8'))
  };
}

export function checkGenerated(root, rendered, update = false) {
  const outputs = [
    ['package-knowledge.json', rendered.json],
    ['package-knowledge.md', rendered.markdown]
  ];
  const errors = [];
  for (const [name, text] of outputs) {
    const file = join(root, 'requirements/generated', name);
    if (update) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, text);
      continue;
    }
    if (!existsSync(file) || readFileSync(file, 'utf8') !== text)
      errors.push(`${file}: 生成物漂移，请运行 pnpm audit:package-graph --update`);
  }
  return errors;
}

function main() {
  const rootArgument = process.argv.find(arg => arg.startsWith('--root='));
  const root = rootArgument ? resolve(rootArgument.slice('--root='.length)) : process.cwd();
  const factsPath = join(root, 'requirements/package-graph.json');
  const facts = JSON.parse(readFileSync(factsPath, 'utf8'));
  const packages = scanPackages(join(root, 'packages'));
  const errors = auditPackageGraph(facts, packages, factsPath);
  if (errors.length) throw new Error(errors.join('\n'));
  const release = discoverRelease(root);
  const input = readKnowledgeInput(root);
  const knowledge = buildKnowledge(facts, packages, release, input);
  const generated = checkGenerated(root, renderKnowledge(knowledge, input.template), process.argv.includes('--update'));
  if (generated.length) throw new Error(generated.join('\n'));
  console.log(
    `✅ 包组合门禁：登记 ${packages.length} 包，发布 ${release.packages.length} 包（${release.tag}），${knowledge.development.scenarios.length} 个情景`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
