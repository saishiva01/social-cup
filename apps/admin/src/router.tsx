import { createBrowserRouter } from 'react-router-dom';

import { DashboardPage } from './routes/DashboardPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { RootLayout } from './routes/RootLayout';

// Explicit return-type annotation: without it, tsc's declaration emit tries
// to name react-router's internal @remix-run/router type by its pnpm store
// path, which isn't portable (TS2742). ReturnType<> sidesteps that.
export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
