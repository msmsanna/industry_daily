import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { isLoggedIn } from './lib/storage';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import ArticlesPage from './pages/ArticlesPage';
import SourcesPage from './pages/SourcesPage';
import ReportsPage from './pages/ReportsPage';

// Seed default 36kr source if empty
import { getSources, addSource } from './lib/storage';
import type { Source } from './types';

function seedDefaultSource() {
  const sources = getSources();
  if (sources.length === 0) {
    const defaultSource: Source = {
      id: 'default_36kr',
      name: '36氪',
      url: 'https://www.36kr.com/feed',
      type: 'RSS Feed',
      tags: ['科技', '创业', '投资'],
      description: '36氪是专注创业创新领域的媒体平台',
      status: 'inactive',
      createdAt: new Date().toISOString(),
    };
    addSource(defaultSource);
  }
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());

  useEffect(() => {
    seedDefaultSource();
  }, []);

  if (!loggedIn) {
    return <LoginPage onLogin={() => setLoggedIn(true)} />;
  }

  return (
    <BrowserRouter>
      <Layout onLogout={() => setLoggedIn(false)}>
        <Routes>
          <Route path="/" element={<Navigate to="/articles" replace />} />
          <Route path="/articles" element={<ArticlesPage />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="*" element={<Navigate to="/articles" replace />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
