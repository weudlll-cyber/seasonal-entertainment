// ============================================================
// File:        App.jsx
// Path:        client/src/app/App.jsx
// Project:     Seasonal Entertainment
// Description: The client's route table inside the session provider. Every page renders
//              inside Layout, except the embedded chat (/embed/chat, no site shell, for an
//              iframe) and its login popup (/embed-login; docs/EMBED.md); unknown paths show
//              the 404 page. Heavier pages are loaded on first use (lazyPage: reloads once when
//              the file is gone after an update). The router itself is supplied by main.jsx (or
//              a test). Development builds also route the test pages (devPages/), the fake game
//              of npm run dev:game-status among them.
// ============================================================

import { DEV_TEST_GAME } from '@seasonal-entertainment/shared/gameRules.js';
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
import LazyBoundary from './LazyBoundary.jsx';
import { lazyPage } from './staleChunks.js';

// Loaded when first opened, each as its own chunk, so the first page of a visit does not wait
// for them (docs/DESIGN.md, "Speed"): the call page with the call service's client, the
// prices page with its chart, info pages with the Markdown renderer, the admin area, the
// organisers' Site banner page, Manage events (the event bot's admin page), the embedded
// chat and the last step of a Discord sign-up. Layout and AdminLayout hold the boundaries (LazyBoundary) around their outlets. lazyPage reloads the page once when a part's file is gone after an update
// (staleChunks.js).
const AdminAuditPage = lazyPage(() => import('../admin/AdminAuditPage.jsx'));
const AdminChatMediaPage = lazyPage(() => import('../admin/AdminChatMediaPage.jsx'));
const AdminChatPage = lazyPage(() => import('../admin/AdminChatPage.jsx'));
const AdminDiscordPage = lazyPage(() => import('../admin/AdminDiscordPage.jsx'));
const AdminEmbeddingPage = lazyPage(() => import('../admin/AdminEmbeddingPage.jsx'));
const AdminGamesPage = lazyPage(() => import('../admin/AdminGamesPage.jsx'));
const AdminInfoListPage = lazyPage(() => import('../admin/AdminInfoListPage.jsx'));
const AdminLayout = lazyPage(() => import('../admin/AdminLayout.jsx'));
const AdminSettingsPage = lazyPage(() => import('../admin/AdminSettingsPage.jsx'));
const AdminUsersPage = lazyPage(() => import('../admin/AdminUsersPage.jsx'));
const BannerPage = lazyPage(() => import('../pages/BannerPage.jsx'));
const CallPage = lazyPage(() => import('../pages/CallPage.jsx'));
const DiscordSignupPage = lazyPage(() => import('../pages/DiscordSignupPage.jsx'));
const RecordingsPage = lazyPage(() => import('../pages/RecordingsPage.jsx'));
const StartPage = lazyPage(() => import('../pages/StartPage.jsx'));
const EmbedChatPage = lazyPage(() => import('../embed/EmbedChatPage.jsx'));
const EmbedLoginPage = lazyPage(() => import('../embed/EmbedLoginPage.jsx'));
const InfoEditorPage = lazyPage(() => import('../admin/InfoEditorPage.jsx'));
const InfoPage = lazyPage(() => import('../pages/InfoPage.jsx'));
const ManageEventsPage = lazyPage(() => import('../pages/ManageEventsPage.jsx'));
const PricesPage = lazyPage(() => import('../prices/PricesPage.jsx'));

// Test-only pages: routed by the Vite dev server only. In a production build DEV is false, so
// these and the pages' code are left out entirely.
const ChatPanelsTestPage = import.meta.env.DEV
  ? lazyPage(() => import('../devPages/ChatPanelsTestPage.jsx'))
  : null;
const EmbedDemoPage = import.meta.env.DEV
  ? lazyPage(() => import('../devPages/EmbedDemoPage.jsx'))
  : null;
const TestGamePage = import.meta.env.DEV
  ? lazyPage(() => import('../devPages/TestGamePage.jsx'))
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
                <LazyBoundary>
                  <EmbedChatPage />
                </LazyBoundary>
              }
            />
            <Route
              path="embed-login"
              element={
                <LazyBoundary>
                  <EmbedLoginPage />
                </LazyBoundary>
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
              <Route path="start" element={<StartPage />} />
              <Route path="calls" element={<CallsPage />} />
              <Route path="calls/recordings" element={<RecordingsPage />} />
              <Route path="calls/:id" element={<CallPage />} />
              <Route path="login" element={<LoginPage />} />
              <Route path="register" element={<RegisterPage />} />
              <Route path="register/discord" element={<DiscordSignupPage />} />
              <Route
                path="account"
                element={
                  <RequireUser>
                    <AccountPage />
                  </RequireUser>
                }
              />
              <Route
                path="banner"
                element={
                  <RequireUser role="organiser">
                    <BannerPage />
                  </RequireUser>
                }
              />
              <Route
                path="manage-events"
                element={
                  <RequireUser role="organiser">
                    <ManageEventsPage />
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
                <Route path="discord" element={<AdminDiscordPage />} />
                <Route path="audit" element={<AdminAuditPage />} />
              </Route>
              {ChatPanelsTestPage && (
                <Route
                  path="test/chat-panels"
                  element={
                    <LazyBoundary>
                      <ChatPanelsTestPage />
                    </LazyBoundary>
                  }
                />
              )}
              {EmbedDemoPage && (
                <Route
                  path="test/embed-chat"
                  element={
                    <LazyBoundary>
                      <EmbedDemoPage />
                    </LazyBoundary>
                  }
                />
              )}
              {TestGamePage && (
                <Route
                  path={DEV_TEST_GAME.path.slice(1)}
                  element={
                    <LazyBoundary>
                      <TestGamePage />
                    </LazyBoundary>
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
