// ============================================================
// File:        renderApp.jsx
// Path:        client/src/test/renderApp.jsx
// Project:     Seasonal Entertainment
// Description: Test helper: renders the whole app at a path (inside a MemoryRouter), as the
//              chat test files do. Async, so a test awaits it like the app's first requests.
// ============================================================

import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import App from '../app/App.jsx';

export async function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}
