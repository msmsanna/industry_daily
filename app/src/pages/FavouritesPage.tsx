import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import type { Article } from '../types';
import { getFavourites, removeFavourite } from '../lib/storage';

export default function FavouritesPage() {
  const [favourites, setFavourites] = useState<Article[]>([]);
  const [toast, setToast] = useState('');

  useEffect(() => {
    setFavourites(getFavourites());
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleRemove = (id: string) => {
    removeFavourite(id);
    setFavourites(getFavourites());
    showToast('已取消收藏');
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'yyyy-MM-dd HH:mm');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">我的收藏</h1>
        <p className="text-slate-400 mt-1">收藏的行业动态列表</p>
      </div>

      {favourites.length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-16 h-16 mx-auto text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          <p className="text-slate-500">暂无收藏内容</p>
          <p className="text-slate-600 text-sm mt-1">在行业动态页面点击收藏按钮添加</p>
        </div>
      ) : (
        <div className="space-y-4">
          {favourites.map(article => (
            <div
              key={article.id}
              className="bg-slate-800 rounded-xl p-5 border border-slate-700 hover:border-slate-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
                      {article.sourceName}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatDate(article.publishedAt)}
                    </span>
                  </div>

                  <h3 className="text-base font-medium text-white mb-2 line-clamp-2">
                    {article.title}
                  </h3>

                  {article.summary && (
                    <p className="text-sm text-slate-400 line-clamp-2 mb-3">
                      {article.summary}
                    </p>
                  )}

                  {article.content && (
                    <p className="text-xs text-slate-500 line-clamp-3">
                      {article.content}
                    </p>
                  )}

                  {article.url && (
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 mt-3"
                    >
                      查看原文
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                </div>

                <button
                  onClick={() => handleRemove(article.id)}
                  className="flex-shrink-0 p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
                  title="取消收藏"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}