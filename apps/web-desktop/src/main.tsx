import { createRoot } from 'react-dom/client';
import { DesktopHost } from './host/runtime.js';
import { DesktopApp } from './host/shell.js';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('桌面根节点缺失');
const host = new DesktopHost();
createRoot(root).render(<DesktopApp host={host} />);
void host.start();
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    void host.dispose();
  });
