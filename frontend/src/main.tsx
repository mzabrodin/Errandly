import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';

import './shared/i18n';
import './index.css';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('Root element #root not found in index.html');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
