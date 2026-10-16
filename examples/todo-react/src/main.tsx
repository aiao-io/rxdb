import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RxDBProvider } from '@aiao/rxdb-react';
import { App } from './App';
import { getRxdb } from './todo';
import './index.css';

const db = getRxdb();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RxDBProvider db={db}>
      <App />
    </RxDBProvider>
  </StrictMode>
);
