const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

const repoRoot = resolve(__dirname, '../../..');

module.exports = function llmsTxtPlugin() {
  return {
    name: 'aiao-llms-txt',
    async postBuild({ outDir, siteConfig }) {
      const { generateLlms } = await import(pathToFileURL(join(repoRoot, 'website/scripts/generate-llms.mjs')).href);
      generateLlms({ root: repoRoot, outDir, siteUrl: new URL(siteConfig.baseUrl, siteConfig.url).href });
    }
  };
};
