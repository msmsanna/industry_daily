/**
 * AI 服务模块
 * 统一封装 LLM 调用，支持多提供商扩展
 *
 * 当前支持：硅基流动 (SiliconFlow)
 * 可扩展：OpenAI、Anthropic、DeepSeek、通义千问 等
 */

// ============================================
// 类型定义
// ============================================

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIConfig {
  provider: 'siliconflow' | 'openai' | 'anthropic' | 'deepseek';
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIProvider {
  name: string;
  chat(messages: AIMessage[], config: AIConfig): Promise<string>;
}

// ============================================
// 硅基流动 (SiliconFlow) 提供商
// ============================================

class SiliconFlowProvider implements AIProvider {
  name = 'SiliconFlow';

  async chat(messages: AIMessage[], config: AIConfig): Promise<string> {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 4000,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`AI API 错误 (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

// ============================================
// OpenAI 兼容提供商（通用）
// ============================================

class OpenAICompatibleProvider implements AIProvider {
  constructor(public readonly name: string) {}

  async chat(messages: AIMessage[], config: AIConfig): Promise<string> {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 4000,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`[${this.name}] API 错误 (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

// ============================================
// Anthropic Claude 提供商（预留）
// ============================================

class AnthropicProvider implements AIProvider {
  name = 'Anthropic';

  async chat(messages: AIMessage[], config: AIConfig): Promise<string> {
    // 转换消息格式：Anthropic 需要 system 分离
    let systemPrompt = '';
    const apiMessages: Array<{ role: string; content: string }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemPrompt += (systemPrompt ? '\n\n' : '') + msg.content;
      } else {
        apiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    const response = await fetch(`${config.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        messages: apiMessages,
        system: systemPrompt || undefined,
        max_tokens: config.maxTokens || 4096,
        temperature: config.temperature || 0.7,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`[Anthropic] API 错误 (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || '';
  }
}

// ============================================
// Provider 工厂
// ============================================

const providers: Record<string, AIProvider> = {
  siliconflow: new SiliconFlowProvider(),
  openai: new OpenAICompatibleProvider('OpenAI'),
  deepseek: new OpenAICompatibleProvider('DeepSeek'),
  anthropic: new AnthropicProvider(),
};

function getProvider(providerName: string): AIProvider {
  const p = providers[providerName.toLowerCase()];
  if (!p) {
    // 默认使用 OpenAI 兼容格式
    return new OpenAICompatibleProvider(providerName);
  }
  return p;
}

// ============================================
// 核心调用函数
// ============================================

/** 从环境变量构建配置 */
export function getAIConfig(): AIConfig {
  const apiKey = process.env.SILICONFLOW_API_KEY || '';
  if (!apiKey) {
    throw new Error('未配置 SILICONFLOW_API_KEY，请在 .env 文件中设置');
  }

  return {
    provider: (process.env.AI_PROVIDER as any) || 'siliconflow',
    apiKey,
    baseUrl: process.env.AI_BASE_URL || 'https://api.siliconflow.cn/v1',
    model: process.env.SILICONFLOW_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
    temperature: parseFloat(process.env.AI_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.AI_MAX_TOKENS || '8000'),
  };
}

/**
 * 调用 AI 模型
 * @param messages 对话消息数组
 * @param overrideConfig 可选覆盖默认配置
 */
export async function callAI(
  messages: AIMessage[],
  overrideConfig?: Partial<AIConfig>
): Promise<string> {
  const config = { ...getAIConfig(), ...overrideConfig };
  const provider = getProvider(config.provider);

  console.log(`[AI] 调用 ${provider.name}，模型：${config.model}，消息数：${messages.length}`);

  try {
    const result = await provider.chat(messages, config);
    console.log(`[AI] 返回内容长度：${result.length} 字`);
    return result;
  } catch (error) {
    console.error('[AI] 调用失败:', error);
    throw error;
  }
}

// ============================================
// 日报生成专用 Prompt
// ============================================

/**
 * 构建分类 Prompt
 */
export function buildClassifyPrompt(articles: Array<{ title: string; content?: string }>): string {
  const articleTexts = articles
    .map((a, i) => `[${i + 1}] ${a.title}\n${a.content || ''}`)
    .join('\n\n');

  return `你是行业分析师。请将以下 ${articles.length} 条动态归类到最合适的类别中。

可用类别（每条必须且只能归入一个类别）：
- 政策与监管（政策法规、标准、补贴、监管动作）
- 技术突破（技术进展、研发成果、创新产品、专利）
- 竞品/公司动态（企业战略、人事变动、合作签约、竞争格局）
- 投融资（融资、IPO、并购、投资、资本运作）
- 市场数据（销量、份额、价格、渗透率等数据发布）

输出格式（纯文本，不要 Markdown）：
政策与监管：
[序号列表]

技术突破：
[序号列表]

竞品/公司动态：
[序号列表]

投融资：
[序号列表]

市场数据：
[序号列表]
（如果某类别无内容则省略该类别标题）

原始动态：
${articleTexts}`;
}

/**
 * 构建总结 Prompt
 */
export function buildSummarizePrompt(
  articles: Array<{ title: string; content?: string }>,
  classificationResult: string,
  dateRange: string
): string {
  const articleTexts = articles
    .map((a, i) => `[${i + 1}] ${a.title}\n${a.content || ''}`)
    .join('\n\n');

  return `你是资深行业分析师。请根据以下行业动态，生成结构化、详细的专业日报。

时间范围：${dateRange || '近期'}

原始动态（每条都包含完整内容，请认真阅读并提取详细信息）：
${articleTexts}

【输出格式 - 必须严格按此结构输出】

【行业摘要】
150-200字综合摘要，概括当日行业整体态势和核心趋势。

【板块要闻】

📜 政策动态
• 必须包含：发布政策的地区/部门、政策名称、主要措施内容

🔬 技术突破
• 必须包含：技术名称、研发单位、具体进展或成果、意义

📊 市场数据
• 必须包含：数据名称、具体数值、同比/环比变化、相关行业

🏢 企业动态
• 必须包含：企业名称、企业具体动作（中标/合作/发布/裁员等）、涉及的产品/项目/市场

🌍 项目落地
• 必须包含：项目名称、投资额、建设单位、所在地、进展情况

💰 投融资
• 必须包含：融资方（谁在融资）、投资方（谁投的）、融资金额、融资轮次

【严格遵守以下规则】
1. 每个条目必须说清楚"谁"做了"什么事"，主体不能省略
2. 绝对不要编造数据，所有数据必须来自原始动态
3. 一条新闻一个条目，不要合并
4. 用中文句号和逗号，不要用英文标点
5. 条目用"• "开头
6. 如果某板块没有相关内容，该板块可以省略
7. 认真核对每个字，确保无错别字`;
}

// ============================================
// 导出
// ============================================

export default {
  callAI,
  getAIConfig,
  buildClassifyPrompt,
  buildSummarizePrompt,
  providers,
};
