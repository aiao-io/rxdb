import { ENTITY_BASE_METADATA_OPTIONS, PropertyType } from '@aiao/rxdb';
import { RxDBClientGenerator } from '@aiao/rxdb-client-generator';
import { GRAPH_ENTITY_BASE_OPTIONS, GraphEntity, GraphEntityBase } from '@aiao/rxdb-plugin-graph';
import { GraphRepositoryGenerator } from '@aiao/rxdb-plugin-graph/generator';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, '..');
const workspaceRoot = path.resolve(packageRoot, '../..');
const typescriptCompiler = path.join(workspaceRoot, 'node_modules/typescript/bin/tsc');

class BasicGraphNode extends GraphEntityBase {}
GraphEntity({
  name: 'BasicGraphNode',
  properties: [{ name: 'name', type: PropertyType.string }],
  features: { graph: { type: 'directed-graph' } }
})(BasicGraphNode);

class WeightedGraphNode extends GraphEntityBase {}
GraphEntity({
  name: 'WeightedGraphNode',
  properties: [{ name: 'name', type: PropertyType.string }],
  features: { graph: { type: 'directed-graph', weight: true } }
})(WeightedGraphNode);

class PropertiesGraphNode extends GraphEntityBase {}
GraphEntity({
  name: 'PropertiesGraphNode',
  properties: [{ name: 'name', type: PropertyType.string }],
  features: {
    graph: {
      type: 'directed-graph',
      properties: [{ name: 'kind', type: PropertyType.string }]
    }
  }
})(PropertiesGraphNode);

class FullGraphNode extends GraphEntityBase {}
GraphEntity({
  name: 'FullGraphNode',
  properties: [{ name: 'name', type: PropertyType.string }],
  features: {
    graph: {
      type: 'directed-graph',
      weight: true,
      properties: [{ name: 'kind', type: PropertyType.string }]
    }
  }
})(FullGraphNode);

const generateFiles = () => {
  const generator = new RxDBClientGenerator();
  generator.registerAbstractMetadata('GraphEntityBase', [GRAPH_ENTITY_BASE_OPTIONS, ENTITY_BASE_METADATA_OPTIONS]);
  generator.registerRepositoryGenerator(new GraphRepositoryGenerator());
  [BasicGraphNode, WeightedGraphNode, PropertiesGraphNode, FullGraphNode].forEach(EntityType =>
    generator.addEntity(EntityType)
  );
  generator.exec();
  return generator.getSourceFiles();
};

const writeGeneratedFiles = async (root, sourceFiles) => {
  const generatedRoot = path.join(root, 'generated');
  await Promise.all(
    sourceFiles.map(async sourceFile => {
      const relativePath = sourceFile.getFilePath().replace(/^[/\\]+/, '');
      const outputPath = path.join(generatedRoot, relativePath);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, sourceFile.getText());
    })
  );
};

const writeConsumer = async root => {
  const consumer = `import {
  BasicGraphNode,
  FullGraphNode,
  PropertiesGraphNode,
  WeightedGraphNode
} from './generated/index.js';

const exerciseTypes = () => {
  const basic = new BasicGraphNode();
  const weighted = new WeightedGraphNode();
  const properties = new PropertiesGraphNode();
  const full = new FullGraphNode();

  void BasicGraphNode.findNeighbors({ entityId: basic.id }).then(result => result.truncated);
  void BasicGraphNode.findNeighbors$({ entityId: basic.id }).subscribe(result => result.truncated);
  void WeightedGraphNode.countNeighbors({ entityId: weighted.id });
  void WeightedGraphNode.countNeighbors$({ entityId: weighted.id }).subscribe();
  void PropertiesGraphNode.findPaths({ fromId: properties.id, toId: properties.id });
  void PropertiesGraphNode.findPaths$({ fromId: properties.id, toId: properties.id }).subscribe();
  void BasicGraphNode.addEdge(basic, basic);
  void WeightedGraphNode.addEdge(weighted, weighted, null);
  void PropertiesGraphNode.addEdge(properties, properties, undefined, null);
  void FullGraphNode.addEdge(full, full, null, { kind: 'friend' });
};

void exerciseTypes;
`;
  const tsconfig = {
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      noEmit: true,
      skipLibCheck: false,
      strict: true,
      target: 'ES2022',
      types: []
    },
    files: ['./consumer.ts']
  };

  await Promise.all([
    writeFile(path.join(root, 'consumer.ts'), consumer),
    writeFile(path.join(root, 'package.json'), JSON.stringify({ private: true, type: 'module' })),
    writeFile(path.join(root, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2))
  ]);
};

const linkCurrentPackage = async root => {
  const scopeRoot = path.join(root, 'node_modules/@aiao');
  await mkdir(scopeRoot, { recursive: true });
  await symlink(packageRoot, path.join(scopeRoot, 'rxdb-plugin-graph'), 'dir');
};

const verifyRuntime = async root => {
  const generated = await import(`${pathToFileURL(path.join(root, 'generated/index.js')).href}?gate=${Date.now()}`);
  for (const name of ['BasicGraphNode', 'WeightedGraphNode', 'PropertiesGraphNode', 'FullGraphNode']) {
    const EntityType = generated[name];
    if (typeof EntityType !== 'function' || !(EntityType.prototype instanceof GraphEntityBase)) {
      throw new Error(`Generated ESM export ${name} does not extend GraphEntityBase`);
    }
  }
};

const main = async () => {
  const root = await mkdtemp(path.join(packageRoot, '.graph-generated-consumer-'));
  try {
    await writeGeneratedFiles(root, generateFiles());
    await writeConsumer(root);
    await linkCurrentPackage(root);
    await execFileAsync(
      process.execPath,
      [typescriptCompiler, '--project', path.join(root, 'tsconfig.json'), '--pretty', 'false'],
      {
        cwd: root,
        maxBuffer: 16 * 1024 * 1024
      }
    );
    await verifyRuntime(root);
    process.stdout.write(
      'Graph generated consumer gate passed: four feature combinations, typecheck, and ESM import.\n'
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
};

await main();
