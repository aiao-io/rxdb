import { expect, test } from '@playwright/test';
import { registerBomViewParity } from '../../../modules/e2e-parity/bom-view-parity.mjs';

registerBomViewParity(test, expect);
