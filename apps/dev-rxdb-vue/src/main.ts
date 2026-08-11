import { requestIdleCallbackPolyfill } from '@aiao/utils';
import { createApp } from 'vue';
import App from './app/App.vue';
import router from './router';
import './styles.css';

// Safari 不支持 requestIdleCallback
requestIdleCallbackPolyfill();

const app = createApp(App);
app.use(router);
app.mount('#root');
