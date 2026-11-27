import { InjectionToken } from '@angular/core';

export interface ApprovedCatalogConfig {
  readonly file: string;
  readonly sha256: string;
  readonly trustedDigests: readonly string[];
}

/** 运营修改目录时随构建审查摘要；历史摘要只在需要保留已安装版本时显式列入。 */
export const APPROVED_CATALOG_CONFIG = new InjectionToken<ApprovedCatalogConfig>('APPROVED_CATALOG_CONFIG', {
  factory: () => ({
    file: 'approved-apps.json',
    sha256: '0c51893e14164e7c8edb6030ef526ebe61aa15e83b30e65ec7861095c4c64d15',
    trustedDigests: ['0c51893e14164e7c8edb6030ef526ebe61aa15e83b30e65ec7861095c4c64d15']
  })
});
