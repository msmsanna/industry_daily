import { useState, useEffect } from 'react';
import { getApiBaseUrl } from '../lib/config';

// 默认的系统提示词
const DEFAULT_SYSTEM_PROMPT = `你是资深行业分析师。请根据以下行业动态，生成结构化、详细的专业日报。

时间范围：${'{dateRange}'}

原始动态（每条都包含完整内容，请认真阅读并提取详细信息）：
${'{articleTexts}'}

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

// 默认的用户提示词模板
const DEFAULT_USER_PROMPT = `【输出格式 - 必须严格按此结构输出】

【行业摘要】
（150-200字综合摘要）

【板块要闻】

📜 政策动态
• [必须包含：地区/部门、政策名称、主要措施]

🔬 技术突破
• [必须包含：技术名称、研发单位、具体进展]

📊 市场数据
• [必须包含：数据名称、数值、变化]

🏢 企业动态
• [必须包含：企业名称、具体动作]

🌍 项目落地
• [必须包含：项目名称、投资额、建设单位]

💰 投融资
• [必须包含：融资方、投资方、金额]

【规则】
1. 每个条目必须说清楚"谁"做了"什么事"
2. 不要编造数据
3. 认真核对文字，确保无错别字`;

const STORAGE_KEY = 'ai_prompt_config';

interface PromptConfig {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

const DEFAULT_CONFIG: PromptConfig = {
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  userPrompt: DEFAULT_USER_PROMPT,
  model: 'Qwen/Qwen2.5-14B-Instruct',
  temperature: 0.7,
  maxTokens: 8000,
};

export default function ConfigPage() {
  const [config, setConfig] = useState<PromptConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  const [toast, setToast] = useState('');

  // 加载保存的配置
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setConfig({ ...DEFAULT_CONFIG, ...parsed });
      } catch {
        // ignore
      }
    }
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    setSaved(true);
    showToast('配置已保存');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    if (confirm('确定要恢复默认配置吗？')) {
      setConfig(DEFAULT_CONFIG);
      localStorage.removeItem(STORAGE_KEY);
      showToast('已恢复默认配置');
    }
  };

  // 测试提示词效果
  const handleTest = async () => {
    setTesting(true);
    setTestResult('');

    try {
      const apiBase = getApiBaseUrl();

      // 模拟测试数据
      const testArticles = [
        {
          title: '宁德时代发布新一代麒麟电池',
          content: '宁德时代今日发布第三代麒麟电池，能量密度达到255Wh/kg，支持超快充电，10分钟可充满80%。该电池将于2026年Q2实现量产首先搭载于比亚迪高端车型。',
        },
        {
          title: '比亚迪获60亿元战略投资',
          content: '比亚迪宣布获得来自红杉中国、高瓴资本共计60亿元战略投资，将用于固态电池研发和海外市场拓展。本次融资为比亚迪年内第二轮融资。',
        },
      ];

      const response = await fetch(`${apiBase}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articles: testArticles,
          dateRange: '2026年4月28日',
          customSystemPrompt: config.systemPrompt,
          customUserPrompt: config.userPrompt,
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setTestResult(data.content);
      } else {
        setTestResult(`生成失败：${data.error}`);
      }
    } catch (e) {
      setTestResult(`测试失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">AI 策略配置</h1>
          <p className="text-slate-400 mt-1">自定义 AI 生成日报的提示词和参数</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            恢复默认
          </button>
          <button
            onClick={handleSave}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              saved
                ? 'bg-green-500 text-white'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {saved ? '已保存' : '保存配置'}
          </button>
        </div>
      </div>

      {/* 参数配置 */}
      <div className="bg-slate-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-white mb-4">模型参数</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">模型</label>
            <select
              value={config.model}
              onChange={(e) => setConfig({ ...config, model: e.target.value })}
              className="input w-full"
            >
              <option value="Qwen/Qwen2.5-7B-Instruct">Qwen 7B</option>
              <option value="Qwen/Qwen2.5-14B-Instruct">Qwen 14B</option>
              <option value="Qwen/Qwen2.5-32B-Instruct">Qwen 32B</option>
              <option value="Qwen/Qwen2.5-72B-Instruct">Qwen 72B</option>
              <option value="deepseek-ai/DeepSeek-V2-Chat">DeepSeek V2</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Temperature (0-1)</label>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={config.temperature}
              onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
              className="input w-full"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Max Tokens</label>
            <input
              type="number"
              min="1000"
              max="32000"
              step="1000"
              value={config.maxTokens}
              onChange={(e) => setConfig({ ...config, maxTokens: parseInt(e.target.value) })}
              className="input w-full"
            />
          </div>
        </div>
      </div>

      {/* System Prompt */}
      <div className="bg-slate-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-white">System Prompt (系统提示词)</h2>
          <span className="text-xs text-slate-500">AI 的角色设定和核心指令</span>
        </div>
        <textarea
          value={config.systemPrompt}
          onChange={(e) => setConfig({ ...config, systemPrompt: e.target.value })}
          className="input font-mono text-sm h-48"
          placeholder="输入系统提示词..."
        />
        <div className="mt-2 text-xs text-slate-500">
          可用变量：{'{dateRange}'}（日期范围）、{'{articleTexts}'}（文章内容）
        </div>
      </div>

      {/* User Prompt */}
      <div className="bg-slate-800 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-white">User Prompt (用户提示词)</h2>
          <span className="text-xs text-slate-500">实际发送给 AI 的内容模板</span>
        </div>
        <textarea
          value={config.userPrompt}
          onChange={(e) => setConfig({ ...config, userPrompt: e.target.value })}
          className="input font-mono text-sm h-48"
          placeholder="输入用户提示词..."
        />
        <div className="mt-2 text-xs text-slate-500">
          可用变量：{'{dateRange}'}、{'{articleTexts}'}、{'{classificationResult}'}
        </div>
      </div>

      {/* 测试按钮 */}
      <div className="flex justify-center mb-6">
        <button
          onClick={handleTest}
          disabled={testing}
          className="btn btn-secondary"
        >
          {testing ? '测试中...' : '测试提示词效果'}
        </button>
      </div>

      {/* 测试结果 */}
      {testResult && (
        <div className="bg-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-white mb-4">测试结果</h2>
          <pre className="whitespace-pre-wrap text-sm text-slate-300 font-mono bg-slate-900 p-4 rounded-lg max-h-96 overflow-auto">
            {testResult}
          </pre>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}