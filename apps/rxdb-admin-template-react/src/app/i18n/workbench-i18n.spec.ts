import { describe, expect, it } from 'vitest';
import { appConfig } from '../app-config';
import { bindWorkbenchDescription, createWorkbenchI18n } from './workbench-i18n';

describe('工作台共享国际化运行时', () => {
  it('应用标识来自配置，未提供翻译的定制品牌仍使用原标识', async () => {
    const runtime = createWorkbenchI18n({ ...appConfig, title: '设备管理', brandTitle: '设备', locales: undefined });
    try {
      await runtime.setLocale('en');
      expect(runtime.t('app.title')).toBe('设备管理');
      expect(runtime.t('app.brandTitle')).toBe('设备');
      expect(runtime.t('backup.title')).toBe('Backup');
      expect(runtime.resolve('entity.assets.Asset.property.name', 'rxdb-model').value).toBe('Name');
    } finally {
      runtime.destroy();
    }
  });

  it('HTML 说明随语言变化，解绑时恢复宿主原文并停止更新', async () => {
    const runtime = createWorkbenchI18n();
    const document = new DOMParser().parseFromString('<meta name="description" content="原始说明">', 'text/html');
    const stop = bindWorkbenchDescription(runtime, document);
    try {
      expect(document.querySelector('meta')?.content).toBe(appConfig.description);
      await runtime.setLocale('en');
      expect(document.querySelector('meta')?.content).toBe(appConfig.locales?.en.description);
      stop();
      expect(document.querySelector('meta')?.content).toBe('原始说明');
      await runtime.setLocale('zh-Hans');
      expect(document.querySelector('meta')?.content).toBe('原始说明');
    } finally {
      stop();
      runtime.destroy();
    }
  });
});
