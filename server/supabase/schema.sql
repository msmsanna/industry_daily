-- ============================================
-- Supabase 数据库 Schema
-- 行业动态系统 - 新闻表
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================

-- 创建新闻表
CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT DEFAULT '',
  url TEXT NOT NULL UNIQUE,
  content TEXT DEFAULT '',
  published_at TIMESTAMPTZ NOT NULL,  -- 发布时间
  fetched_at TIMESTAMPTZ NOT NULL,     -- 抓取时间
  tags JSONB DEFAULT '[]'::jsonb       -- 标签数组
);

-- 索引（优化查询性能）
CREATE INDEX IF NOT EXISTS idx_news_published_at ON news(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_source_id ON news(source_id);
CREATE INDEX IF NOT EXISTS idx_news_url ON news(url);  -- URL 去重用

-- 启用 RLS (Row Level Security)
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

-- 允许匿名读取（前端通过 anon key 访问）
CREATE POLICY "Allow anonymous read access" ON news
  FOR SELECT USING (true);

-- Service Role 可以执行所有操作（后端 Serverless Functions 用）
CREATE POLICY "Allow service role full access" ON news
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 可选：Reports 表（如果以后想也存到数据库）
-- ============================================
/*
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  overview TEXT DEFAULT '',
  full_content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
*/
