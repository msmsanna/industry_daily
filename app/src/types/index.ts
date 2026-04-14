export interface Source {
  id: string;
  name: string;
  url: string;
  type: string;
  tags: string[];
  description: string;
  status: 'active' | 'inactive';
  createdAt: string;
  lastFetchedAt?: string;
}

export interface Article {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  summary: string;
  url: string;
  content: string;
  publishedAt: string;
  fetchedAt: string;
  tags: string[];
}

export interface ReportCategory {
  name: string;
  articles: { title: string; url: string; summary: string }[];
  content: string;
}

export interface Report {
  id: string;
  title: string;
  date: string;
  overview: string;
  categories: ReportCategory[];
  fullContent: string;
  createdAt: string;
}
