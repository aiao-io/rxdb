<script lang="ts" setup>
import { computed, CSSProperties, onBeforeUnmount, ref, watch } from 'vue';

// ==================== Props & Emits ====================
export interface LoadingBarProps {
  color?: string;
  shadow?: boolean;
  background?: string;
  height?: number;
  onLoaderFinished?: () => void;
  class?: string;
  containerClass?: string;
  transitionTime?: number;
  waitingTime?: number;
  style?: CSSProperties;
  containerStyle?: CSSProperties;
  shadowStyle?: CSSProperties;
}

const props = withDefaults(defineProps<LoadingBarProps>(), {
  height: 2,
  color: 'red',
  background: 'transparent',
  transitionTime: 300,
  waitingTime: 1000,
  shadow: true,
  class: '',
  containerClass: '',
  onLoaderFinished: undefined,
  style: undefined,
  containerStyle: undefined,
  shadowStyle: undefined
});

// ==================== Utils ====================
const randomValue = (min: number, max: number): number => Math.random() * (max - min) + min;

const randomInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

// ==================== Constants ====================
const DEFAULT_CONFIG = {
  REFRESH_RATE: 1000,
  Z_INDEX: 99999999999
};

// ==================== State ====================
const progress = ref(0);
const isActive = ref(false);
const isFading = ref(false);
const refreshRate = ref(DEFAULT_CONFIG.REFRESH_RATE);
const completeTimer = ref<ReturnType<typeof setTimeout> | undefined>(undefined);
const intervalId = ref<ReturnType<typeof setTimeout> | undefined>(undefined);

// ==================== Cleanup ====================
onBeforeUnmount(() => {
  if (completeTimer.value) clearTimeout(completeTimer.value);
  if (intervalId.value) clearInterval(intervalId.value);
});

// ==================== Interval Logic ====================
watch([isActive, isFading, refreshRate], ([active, fading, rate]) => {
  if (intervalId.value) {
    clearInterval(intervalId.value);
    intervalId.value = undefined;
  }

  if (active && !fading) {
    intervalId.value = setInterval(() => {
      if (progress.value >= 95) return;
      const remaining = 100 - progress.value;
      const increment = randomValue(Math.min(10, remaining / 5), Math.min(20, remaining / 3));
      progress.value = Math.min(95, progress.value + increment);
    }, rate);
  }
});

// ==================== Public Methods ====================
const continuousStart = (startingValue = randomInt(10, 20), rate = DEFAULT_CONFIG.REFRESH_RATE) => {
  if (completeTimer.value) clearTimeout(completeTimer.value);
  isActive.value = true;
  isFading.value = false;
  refreshRate.value = rate;
  progress.value = startingValue;
};

const staticStart = (startingValue = randomInt(30, 60)) => {
  if (completeTimer.value) clearTimeout(completeTimer.value);
  isActive.value = true;
  isFading.value = false;
  progress.value = startingValue;
};

const complete = () => {
  progress.value = 100;
  completeTimer.value = setTimeout(() => {
    isFading.value = true;
    completeTimer.value = setTimeout(() => {
      isActive.value = false;
      isFading.value = false;
      progress.value = 0;
      props.onLoaderFinished?.();
    }, props.transitionTime);
  }, props.waitingTime);
};

const getProgress = () => progress.value;

// ==================== Expose Methods ====================
defineExpose({
  continuousStart,
  staticStart,
  complete,
  getProgress
});

// ==================== Computed Styles ====================
const isVisible = computed(() => isActive.value || progress.value > 0);

const width = computed(() => (progress.value >= 100 || isFading.value ? '100%' : `${progress.value}%`));

const opacity = computed(() => (isFading.value ? 0 : 1));

const shadowLeft = computed(() => {
  if (progress.value >= 90) return '90%';
  if (progress.value > 0) return `${progress.value - 5.5}%`;
  return '-10rem';
});

const containerStyles = computed<CSSProperties>(() => ({
  position: 'fixed',
  top: 0,
  left: 0,
  height: `${props.height}px`,
  background: props.background,
  zIndex: DEFAULT_CONFIG.Z_INDEX,
  width: '100%',
  ...props.containerStyle
}));

const loaderStyles = computed<CSSProperties>(() => ({
  height: '100%',
  background: props.color,
  width: width.value,
  opacity: opacity.value,
  transition:
    isFading.value ? `opacity ${props.transitionTime}ms ease-out`
    : progress.value > 0 ? 'width 0.5s ease'
    : '',
  ...props.style
}));

const shadowStyles = computed<CSSProperties>(() => ({
  boxShadow: `0 0 10px ${props.color}, 0 0 5px ${props.color}`,
  width: '5%',
  opacity: 1,
  position: 'absolute',
  height: '100%',
  transform: 'rotate(2deg) translate(0px, -2px)',
  left: shadowLeft.value,
  transition: progress.value > 0 ? 'left 0.5s ease' : '',
  ...props.shadowStyle
}));
</script>

<template>
  <div
    v-if="isVisible"
    :class="containerClass"
    :style="containerStyles"
  >
    <div
      :class="props.class"
      :style="loaderStyles"
    >
      <div
        v-if="shadow"
        :style="shadowStyles"
      />
    </div>
  </div>
</template>
