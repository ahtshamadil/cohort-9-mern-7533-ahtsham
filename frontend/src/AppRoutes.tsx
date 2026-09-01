import { Navigate, Route, Routes } from 'react-router-dom';

import { ProtectedRoute } from './auth/ProtectedRoute';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { NoteEditorPage } from './pages/NoteEditorPage';
import { RegisterPage } from './pages/RegisterPage';

/**
 * The routes, kept apart from the router itself so tests can mount them inside
 * a MemoryRouter instead of driving the address bar.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/notes/new" element={<NoteEditorPage />} />
        <Route path="/notes/:id" element={<NoteEditorPage />} />
      </Route>

      {/* anything unrecognised goes home, and the guard decides from there */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
