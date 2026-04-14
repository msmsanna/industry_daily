/**
 * Vercel Serverless Function: DELETE /api/news/[id]
 * 删除单条新闻
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createDatabase } from '../../../server/lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ success: false, error: '仅支持 DELETE 请求' });
  }

  const { id } = req.query;
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ success: false, error: '缺少有效的 ID 参数' });
  }

  try {
    const db = await createDatabase();
    await db.deleteArticle(id as string);
    return res.json({ success: true, message: '删除成功' });
  } catch (error: any) {
    console.error('删除新闻失败:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
