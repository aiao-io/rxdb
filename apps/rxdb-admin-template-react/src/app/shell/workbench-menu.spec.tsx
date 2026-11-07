import { I18n } from '@aiao/rxdb-i18n';
import { describe, expect, it } from 'vitest';
import { ENTITIES } from '../entities/asset-entities';
import {
  domainEnMessages,
  domainModelEnMessages,
  domainModelZhMessages,
  domainZhMessages
} from '../i18n/domain-messages';
import { buildWorkbenchMenu } from './workbench-menu';

describe('工作台导航国际化', () => {
  it('中英文切换只改变显示名，保持菜单身份、实体与路由', async () => {
    const runtime = new I18n({
      locale: 'en',
      catalogs: [
        { locale: 'en', namespace: 'workbench', messages: domainEnMessages },
        { locale: 'zh-Hans', namespace: 'workbench', messages: domainZhMessages },
        { locale: 'en', namespace: 'rxdb-model', messages: domainModelEnMessages },
        { locale: 'zh-Hans', namespace: 'rxdb-model', messages: domainModelZhMessages }
      ],
      namespace: 'workbench'
    });
    const english = buildWorkbenchMenu(ENTITIES, runtime.t);
    expect(english.map(group => group.label)).toEqual(['Entities', 'Data']);
    expect(english[0]?.children?.map(entry => entry.label)).toEqual([
      'Assets',
      'Asset categories',
      'Maintenance records'
    ]);
    expect(english[1]?.children?.map(entry => entry.label)).toEqual(['Search', 'Backup / Restore']);
    await runtime.setLocale('zh-Hans');
    const chinese = buildWorkbenchMenu(ENTITIES, runtime.t);
    expect(chinese[0]?.children?.map(entry => entry.label)).toEqual(['资产', '资产分类', '维护记录']);
    expect(chinese.map(group => group.children?.map(({ id, route }) => ({ id, route })))).toEqual(
      english.map(group => group.children?.map(({ id, route }) => ({ id, route })))
    );
    runtime.destroy();
  });
});
