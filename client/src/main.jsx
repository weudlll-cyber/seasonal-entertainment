// ============================================================
// File:        main.jsx
// Path:        client/src/main.jsx
// Project:     Seasonal Entertainment
// Description: Client entry point: loads the global styles and mounts the landing page.
// ============================================================

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import LandingPage from './pages/LandingPage.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LandingPage />
  </StrictMode>
);
