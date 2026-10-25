import { createBrowserRouter, Navigate } from 'react-router';

import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { RedirectIfAuthed, RequireAuth } from '../features/auth/guards';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { ResetPasswordPage } from '../features/auth/ResetPasswordPage';
import { VerifyEmailPage } from '../features/auth/VerifyEmailPage';
import { CalendarPage } from '../features/calendar/CalendarPage';
import { CreateGroupPage } from '../features/groups/CreateGroupPage';
import { GroupHomeRedirect } from '../features/groups/GroupHomeRedirect';
import { GroupLayout } from '../features/groups/GroupLayout';
import { GroupPage } from '../features/groups/GroupPage';
import { InvitePage } from '../features/groups/InvitePage';
import { HomePage } from '../features/home/HomePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { StatsPage } from '../features/stats/StatsPage';
import { TaskPage } from '../features/tasks/TaskPage';
import { TasksPage } from '../features/tasks/TasksPage';
import { AppLayout } from '../layouts/AppLayout';
import { AuthLayout } from '../layouts/AuthLayout';
import { LandingPage } from '../pages/LandingPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ScrollToTop } from './ScrollToTop';

export const router = createBrowserRouter([
  {
    element: <ScrollToTop />,
    children: [
      { path: '/', element: <LandingPage /> },
      {
        element: <AuthLayout />,
        children: [
          {
            element: <RedirectIfAuthed />,
            children: [
              { path: '/login', element: <LoginPage /> },
              { path: '/register', element: <RegisterPage /> },
            ],
          },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
          { path: '/reset-password/:token', element: <ResetPasswordPage /> },
          { path: '/verify-email/:token', element: <VerifyEmailPage /> },
          { path: '/invite/:token', element: <InvitePage /> },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            children: [
              { path: '/app', element: <GroupHomeRedirect /> },
              { path: '/home', element: <HomePage /> },
              { path: '/groups/new', element: <CreateGroupPage /> },
              { path: '/settings', element: <SettingsPage /> },
              {
                path: '/g/:groupId',
                element: <GroupLayout />,
                children: [
                  { index: true, element: <Navigate to="tasks" replace /> },
                  { path: 'tasks', element: <TasksPage /> },
                  { path: 'tasks/:taskId', element: <TaskPage /> },
                  { path: 'calendar', element: <CalendarPage /> },
                  { path: 'members', element: <GroupPage /> },
                  { path: 'stats', element: <StatsPage /> },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
