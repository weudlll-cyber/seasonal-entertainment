// ============================================================
// File:        App.jsx
// Path:        client/src/app/App.jsx
// Project:     Seasonal Entertainment
// Description: The client's route table inside the session provider. Every page renders
//              inside Layout; unknown paths show the 404 page. The router itself is supplied
//              by main.jsx (or a test).
// ============================================================

import { Navigate, Route, Routes } from 'react-router';
import AdminAuditPage from '../admin/AdminAuditPage.jsx';
import AdminChatPage from '../admin/AdminChatPage.jsx';
import AdminEventsPage from '../admin/AdminEventsPage.jsx';
import AdminGamesPage from '../admin/AdminGamesPage.jsx';
import AdminInfoListPage from '../admin/AdminInfoListPage.jsx';
import AdminLayout from '../admin/AdminLayout.jsx';
import AdminUsersPage from '../admin/AdminUsersPage.jsx';
import InfoEditorPage from '../admin/InfoEditorPage.jsx';
import AccountPage from '../pages/AccountPage.jsx';
import ChatPage from '../pages/ChatPage.jsx';
import EventsPage from '../pages/EventsPage.jsx';
import GamesPage from '../pages/GamesPage.jsx';
import InfoIndexPage from '../pages/InfoIndexPage.jsx';
import InfoPage from '../pages/InfoPage.jsx';
import LandingPage from '../pages/LandingPage.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import RegisterPage from '../pages/RegisterPage.jsx';
import RequireUser from '../session/RequireUser.jsx';
import { SessionProvider } from '../session/SessionContext.jsx';
import Layout from './Layout.jsx';

export default function App() {
  return (
    <SessionProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<LandingPage />} />
          <Route path="info" element={<InfoIndexPage />} />
          <Route path="info/:slug" element={<InfoPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="games" element={<GamesPage />} />
          <Route path="chat" element={<ChatPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          <Route
            path="account"
            element={
              <RequireUser>
                <AccountPage />
              </RequireUser>
            }
          />
          <Route
            path="admin"
            element={
              <RequireUser role="admin">
                <AdminLayout />
              </RequireUser>
            }
          >
            <Route index element={<Navigate to="users" replace />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="info" element={<AdminInfoListPage />} />
            <Route path="info/:id" element={<InfoEditorPage />} />
            <Route path="events" element={<AdminEventsPage />} />
            <Route path="games" element={<AdminGamesPage />} />
            <Route path="chat" element={<AdminChatPage />} />
            <Route path="audit" element={<AdminAuditPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </SessionProvider>
  );
}
