import { TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

import { configureServices } from '../testing/angular';
import { approveCatalog } from './approved-catalog';
import { APPROVED_CATALOG_CONFIG } from './approved-catalog-config';

it('随构建发布的目录字节匹配批准摘要；正式目录没有虚构发布版本', async () => {
  configureServices([]);
  const config = TestBed.inject(APPROVED_CATALOG_CONFIG);
  const bytes = await readFile(new URL('../../../public/approved-apps.json', import.meta.url));
  expect(config.file).toBe('approved-apps.json');
  expect(config.trustedDigests).toContain(config.sha256);
  expect(await approveCatalog(bytes, config.sha256)).toEqual({ releases: [], problems: [] });
});
