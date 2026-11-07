import { registerBomViewParity } from '../../../modules/e2e-parity/bom-view-parity.mjs';
import { expect, test } from './fixtures.js';

registerBomViewParity(test, expect);
