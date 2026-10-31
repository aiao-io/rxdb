import { useI18n, useI18nRuntime } from '@aiao/rxdb-i18n-vue';
import { defaultModelI18n, type ModelI18n } from '@aiao/rxdb-model';

/** 订阅宿主翻译运行时；缺省使用中文文案并保留原有值格式。 */
export function useModelI18n() {
  const provided = useI18nRuntime();
  const runtime = provided ?? defaultModelI18n;
  const binding = useI18n(runtime);
  const modelRuntime: ModelI18n = {
    t: binding.t,
    changes$: runtime.changes$,
    ...(provided ? { formatDate: binding.formatDate, formatNumber: binding.formatNumber } : {})
  };
  return {
    runtime: modelRuntime,
    t: (key: string, params?: Record<string, unknown>): string => binding.t(key, params, 'rxdb-model')
  };
}
