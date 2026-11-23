import { resolveUiLocale } from '@aiao/rxdb-i18n';
import { describe, expect, it } from 'vitest';

import { BOARD_I18N_NAMESPACE, boardCatalogs, boardEnMessages, boardZhMessages, createBoardI18n } from './index.js';

describe('看板文案目录', () => {
  it('中文与英文目录键集合完全一致', () => {
    const zhKeys = Object.keys(boardZhMessages).sort();
    const enKeys = Object.keys(boardEnMessages).sort();
    expect(enKeys).toEqual(zhKeys);
    expect(boardCatalogs).toHaveLength(2);
    expect(boardCatalogs.map(catalog => catalog.locale)).toEqual(['zh-Hans', 'en']);
    expect(boardCatalogs.every(catalog => catalog.namespace === BOARD_I18N_NAMESPACE)).toBe(true);
  });

  it('目录值不使用 ICU 引号字符（ASCII 单引号）', () => {
    for (const [key, value] of Object.entries(boardEnMessages)) {
      expect(value, key).not.toContain("'");
    }
    for (const [key, value] of Object.entries(boardZhMessages)) {
      expect(value, key).not.toContain("'");
    }
  });
});

describe('createBoardI18n', () => {
  it('zh-CN 归一到 zh-Hans 并输出简体中文', () => {
    const i18n = createBoardI18n('zh-CN');
    expect(i18n.locale).toBe('zh-Hans');
    expect(i18n.t('common.cancel', {}, BOARD_I18N_NAMESPACE)).toBe('取消');
    expect(i18n.t('shell.startup.heading', {}, BOARD_I18N_NAMESPACE)).toBe('任务看板');
    expect(i18n.t('view.banner.retry', {}, BOARD_I18N_NAMESPACE)).toBe('重试');
  });

  it('en-US 归一到 en 并输出英文', () => {
    const i18n = createBoardI18n('en-US');
    expect(i18n.locale).toBe('en');
    expect(i18n.t('common.cancel', {}, BOARD_I18N_NAMESPACE)).toBe('Cancel');
    expect(i18n.t('shell.startup.heading', {}, BOARD_I18N_NAMESPACE)).toBe('Task board');
    expect(i18n.t('view.banner.retry', {}, BOARD_I18N_NAMESPACE)).toBe('Retry');
  });

  it('未知宿主语言回退 zh-Hans，省略参数时跟随宿主语言', () => {
    expect(createBoardI18n('fr-FR').locale).toBe('zh-Hans');
    // 省略 deviceLocale 时读取 globalThis.navigator.language（Node 26 带 navigator 全局）
    expect(createBoardI18n(undefined).locale).toBe(
      resolveUiLocale(globalThis.navigator?.language)
    );
  });

  it('缺失键返回键本身', () => {
    const i18n = createBoardI18n('zh-CN');
    expect(i18n.t('view.missing.key', {}, BOARD_I18N_NAMESPACE)).toBe('view.missing.key');
  });
});

describe('中文值与 e2e 断言逐字一致', () => {
  const t = createBoardI18n('zh-CN');
  const zh = (key: Parameters<typeof t.t>[0], params?: Record<string, unknown>): string =>
    t.t(key, params, BOARD_I18N_NAMESPACE);

  it('启动 / 恢复 / 准备中文案', () => {
    expect(zh('shell.startup.hint')).toBe('选择如何开始；选择前不会连接或创建任何数据。');
    expect(zh('shell.startup.restoreDesc')).toBe('选择 .rxdb 备份文件，恢复到新库后打开');
    expect(zh('shell.loading')).toBe('正在准备看板数据…');
    expect(zh('shell.restoring.switching')).toBe('正在打开恢复的看板…');
    expect(zh('shell.restoring.status')).toBe('恢复中：全部写入口已暂停。');
    expect(zh('shell.bar.restore')).toBe('从备份恢复…');
    expect(zh('shell.error.busy')).toBe('另一页面正在准备或恢复看板，请稍后重试');
  });

  it('列与任务文案', () => {
    expect(zh('view.column.overdue', { count: 1 })).toBe('逾期 1');
    expect(zh('view.columnMenu.leftmost')).toBe('已是最左列');
    expect(zh('view.column.empty.plain')).toBe('暂无任务');
    expect(zh('view.column.empty.filtered')).toBe('没有匹配筛选的任务');
    expect(zh('view.column.ariaLabel', { title: 'To do' })).toBe('列：To do');
    expect(zh('view.task.ariaLabel', { title: '写发布说明' })).toBe('任务：写发布说明');
    expect(zh('view.task.createPlaceholder')).toBe('输入标题后回车创建');
    expect(zh('view.column.namePlaceholder')).toBe('列名，如 In review');
  });

  it('筛选条文案', () => {
    expect(zh('view.toolbar.filterPlaceholder')).toBe('按关键词或字段筛选，如 label:核心 due:overdue');
    expect(zh('view.toolbar.count', { count: 4 })).toBe('4 项');
    expect(zh('view.toolbar.suggestions')).toBe('筛选补全');
  });

  it('读取失败与恢复横幅', () => {
    expect(zh('view.banner.readError', { message: 'boom' })).toBe('读取看板数据失败：boom');
    expect(zh('view.banner.restoring')).toBe('恢复进行中：浏览可用，写入口已暂停。');
  });

  it('删除确认对话框文案（e2e 断言的子串逐字在列）', () => {
    expect(zh('view.dialog.confirmTaskDelete', { title: '写发布说明' })).toBe('删除任务「写发布说明」？');
    expect(zh('view.dialog.confirmTaskImpact', { count: 2 })).toBe('将同时移除 2 条标签关联。');
    expect(zh('view.dialog.confirmColumnImpact1', { count: 4 })).toContain('4 个任务');
    expect(
      zh('view.dialog.confirmBoardImpact', { columns: 3, tasks: 4, labels: 5, taskLabels: 6 })
    ).toContain('3 列');
    expect(zh('view.dialog.confirmBoardImpact', { columns: 3, tasks: 4, labels: 5, taskLabels: 6 })).toContain(
      '4 个任务'
    );
    expect(zh('view.dialog.deleteUndoHint')).toBe('删除后可用「撤销」恢复（仅限本次会话）。');
  });

  it('操作提示文案（e2e 断言逐字一致）', () => {
    expect(zh('view.toast.backupGenerated')).toBe('备份已生成');
    expect(zh('view.toast.movedToColumn', { column: 'Doing' })).toBe('已移动到「Doing」');
    expect(zh('view.toast.sortedBy', { field: '截止日', column: 'To do' })).toBe('已按截止日排序「To do」');
    expect(zh('view.toast.sortedNoChange')).toBe('已按目标顺序排列，无变化');
    expect(zh('view.toast.deletedTask', { title: '写发布说明' })).toBe('已删除任务「写发布说明」');
  });

  it('截止日文案（e2e 断言逐字一致）', () => {
    expect(zh('view.due.overdue', { date: '2026-10-18' })).toBe('已逾期 2026-10-18');
    expect(zh('view.due.today', { date: '2026-10-19' })).toBe('今天到期 2026-10-19');
  });

  it('搜索与快捷键文案', () => {
    expect(zh('view.search.title')).toBe('搜索当前板任务');
    expect(zh('view.search.placeholder')).toBe('全文搜索标题与描述');
    expect(zh('view.search.unavailablePlugin')).toBe('搜索插件未安装');
    expect(zh('view.search.unavailableAdapter')).toBe('当前适配器不支持搜索');
    expect(zh('view.search.empty')).toBe('无匹配');
    expect(zh('view.search.more')).toBe('加载更多');
    expect(zh('view.shortcuts.group.cards')).toBe('卡片');
    expect(zh('view.shortcuts.item.closeEsc')).toBe('关闭菜单 / 对话框 / 详情');
  });
});
