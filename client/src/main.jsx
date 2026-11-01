// ============================================================
// File:        main.jsx
// Path:        client/src/main.jsx
// Project:     Seasonal Entertainment
// Description: Client entry point: loads the global styles, reloads once when a page part's
//              files are gone after an update (staleChunks.js) and mounts the app in the
//              browser router.
// ============================================================

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/forms.css';
import App from './app/App.jsx';
import { reloadOnPreloadError } from './app/staleChunks.js';

reloadOnPreloadError();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
