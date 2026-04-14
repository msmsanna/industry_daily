/**
 * Vercel Serverless Function: GET /api
 * 健康检查 + 服务信息
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.json({
    status: 'ok',
    message: '行业日报生成服务运行中 (Vercel)',
    mode: process.env.USE_LOCAL_DB === 'true' ? 'local' : 'supabase',
    model: process.env.SILICONFLOW_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
    timestamp: new Date().toISOString(),
  });
}
