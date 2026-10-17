// ============================================================
// File:        App.jsx
// Path:        client/src/app/App.jsx
// Project:     Seasonal Entertainment
// Description: The client's route table. Every page renders inside Layout; unknown paths
//              show the 404 page. The router itself is supplied by main.jsx (or a test).
// ============================================================

import { Route, Routes } from 'react-router';
import LandingPage from '../pages/LandingPage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import Layout from './Layout.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
