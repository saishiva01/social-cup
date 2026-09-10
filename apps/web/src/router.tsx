import { createBrowserRouter } from 'react-router-dom';

import { HomePage } from './routes/HomePage';
import { NotFoundPage } from './routes/NotFoundPage';
import { ResetPasswordPage } from './routes/ResetPasswordPage';
import { RootLayout } from './routes/RootLayout';
import { VerifyEmailPage } from './routes/VerifyEmailPage';

// Explicit return-type annotation: without it, tsc's declaration emit tries
// to name react-router's internal @remix-run/router type by its pnpm store
// path, which isn't portable (TS2742). ReturnType<> sidesteps that.
export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'verify-email', element: <VerifyEmailPage /> },
      { path: 'reset-password', element: <ResetPasswordPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
