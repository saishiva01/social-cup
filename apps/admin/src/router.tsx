import { createBrowserRouter } from 'react-router-dom';

import { CafeDetailPage } from './routes/CafeDetailPage';
import { CafesPage } from './routes/CafesPage';
import { DashboardPage } from './routes/DashboardPage';
import { LoginPage } from './routes/LoginPage';
import { MemberDetailPage } from './routes/MemberDetailPage';
import { MembersPage } from './routes/MembersPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { PayoutStatementPage } from './routes/PayoutStatementPage';
import { PayoutsPage } from './routes/PayoutsPage';
import { RedemptionDetailPage } from './routes/RedemptionDetailPage';
import { RedemptionsPage } from './routes/RedemptionsPage';
import { RootLayout } from './routes/RootLayout';

// Explicit return-type annotation: without it, tsc's declaration emit tries
// to name react-router's internal @remix-run/router type by its pnpm store
// path, which isn't portable (TS2742). ReturnType<> sidesteps that.
export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'cafes', element: <CafesPage /> },
      { path: 'cafes/:id', element: <CafeDetailPage /> },
      { path: 'members', element: <MembersPage /> },
      { path: 'members/:id', element: <MemberDetailPage /> },
      { path: 'redemptions', element: <RedemptionsPage /> },
      { path: 'redemptions/:id', element: <RedemptionDetailPage /> },
      { path: 'payouts', element: <PayoutsPage /> },
      { path: 'payouts/:cafeId', element: <PayoutStatementPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
