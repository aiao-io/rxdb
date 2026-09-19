import { defineComponent, h, type Component } from 'vue';

export const createSetupHarness = (setupCallback: () => void): Component =>
  defineComponent({
    setup() {
      setupCallback();
      return () => h('span');
    }
  });
