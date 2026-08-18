import { type RxDB } from '@aiao/rxdb';
import { defineComponent, h, type Component } from 'vue';
import { provideRxDB, type RxDBInput } from '../rxdb-vue';

export const createRxDBProviderHarness = (database: RxDBInput<RxDB>, child: Component): Component =>
  defineComponent({
    setup() {
      provideRxDB(database);
      return () => h(child);
    }
  });
