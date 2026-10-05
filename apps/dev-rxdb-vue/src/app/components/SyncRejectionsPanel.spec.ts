/**
 * 被拒面板 —— Vue demo（US-218 AC#16）。
 *
 * @remarks
 * 与 `apps/dev-rxdb-supabase/src/app/sync-rejections-panel.spec.ts`、
 * `apps/dev-rxdb-react/src/app/components/SyncRejectionsPanel.spec.tsx` **逐条对齐**：
 * 三端经真的 `SyncStateHub` 上报同一份夹具，断言相同的字段与文案。
 */
import { RxDB, SyncStateHub } from '@aiao/rxdb';
import { SYNC_REJECTIONS_FIXTURE, SYNC_REJECTIONS_NEXT_ROUND_FIXTURE } from '@aiao/rxdb-test';
import { provideRxDB } from '@aiao/rxdb-vue';
import { mount } from '@vue/test-utils';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import SyncRejectionsPanel from './SyncRejectionsPanel.vue';

const render = () => {
  const hub = new SyncStateHub({ online$: new BehaviorSubject(true) });
  const rxdb = { syncState: hub } as unknown as RxDB;
  const wrapper = mount(
    defineComponent({
      setup() {
        provideRxDB(rxdb);
        return () => h(SyncRejectionsPanel);
      }
    })
  );
  const panel = (): HTMLElement => wrapper.get('[data-testid="sync-rejections-panel"]').element as HTMLElement;
  const items = (): HTMLElement[] => Array.from(panel().querySelectorAll('ul > li'));
  return { hub, panel, items };
};

describe('SyncRejectionsPanel', () => {
  it('没有被拒时显示空态文字，不渲染列表', () => {
    const { panel, items } = render();

    expect(panel().textContent).toContain('被拒的推送');
    expect(panel().textContent).toContain('最近没有被远端拒绝的推送');
    expect(items()).toHaveLength(0);
  });

  it('hub 上报后以语义列表列出实体、操作、原因、消息', async () => {
    const { hub, panel, items } = render();

    hub.reportRejections(SYNC_REJECTIONS_FIXTURE);
    await nextTick();

    expect(panel().textContent).not.toContain('最近没有被远端拒绝的推送');
    const [denied, dependency] = items();
    expect(items()).toHaveLength(2);
    for (const text of ['Todo', 'UPDATE', '无权限（42501）', SYNC_REJECTIONS_FIXTURE[0].message]) {
      expect(denied.textContent).toContain(text);
    }
    for (const text of ['TodoItem', 'INSERT', '依赖未满足（23503）', SYNC_REJECTIONS_FIXTURE[1].message]) {
      expect(dependency.textContent).toContain(text);
    }
  });

  it('下一轮被拒时整体替换', async () => {
    const { hub, items } = render();

    hub.reportRejections(SYNC_REJECTIONS_FIXTURE);
    hub.reportRejections(SYNC_REJECTIONS_NEXT_ROUND_FIXTURE);
    await nextTick();

    expect(items()).toHaveLength(1);
    expect(items()[0].textContent).toContain('已被删除（RX001）');
  });
});
