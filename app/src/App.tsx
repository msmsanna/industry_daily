import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { isLoggedIn } from './lib/storage';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import ArticlesPage from './pages/ArticlesPage';
import SourcesPage from './pages/SourcesPage';
import ReportsPage from './pages/ReportsPage';
import FavouritesPage from './pages/FavouritesPage';
import ConfigPage from './pages/ConfigPage';

export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  if (!ready) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18 }}>
        正在加载...
      </div>
    );
  }

  if (!loggedIn) {
    return <LoginPage onLogin={() => setLoggedIn(true)} />;
  }

  return (
    <BrowserRouter>
      <Layout onLogout={() => setLoggedIn(false)}>
        <Routes>
          <Route path="/" element={<Navigate to="/articles" replace />} />
          <Route path="/articles" element={<ArticlesPage />} />
          <Route path="/favourites" element={<FavouritesPage />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/config" element={<ConfigPage />} />
          <Route path="*" element={<Navigate to="/articles" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
