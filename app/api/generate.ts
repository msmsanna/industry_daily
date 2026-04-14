/**
 * Vercel Serverless Function: POST /api/generate
 * 日报生成（两步 LLM 调用：分类 → 总结）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callAI, buildClassifyPrompt, buildSummarizePrompt } from '../../server/lib/ai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: '仅支持 POST 请求' });
  }

  const { articles, dateRange } = req.body;

  if (!Array.isArray(articles) || articles.length === 0) {
    return res.status(400).json({ error: '缺少 articles 参数，或 articles 为空数组' });
  }

  try {
    console.log(`[${new Date().toLocaleString('zh-CN')}] 收到请求：${articles.length} 条动态，日期：${dateRange}`);
    console.log('--- 第一步：分类 ---');

    // ====== 第一步：分类 ======
    const classifyPrompt = buildClassifyPrompt(articles);
    const classificationResult = await callAI([
      { role: 'system', content: '你是专业的行业信息分类员。输出纯文本，不要 Markdown 格式标记。' },
      { role: 'user', content: classifyPrompt },
    ]);

    console.log(`分类完成，结果长度：${classificationResult.length} 字`);
    console.log('--- 第二步：生成总结 ---');

    // ====== 第二步：按类别总结 ======
    const summarizePrompt = buildSummarizePrompt(articles, classificationResult, dateRange);
    const generatedContent = await callAI([
      {
        role: 'system',
        content:
          '你是一个专业的行业分析师，擅长从大量行业动态中提炼核心观点，生成高质量的行业日报。输出纯文本，不要加任何 Markdown 格式标记。',
      },
      { role: 'user', content: summarizePrompt },
    ]);

    if (!generatedContent) {
      return res.status(502).json({ error: 'AI API 返回内容为空' });
    }

    console.log(`[${new Date().toLocaleString('zh-CN')}] 生成成功，内容长度：${generatedContent.length} 字`);

    return res.json({
      success: true,
      content: generatedContent,
      model: process.env.SILICONFLOW_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
      steps: ['classify', 'summarize'],
    });
  } catch (error: any) {
    console.error('日报生成失败:', error);
    return res.status(500).json({
      error: error.message || '调用 AI API 失败',
      detail: error.message,
    });
  }
}
