import { createRoot } from 'react-dom/client';

import { App } from './app';
import { ThemeProvider } from './components/theme-provider';
import './index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container not found');
}

createRoot(container).render(
  <ThemeProvider>
    <App />
  </ThemeProvider>,
);
