import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default [
  {
    entities: [path.join(__dirname, 'entities', '*.ts')],
    outDir: path.join(__dirname, 'dist', 'entities'),
    relationQueryDeep: 10,
    splitFiles: true
  },
  {
    entities: [path.join(__dirname, 'shop', '*.ts')],
    outDir: path.join(__dirname, 'dist', 'shop'),
    relationQueryDeep: 10,
    splitFiles: true
  }
];
