import { type RxDB } from '@aiao/rxdb';
import { defineComponent, h, type Component, type Ref } from 'vue';
import { provideRxDB } from '../rxdb-vue';

export const createRxDBProviderHarness = (
  database: RxDB | Ref<RxDB | undefined> | undefined,
  child: Component
): Component =>
  defineComponent({
    setup() {
      provideRxDB(database);
      return () => h(child);
    }
  });
