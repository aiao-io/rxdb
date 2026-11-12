import baseConfig from '../../eslint.config.mjs';
import { reactFlatConfig } from '../../tools/eslint/react-flat-config.mjs';

export default [{ ignores: ['.wrangler/**'] }, ...baseConfig, ...reactFlatConfig];
