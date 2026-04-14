/**
 * Vercel Serverless Function: GET /api/news
 * 分页获取新闻列表
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createDatabase } from '../../server/lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 仅允许 GET 方法
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: '仅支持 GET 请求' });
  }

  try {
    const db = await createDatabase();
    const result = await db.getArticles({
      page: parseInt(req.query.page as string) || 1,
      pageSize: parseInt(req.query.pageSize as string) || 20,
      dateFrom: req.query.dateFrom as string || '',
      dateTo: req.query.dateTo as string || '',
      keyword: req.query.keyword as string || '',
      mode: (req.query.mode as any) || 'fuzzy',
    });

    return res.json({ success: true, ...result });
  } catch (error: any) {
    console.error('查询新闻失败:', error);
    return res.status(500).json({
      success: false,
      error: error.message || '服务器内部错误',
    });
  }
}
