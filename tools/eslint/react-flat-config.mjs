import { fixupConfigRules } from '@eslint/compat';
import nx from '@nx/eslint-plugin';

export const reactFlatConfig = fixupConfigRules(nx.configs['flat/react']);
