import { fixupConfigRules } from '@eslint/compat';
import nx from '@nx/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';

const nxReact = nx.configs['flat/react'];
const { files: reactHooksFiles } = nxReact.find(config => config.plugins?.['react-hooks']);

export const reactFlatConfig = [
  ...fixupConfigRules(nxReact),
  // Nx 24.1 在 ESLint v10 下只保留 rules-of-hooks / exhaustive-deps，补回 react-hooks recommended（含 React Compiler 规则），与升级前的检查范围一致
  { files: reactHooksFiles, rules: reactHooks.configs.recommended.rules }
];
