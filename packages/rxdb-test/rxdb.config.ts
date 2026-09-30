import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 树实体（`@TreeEntity`）的代码生成自 US-025 阶段 E 起由插件包提供，
// 生成器包不再内置 `TreeRepository`（RV-015）。
const TREE_GENERATOR = '@aiao/rxdb-plugin-tree/generator#TreeRepositoryGenerator';

export default [
  {
    entities: [path.join(__dirname, 'entities', '*.ts')],
    outDir: path.join(__dirname, 'dist', 'entities'),
    relationQueryDeep: 10,
    repositoryGenerators: [TREE_GENERATOR],
    splitFiles: true
  },
  {
    entities: [path.join(__dirname, 'shop', '*.ts')],
    outDir: path.join(__dirname, 'dist', 'shop'),
    relationQueryDeep: 10,
    splitFiles: true
  }
];
