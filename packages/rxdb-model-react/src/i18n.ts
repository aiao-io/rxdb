import { useI18n, useI18nRuntime } from '@aiao/rxdb-i18n-react';
import { defaultModelI18n, type ModelI18n } from '@aiao/rxdb-model';
import { useCallback, useMemo } from 'react';

/** 订阅宿主翻译运行时；缺省使用中文文案并保留原有值格式。 */
export function useModelI18n() {
  const provided = useI18nRuntime();
  const runtime = provided ?? defaultModelI18n;
  const binding = useI18n(runtime);
  const revision = runtime.changes$.value;
  const translate = binding.t;
  const formatDate = binding.formatDate;
  const formatNumber = binding.formatNumber;
  const modelRuntime = useMemo<ModelI18n>(
    () => ({
      t: translate,
      changes$: runtime.changes$,
      ...(provided ? { formatDate, formatNumber } : {})
    }),
    [provided, runtime, translate, formatDate, formatNumber]
  );
  const t = useCallback(
    (key: string, params?: Record<string, unknown>): string => {
      void revision;
      return translate(key, params, 'rxdb-model');
    },
    [translate, revision]
  );
  return { runtime: modelRuntime, t };
}
