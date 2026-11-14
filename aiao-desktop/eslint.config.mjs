import baseConfig from '../eslint.config.mjs';

/** 产品根只检查自己的 scripts/；apps/ 与 packages/ 下的子项目各有 lint 目标与配置。 */
export default [{ ignores: ['apps/**', 'packages/**'] }, ...baseConfig];
