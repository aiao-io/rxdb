/** 终端与工作台之间不同步、也不必监听的目录：Git 元数据、依赖、构建产物与缓存。 */
export const SYNC_IGNORED_DIRECTORIES: readonly string[] = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.angular',
  '.vite',
  '.cache',
  'coverage'
];
