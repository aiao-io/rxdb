export default {
  entities: ['./entities/*.entity.ts'],
  outDir: './src/app/model-designer/models',
  repositoryGenerators: ['@aiao/rxdb-plugin-tree/generator#TreeRepositoryGenerator'],
  relationQueryDeep: 10
};
