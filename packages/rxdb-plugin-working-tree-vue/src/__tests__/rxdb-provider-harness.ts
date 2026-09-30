import { type RxDB } from '@aiao/rxdb';
import { provideRxDB, type RxDBInput } from '@aiao/rxdb-vue';
import { defineComponent, h, type Component } from 'vue';

export const createRxDBProviderHarness = (database: RxDBInput<RxDB>, child: Component): Component =>
  defineComponent({
    setup() {
      provideRxDB(database);
      return () => h(child);
    }
  });
