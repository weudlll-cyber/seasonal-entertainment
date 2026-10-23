// ============================================================
// File:        App.jsx
// Path:        client/src/app/App.jsx
// Project:     Seasonal Entertainment
// Description: The client's route table inside the session provider. Every page renders
//              inside Layout, except the embedded chat (/embed/chat, no site shell, for an
//              iframe) and its login popup (/embed-login; docs/EMBED.md); unknown paths show
//              the 404 page. Heavier pages are loaded on first use (lazy). The router itself is
//              supplied by main.jsx (or a test).
// ============================================================

import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { KeyProvider } from '../keys/KeyContext.jsx';
import AccountPage from '../pages/AccountPage.jsx';
import CallsPage from '../pages/CallsPage.jsx';
import ChatPage from '../pages/ChatPage.jsx';
import EventsPage from '../pages/EventsPage.jsx';
import GamesPage from '../pages/GamesPage.jsx';
import InfoIndexPage from '../pages/InfoIndexPage.jsx';
import LandingPage from '../pages/LandingPage.jsx';
import LoginPage from '../pages/LoginPage.jsx';
import NotFoundPage from '../pages/NotFoundPage.jsx';
import RegisterPage from '../pages/RegisterPage.jsx';
import RequireUser from '../session/RequireUser.jsx';
import { SessionProvider } from '../session/SessionContext.jsx';
import { ThemeProvider } from '../theme/ThemeContext.jsx';
import Layout from './Layout.jsx';

// Loaded when first opened, each as its own chunk, so the first page of a visit does not wait
// for them (docs/DESIGN.md, "Speed"): the call page with the call service's client, the
// prices page with its chart, info pages with the Markdown renderer, the admin area and the
// embedded chat. Layout and AdminLayout hold the Suspense boundaries around their outlets.
const AdminAuditPage = lazy(() => import('../admin/AdminAuditPage.jsx'));
const AdminChatMediaPage = lazy(() => import('../admin/AdminChatMediaPage.jsx'));
const AdminChatPage = lazy(() => import('../admin/AdminChatPage.jsx'));
const AdminEmbeddingPage = lazy(() => import('../admin/AdminEmbeddingPage.jsx'));
const AdminGamesPage = lazy(() => import('../admin/AdminGamesPage.jsx'));
const AdminInfoListPage = lazy(() => import('../admin/AdminInfoListPage.jsx'));
const AdminLayout = lazy(() => import('../admin/AdminLayout.jsx'));
const AdminSettingsPage = lazy(() => import('../admin/AdminSettingsPage.jsx'));
const AdminUsersPage = lazy(() => import('../admin/AdminUsersPage.jsx'));
const CallPage = lazy(() => import('../pages/CallPage.jsx'));
const RecordingsPage = lazy(() => import('../pages/RecordingsPage.jsx'));
const EmbedChatPage = lazy(() => import('../embed/EmbedChatPage.jsx'));
const EmbedLoginPage = lazy(() => import('../embed/EmbedLoginPage.jsx'));
const InfoEditorPage = lazy(() => import('../admin/InfoEditorPage.jsx'));
const InfoPage = lazy(() => import('../pages/InfoPage.jsx'));
const PricesPage = lazy(() => import('../prices/PricesPage.jsx'));

// Test-only pages: routed by the Vite dev server only. In a production build DEV is false, so
// these and the pages' code are left out entirely.
const ChatPanelsTestPage = import.meta.env.DEV
  ? lazy(() => import('../devPages/ChatPanelsTestPage.jsx'))
  : null;
const EmbedDemoPage = import.meta.env.DEV
  ? lazy(() => import('../devPages/EmbedDemoPage.jsx'))
  : null;

export default function App() {
  return (
    <ThemeProvider>
      <SessionProvider>
        <KeyProvider>
          <Routes>
            {/* Outside the shell: their own boundaries; nothing shows for the moment it loads. */}
            <Route
              path="embed/chat"
              element={
                <Suspense>
                  <EmbedChatPage />
                </Suspense>
              }
            />
            <Route
              path="embed-login"
              element={
                <Suspense>
                  <EmbedLoginPage />
                </Suspense>
              }
            />
            <Route element={<Layout />}>
              <Route index element={<LandingPage />} />
              <Route path="info" element={<InfoIndexPage />} />
              {/* Before info/:slug: the slug "prices" is reserved on the server too. */}
              <Route path="info/prices" element={<PricesPage />} />
              <Route path="info/:slug" element={<InfoPage />} />
              <Route path="events" element={<EventsPage />} />
              <Route path="games" element={<GamesPage />} />
              <Route path="chat" element={<ChatPage />} />
              <Route path="calls" element={<CallsPage />} />
              <Route path="calls/recordings" element={<RecordingsPage />} />
              <Route path="calls/:id" element={<CallPage />} />
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
                <Route path="games" element={<AdminGamesPage />} />
                <Route path="chat" element={<AdminChatPage />} />
                <Route path="settings" element={<AdminSettingsPage />} />
                <Route path="embedding" element={<AdminEmbeddingPage />} />
                <Route path="chat-media" element={<AdminChatMediaPage />} />
                <Route path="audit" element={<AdminAuditPage />} />
              </Route>
              {ChatPanelsTestPage && (
                <Route
                  path="test/chat-panels"
                  element={
                    <Suspense>
                      <ChatPanelsTestPage />
                    </Suspense>
                  }
                />
              )}
              {EmbedDemoPage && (
                <Route
                  path="test/embed-chat"
                  element={
                    <Suspense>
                      <EmbedDemoPage />
                    </Suspense>
                  }
                />
              )}
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </KeyProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
