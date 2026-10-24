import baseConfig from '../../eslint.config.mjs';
export default [...baseConfig, { ignores: ['test-results/**', 'playwright-report/**'] }];
