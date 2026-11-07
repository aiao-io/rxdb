import { createApp } from 'vue';
import App from './app/App.vue';
import { bindWorkbenchDescription } from './app/i18n/workbench-i18n';
import { router } from './app/router';
import { bindWorkbenchNavigator, workbenchShell } from './app/shell/workbench-shell';
import './styles.css';
bindWorkbenchNavigator(url => void router.push(url));
workbenchShell.attach();
const stopDescription = bindWorkbenchDescription(workbenchShell.i18n, document);
const app = createApp(App).use(router);
app.mount('#root');
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopDescription();
    app.unmount();
    workbenchShell.destroy();
  });
}
