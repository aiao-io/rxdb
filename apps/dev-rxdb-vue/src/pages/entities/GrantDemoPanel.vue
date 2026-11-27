<script lang="ts" setup>
/**
 * 授权快照演示面板（US-029）：出在演示实体 `TenantNote` 的列表上方
 *
 * 状态文字随 `rxdb.grants.snapshot$` 变化；三个按钮见 `grant-demo.ts`。
 */
import { useI18n } from '@aiao/rxdb-i18n-vue';
import { useRxDB } from '@aiao/rxdb-vue';
import { computed, shallowRef, watchEffect } from 'vue';
import { describeSnapshot, grantPreset, seedScopedRows, type GrantDemoTarget, type GrantPreset } from './grant-demo';

const props = defineProps<{
  /** 声明了 `access.scope` 的实体与它的作用域 */
  target: GrantDemoTarget;
}>();

const { t } = useI18n();
const rxdb = useRxDB();

const snapshot = shallowRef(rxdb.grants.snapshot);
watchEffect(onCleanup => {
  const subscription = rxdb.grants.snapshot$.subscribe(next => (snapshot.value = next));
  onCleanup(() => subscription.unsubscribe());
});

/** 当前快照的状态文字 */
const status = computed(() => describeSnapshot(snapshot.value));

/** 经本地适配器落 a、b 各一行（系统写） */
const seed = (): Promise<void> => seedScopedRows(rxdb, props.target);

/** 设入一组演示授权 */
const apply = (preset: GrantPreset): Promise<void> => rxdb.grants.set(grantPreset(preset, props.target.scope));
</script>

<template>
  <section
    :aria-label="t('page.entity.grantDemo.title')"
    class="border-base-300 bg-base-200 flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2 text-sm"
    data-testid="grant-demo"
  >
    <span class="font-medium">{{ t('page.entity.grantDemo.title') }}</span>
    <span class="text-base-content/70 font-mono" data-testid="grant-demo-status">
      {{ status.kind === 'message' ? t(status.key) : status.text }}
    </span>
    <span class="flex-1"></span>
    <button class="btn btn-xs" type="button" @click="seed()">{{ t('page.entity.grantDemo.seed') }}</button>
    <button class="btn btn-xs" type="button" @click="apply('a-editable')">
      {{ t('page.entity.grantDemo.grantA') }}
    </button>
    <button class="btn btn-xs" type="button" @click="apply('a-revoked')">
      {{ t('page.entity.grantDemo.revokeA') }}
    </button>
  </section>
</template>
