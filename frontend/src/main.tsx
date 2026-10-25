import '@fontsource-variable/unbounded';
import '@fontsource-variable/manrope';
import '@fontsource/pixelify-sans/cyrillic-500.css';
import '@fontsource/pixelify-sans/latin-500.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';
import { mocksEnabled } from './shared/lib/env';

import './shared/i18n';
import './shared/lib/prefs';
import './styles/global.css';

async function bootstrap(): Promise<void> {
  if (mocksEnabled) {
    const { startMocks } = await import('./mocks/browser');
    await startMocks();
  }

  const root = document.getElementById('root');
  if (root === null) {
    throw new Error('Root element #root not found in index.html');
  }

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
