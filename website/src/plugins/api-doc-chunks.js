const apiDocModule = /[\\/](?:docs|docusaurus-plugin-content-docs[\\/]current)[\\/]api[\\/].*\.mdx?$/;
const apiDocMetadata =
  /[\\/]docusaurus-plugin-content-docs[\\/]default[\\/]site-(?:docs|i-18-n-.*-current)-api-.*\.json$/;

module.exports = function apiDocChunks() {
  return {
    name: 'api-doc-chunks',
    configureWebpack(config, isServer) {
      if (isServer || config.mode !== 'production') return;

      return {
        optimization: {
          splitChunks: {
            cacheGroups: {
              // MDX 运行时留在逐页分块会为每篇文档再生成一个同内容文件。
              mdxRuntime: {
                test: /[\\/]@mdx-js[\\/]react[\\/]/,
                chunks: 'all',
                name: 'mdx-runtime',
                enforce: true
              },
              apiDocs: {
                test: module => {
                  const path = module.nameForCondition();
                  return typeof path === 'string' && (apiDocModule.test(path) || apiDocMetadata.test(path));
                },
                chunks: chunk => /^[a-f0-9]{8}$/.test(chunk.name ?? ''),
                // 最多 256 组，保留按需加载和双语静态直达。
                name: (_module, [chunk]) => `api-docs-${chunk.name.slice(0, 2)}`,
                enforce: true
              }
            }
          }
        }
      };
    }
  };
};
