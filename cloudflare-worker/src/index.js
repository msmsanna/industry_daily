// Cloudflare Worker - 硅基流动 AI 代理

export default {
  async fetch(request, env) {
    // 允许跨域（前端从 GitHub Pages 访问）
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const { articles, dateRange } = await request.json();

      if (!articles || articles.length === 0) {
        return new Response(JSON.stringify({ error: 'No articles provided' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 构建提示词
      const prompt = buildPrompt(articles, dateRange);

      // 调用硅基流动 API
      const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${env.SILICONFLOW_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'Qwen/Qwen2.5-7B-Instruct',
          messages: [
            {
              role: 'system',
              content:
                '你是一个专业的行业分析师，擅长从大量行业动态中提炼核心观点，生成高质量的行业日报。输出纯文本，不要加任何 Markdown 格式标记。',
            },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`AI API error: ${error}`);
      }

      const data = await response.json();
      const generatedContent = data.choices[0].message.content;

      return new Response(
        JSON.stringify({
          success: true,
          content: generatedContent,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: error.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  },
};

function buildPrompt(articles, dateRange) {
  const articleTexts = articles
    .map((a, i) => `[${i + 1}] ${a.title}\n${a.content || a.summary || ''}\n`)
    .join('\n');

  return `请根据以下${articles.length}条行业动态，生成一份专业的行业日报。

时间范围：${dateRange || '近期'}

原始动态：
${articleTexts}

请按以下格式输出（纯文本，不要 Markdown 格式）：

【行业摘要】
300字左右的综合摘要，概括本日行业整体态势、主要趋势和重要变化。

【行业要闻】
按重要性排序，列出10-15条核心要闻。每条格式：
标题：简洁的事件名称
核心描述：对该事件的深度分析，包括背景、影响、趋势判断等，不要简单复述原文。

要求：
1. 对相似事件进行合并，避免重复
2. 提炼核心观点，不要罗列原文
3. 每条描述要有分析深度，体现专业视角
4. 不要标注来源，不要出现"据报道""消息称"等字样
5. 输出纯文本，不要加任何 Markdown 标记`;
}
