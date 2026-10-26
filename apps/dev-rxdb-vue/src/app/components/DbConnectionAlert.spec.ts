import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { dbConnectionError } from '../rxdb/db-connection';
import DbConnectionAlert from './DbConnectionAlert.vue';

/**
 * @fileoverview 应用壳的数据库连接失败提示（US-221；React / Angular 端同名 spec 的移植）。
 */

afterEach(() => {
  dbConnectionError.value = null;
});

describe('DbConnectionAlert', () => {
  it('连接正常时不渲染', () => {
    const wrapper = mount(DbConnectionAlert);

    expect(wrapper.find('[data-testid="app-db-error"]').exists()).toBe(false);
  });

  it('登记了连接失败：role=alert 显示错误信息，带重新加载按钮', async () => {
    const wrapper = mount(DbConnectionAlert);
    dbConnectionError.value = 'OPFS database file "x.sqlite" is held by another context';
    await nextTick();

    const alert = wrapper.get('[data-testid="app-db-error"]');
    expect(alert.attributes('role')).toBe('alert');
    expect(alert.text()).toContain('数据库打不开');
    expect(alert.text()).toContain('is held by another context');
    expect(alert.get('button').attributes('type')).toBe('button');
    expect(alert.get('button').text()).toBe('重新加载');
  });
});
