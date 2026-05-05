import '@/lib/sentry';
import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorBusProvider } from '@/components/ErrorBus';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import UebungenPage from '@/pages/UebungenPage';
import PrEintraegePage from '@/pages/PrEintraegePage';
import PublicFormUebungen from '@/pages/public/PublicForm_Uebungen';
import PublicFormPrEintraege from '@/pages/public/PublicForm_PrEintraege';
// <public:imports>
// </public:imports>
// <custom:imports>
// </custom:imports>

export default function App() {
  return (
    <ErrorBoundary>
      <ErrorBusProvider>
        <HashRouter>
          <ActionsProvider>
            <Routes>
              <Route path="public/694d77f2ef696e8bff21287d" element={<PublicFormUebungen />} />
              <Route path="public/694d77f4b641f5b879e4e810" element={<PublicFormPrEintraege />} />
              {/* <public:routes> */}
              {/* </public:routes> */}
              <Route element={<Layout />}>
                <Route index element={<DashboardOverview />} />
                <Route path="uebungen" element={<UebungenPage />} />
                <Route path="pr-eintraege" element={<PrEintraegePage />} />
                <Route path="admin" element={<AdminPage />} />
                {/* <custom:routes> */}
                {/* </custom:routes> */}
              </Route>
            </Routes>
          </ActionsProvider>
        </HashRouter>
      </ErrorBusProvider>
    </ErrorBoundary>
  );
}
