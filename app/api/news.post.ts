/**
 * Vercel Serverless Function: POST /api/news
 * 批量添加新闻（自动基于 URL 去重）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createDatabase } from '../../server/lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: '仅支持 POST 请求' });
  }

  try {
    const { articles } = req.body;

    if (!Array.isArray(articles) || articles.length === 0) {
      return res.status(400).json({ success: false, error: '缺少 articles 参数或为空数组' });
    }

    const db = await createDatabase();
    const result = await db.addArticles(articles);

    return res.json({
      success: true,
      ...result,
      message: `添加成功 ${result.inserted} 条，跳过重复 ${result.skipped} 条`,
    });
  } catch (error: any) {
    console.error('添加新闻失败:', error);
    return res.status(500).json({ success: false, error: error.message || '服务器内部错误' });
  }
}
