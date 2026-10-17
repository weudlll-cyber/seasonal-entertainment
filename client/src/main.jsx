// ============================================================
// File:        main.jsx
// Path:        client/src/main.jsx
// Project:     Seasonal Entertainment
// Description: Client entry point: loads the global styles and mounts the app in the
//              browser router.
// ============================================================

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import App from './app/App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
