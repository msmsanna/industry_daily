/**
 * Vercel Serverless Function: DELETE /api/news/cleanup
 * 清理过期新闻（超过指定天数）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createDatabase } from '../../server/lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: '仅支持 DELETE 请求' });
  }

  try {
    const days = parseInt(req.query.days as string) || 180;
    const db = await createDatabase();
    const deleted = await db.cleanupOlderThan(days);
    return res.json({
      success: true,
      deleted,
      message: `已清理 ${deleted} 条 ${days} 天前的新闻`,
    });
  } catch (error: any) {
    console.error('清理新闻失败:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
