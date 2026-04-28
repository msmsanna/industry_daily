import type { Article, Report, ReportCategory } from '../types';
import { getApiBaseUrl, isLocalDev } from './config';

// ============================================================
// 第一步：文本工具（纯算法处理，仍然用于预处理）
// ============================================================

/** 清洗文本：去除HTML标签、URL、多余空白 */
function cleanText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/https?:\/\/[^\s，。、。；]+/gi, '')
    .replace(/[【】《》「」『』\[\]()（）【】]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 将文本分词为有意义的词组 */
function tokenize(text: string): Set<string> {
  const stopWords = new Set(['的', '了', '在', '和', '与', '为', '与', '对', '是', '以', '于', '被', '由', '将', '等', '该', '这', '那', '其', '之', '所', '而', '也', '或', '及', '的', '中', '年', '月', '日', '时', '分', '秒', '万', '亿', '个', '元', '起', '至', '从', '到']);
  const words = text.split(/[，、，。！？；：""''【】《》（）()\[\]\s,.'"]+/).filter(w => w.length >= 2 && !stopWords.has(w));
  return new Set(words);
}

/** 计算相似度（Jaccard系数） */
function similarity(a: string, b: string): number {
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function isSameEvent(a: string, b: string): boolean {
  return similarity(a, b) > 0.28;
}

// ============================================================
// 第二步：重要性打分
// ============================================================

const SIGNAL_KEYWORDS: Array<{ words: string[]; score: number }> = [
  { words: ['首次', '全球最大', '首创', '破纪录', '全球首发', '全球首', '最大规模', '历史首次'], score: 30 },
  { words: ['融资', 'IPO', '上市', '并购', '收购', '战略投资', '定向增发', 'pre-IPO'], score: 22 },
  { words: ['补贴', '工信部', '发改委', '国务院', '能源局', '财政部', '生态环境部', '自然资源部', '国家标准', '强制标准'], score: 18 },
  { words: ['突破', '创新', '量产', '发布', '推出', '全球领先', '首次实现', '通过测试', '下线', '新一代', '第二代', '全新'], score: 15 },
  { words: ['销量', '渗透率', '市占率', '份额', '交付', '出货', '装机', '同比', '环比', '季度', '月销', '年报', '榜首', '第一', '第二', '超越', '超过'], score: 12 },
  { words: ['亿元', '万吨', 'GW', 'GWh', 'MW', '工厂', '产业园', '基地', '签约', '开工', '投产', '竣工', '超级工厂', '研发中心', '中标'], score: 10 },
  { words: ['下滑', '降价', '亏损', '裁员', '遇冷', '洗牌', '退市', '召回', '违约', '诉讼'], score: 6 },
  { words: ['合作', '签约', '战略', '联合', '共建', '生态', '联盟', '牵手'], score: 5 },
];

function importanceScore(article: Article): number {
  const text = (article.title + ' ' + (article.summary || '') + ' ' + (article.content || '')).toLowerCase();
  let score = 0;
  for (const { words, score: pts } of SIGNAL_KEYWORDS) {
    if (words.some(w => text.includes(w))) score += pts;
  }
  const contentLen = (article.content || '').length;
  if (contentLen > 500) score += 12;
  else if (contentLen > 200) score += 7;
  else if (contentLen > 50) score += 3;
  const sentences = (article.content || article.summary || '').split(/[。！？]/).filter(s => s.trim().length > 10);
  if (sentences.length >= 5) score += 8;
  else if (sentences.length >= 3) score += 4;
  return score;
}

// ============================================================
// 第三步：去重
// ============================================================

function deduplicate(articles: Article[]): Article[] {
  if (articles.length <= 1) return articles;
  const result: Article[] = [];
  for (const article of articles) {
    const isDupe = result.some(existing => isSameEvent(existing.title, article.title));
    if (!isDupe) {
      result.push(article);
    } else {
      const dupeIdx = result.findIndex(e => isSameEvent(e.title, article.title));
      if (dupeIdx !== -1) {
        const existing = result[dupeIdx];
        const existingContent = (existing.content || '').length + (existing.summary || '').length;
        const newContent = (article.content || '').length + (article.summary || '').length;
        if (newContent > existingContent) {
          result[dupeIdx] = article;
        }
      }
    }
  }
  return result;
}

// ============================================================
// 第四步：聚类
// ============================================================

function clusterArticles(articles: Article[]): Article[][] {
  if (articles.length === 0) return [];
  const clusters: Article[][] = [];
  const assigned = new Set<string>();
  for (const article of articles) {
    if (assigned.has(article.id)) continue;
    const group: Article[] = [article];
    assigned.add(article.id);
    for (const other of articles) {
      if (assigned.has(other.id)) continue;
      if (isSameEvent(article.title, other.title) || isSameEvent(article.title + article.summary, other.title + other.summary)) {
        group.push(other);
        assigned.add(other.id);
      }
    }
    clusters.push(group);
  }
  return clusters;
}

// ============================================================
// 第五步：提取综合描述（算法版，用于给 AI 发送的上下文）
// ============================================================

function extractMetrics(text: string): string[] {
  const patterns = [/[\d.]+%/g, /[\d.]+\s*[亿万千百]+/g, /[\d.]+\s*[倍]/g, /[\d.]+\s*[GW|MW|kWh|GWh]/gi];
  const metrics: string[] = [];
  for (const p of patterns) {
    const matches = text.match(p);
    if (matches) metrics.push(...matches);
  }
  return [...new Set(metrics)];
}

function extractSentences(text: string, maxCount = 10): string[] {
  const sentences = text.split(/[。！？\n]+/).map(s => cleanText(s)).filter(s => s.length > 8);
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const s of sentences) {
    const key = s.slice(0, 15);
    if (!seen.has(key)) { seen.add(key); unique.push(s); }
  }
  return unique.slice(0, maxCount);
}

function synthesizeEventDescription(articles: Article[]): string {
  if (articles.length === 0) return '';
  const main = articles.reduce((best, a) => importanceScore(a) > importanceScore(best) ? a : best);
  const mainTitle = cleanText(main.title);
  const mainContent = cleanText(main.summary || main.content || '');
  const allContents = articles.map(a => cleanText(a.summary || a.content || '')).filter(Boolean);
  const mainSentences = extractSentences(mainContent, 6);
  const meaningful = mainSentences.filter(s => {
    const overlap = s.split('').filter(c => mainTitle.includes(c)).length;
    return overlap / Math.max(s.length, 1) < 0.55;
  });
  let description = '';
  if (meaningful.length > 0) {
    const withMetrics = meaningful.find(s => extractMetrics(s).length > 0);
    const primary = withMetrics || meaningful[0];
    description = primary.slice(0, 90);
    if (primary.length > 90) description = description.replace(/[,，]\s*$/, '') + '……';
  }
  if (!description || description.length < 15) {
    for (const content of allContents) {
      const sentences = extractSentences(content, 4);
      const good = sentences.find(s => !s.includes(mainTitle.slice(0, 10)));
      if (good && good.length > 10) {
        description = good.slice(0, 90) + (good.length > 90 ? '……' : '');
        break;
      }
    }
  }
  if (!description) description = mainTitle;
  description = description.replace(/https?:\/\/[^\s，。、。；]+/gi, '').trim();
  return description;
}

// ============================================================
// 生成摘要（算法版备用）
// ============================================================

function generateOverview(topItems: Array<{ title: string; description: string; score: number }>, dateLabel: string, totalDeduplicated: number, totalOriginal: number): string {
  if (topItems.length === 0) return `${dateLabel}，未筛选出符合条件的资讯。`;
  const topicKeywords = [
    ['固态电池', '固态'], ['电池', '锂电池'], ['氢能', '氢燃料'], ['电动车', '电动汽车', '新能源车'],
    ['AI', '人工智能', '大模型'], ['销量', '市场', '渗透率'], ['政策', '补贴', '标准'],
    ['融资', 'IPO', '上市'], ['技术', '突破', '研发'], ['充电', '续航', '快充'],
    ['特斯拉', '比亚迪', '宁德'], ['量产', '量产'], ['出海', '海外', '国际化'],
  ];
  const topicCounter = new Map<string, { keyword: string; count: number; desc: string }>();
  for (const item of topItems) {
    const text = (item.title + ' ' + item.description).toLowerCase();
    for (const kws of topicKeywords) {
      if (kws.some(k => text.includes(k.toLowerCase()))) {
        const primaryKw = kws[0];
        const existing = topicCounter.get(primaryKw);
        if (existing) { existing.count++; }
        else { topicCounter.set(primaryKw, { keyword: primaryKw, count: 1, desc: item.description.slice(0, 30) }); }
      }
    }
  }
  const topTopics = [...topicCounter.values()].sort((a, b) => b.count - a.count).slice(0, 3);
  const positiveSignals = ['突破', '创新', '增长', '加速', '扩大', '强劲', '上涨', '扩张', '深化', '史上', '首次', '全球最大'];
  const negativeSignals = ['下滑', '降价', '亏损', '裁员', '遇冷', '洗牌', '萎缩', '低迷', '放缓', '收缩'];
  let positiveCount = 0, negativeCount = 0;
  for (const item of topItems) {
    const text = item.title + ' ' + item.description;
    if (positiveSignals.some(k => text.includes(k))) positiveCount++;
    if (negativeSignals.some(k => text.includes(k))) negativeCount++;
  }
  let tone = '';
  if (positiveCount > negativeCount * 1.5) tone = '整体偏积极，';
  else if (negativeCount > positiveCount * 1.5) tone = '部分领域面临调整压力，';
  else tone = '多空信号并存，';
  const topicParts: string[] = [];
  for (const t of topTopics) {
    if (t.count >= 2) {
      topicParts.push(`${t.keyword}领域${t.count}条动态${t.desc ? '：' + t.desc : ''}`);
    }
  }
  const parts: string[] = [];
  parts.push(`${dateLabel}，共抓取原始动态${totalOriginal}条，经去重聚类后保留${totalDeduplicated}条，综合筛选出${topItems.length}条重要资讯。`);
  parts.push(tone + '值得关注的重点包括：' + topicParts.join('；') + '。');
  let overview = parts.join('');
  if (overview.length > 340) overview = overview.slice(0, 337) + '……';
  return overview;
}

function formatDate(date: string): string {
  return date.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日');
}

// ============================================================
// 主函数：AI 生成日报（调用 Cloudflare Worker）
// ============================================================

interface GenerateResult {
  success: boolean;
  report?: Report;
  error?: string;
}

/** 进度回调 */
type ProgressCallback = (step: string, detail?: string) => void;

/**
 * 使用 AI 生成日报
 * 流程：预处理（去重聚类）→ 发给后端（AI处理）→ 解析结果 → 返回日报
 * @param articles 动态列表（后端已限制最多100条）
 * @param date 日期
 * @param truncatedNote 截断提示（如有）
 * @param onProgress 进度回调，用于 UI 展示实时状态
 */
export async function generateReportWithAI(
  articles: Article[],
  date: string,
  truncatedNote: string = '',
  onProgress?: ProgressCallback,
): Promise<GenerateResult> {
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const dateLabel = formatDate(date);
  const TOP_N = 12;

  try {
    // ========== 步骤1：预处理（算法端完成） ==========
    onProgress?.('preprocess', '正在去重聚类…');
    
    // 去重
    const deduplicated = deduplicate(articles);

    // 聚类
    const clusters = clusterArticles(deduplicated);

    onProgress?.('preprocess', `已处理 ${deduplicated.length} 条，聚类 ${clusters.length} 组…`);

    // 为每个簇生成综合条目
    const enrichedItems = clusters.map(group => {
      const main = group.reduce((best, a) => a.title.length > best.title.length ? a : best);

      // 合并该组所有文章的完整内容，供 AI 分析使用
      const fullContent = group
        .map(a => {
          const title = cleanText(a.title);
          const summary = cleanText(a.summary || '');
          const content = cleanText(a.content || '');
          return `[${title}]\n${summary}\n${content}`;
        })
        .join('\n\n---\n\n');

      return {
        title: cleanText(main.title),
        description: synthesizeEventDescription(group), // 保留给前端展示用
        fullContent, // 完整内容用于 AI 生成详细日报
        score: importanceScore(main),
        group,
      };
    });

    // 按重要性排序，取 TOP N
    const topItems = [...enrichedItems].sort((a, b) => b.score - a.score).slice(0, TOP_N);

    onProgress?.('preprocess', `已筛选 ${topItems.length} 条重要资讯`);

    // 准备发送给 AI 的数据（使用完整内容，生成详细日报）
    const articlesForAI = topItems.map(item => ({
      title: item.title,
      content: item.fullContent,
    }));

    // 读取自定义 AI 配置
    const STORAGE_KEY = 'ai_prompt_config';
    let customConfig: any = {};
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        customConfig = JSON.parse(stored);
      }
    } catch {
      // ignore
    }

    // ========== 步骤2：调用后端 API ==========
    const apiBase = getApiBaseUrl();
    let response;
    try {
      onProgress?.('ai_classify', 'AI 正在生成日报…');
      response = await fetch(`${apiBase}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articles: articlesForAI,
          dateRange: dateLabel,
          // 传递自定义配置
          customSystemPrompt: customConfig.systemPrompt,
          customUserPrompt: customConfig.userPrompt,
          model: customConfig.model,
          temperature: customConfig.temperature,
          maxTokens: customConfig.maxTokens,
        }),
      });
    } catch (networkError) {
      console.error('后端请求失败:', networkError);
      throw new Error(`无法连接到后端服务（${apiBase}），请确认后端已启动。\n详情：${networkError instanceof Error ? networkError.message : String(networkError)}`);
    }

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMsg = '';
      try {
        const errJson = JSON.parse(errorBody);
        errorMsg = errJson.error || errorBody;
      } catch { errorMsg = errorBody; }
      throw new Error(`后端返回错误 (${response.status}): ${errorMsg}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'AI 生成失败');
    }

    onProgress?.('ai_summarize', 'AI 正在整合分析…（第2步/共2步）');

    const aiContent = data.content as string;

    // ========== 步骤3：解析 AI 输出，构建日报 ==========

    onProgress?.('parsing', '正在生成日报…');

    // 尝试分离摘要和板块要闻部分
    let overview = '';
    let bodyContent = '';

    if (aiContent.includes('【行业摘要】')) {
      const summaryStart = aiContent.indexOf('【行业摘要】') + '【行业摘要】'.length;
      // 查找【板块要闻】或各板块标题
      const sections = ['【板块要闻】', '📜 政策动态', '🔬 技术突破', '📊 市场数据', '🏢 企业动态', '🌍 项目落地', '💰 投融资'];
      let summaryEnd = -1;
      for (const section of sections) {
        const idx = aiContent.indexOf(section, summaryStart);
        if (idx !== -1 && (summaryEnd === -1 || idx < summaryEnd)) {
          summaryEnd = idx;
        }
      }
      if (summaryEnd > summaryStart) {
        overview = aiContent.slice(summaryStart, summaryEnd).trim();
        bodyContent = aiContent.slice(summaryEnd).trim();
      } else {
        // 没有找到板块标题，整个作为摘要
        const idx = aiContent.indexOf('\n', summaryStart);
        if (idx !== -1) {
          overview = aiContent.slice(summaryStart, idx).trim();
          bodyContent = aiContent.slice(idx).trim();
        } else {
          overview = aiContent.slice(summaryStart).trim();
          bodyContent = '';
        }
      }
    } else {
      // 如果没有【行业摘要】，用前几段作为摘要
      const lines = aiContent.split('\n').filter(l => l.trim());
      if (lines.length > 3) {
        overview = lines.slice(0, 3).join('\n');
        bodyContent = lines.slice(3).join('\n');
      } else {
        bodyContent = aiContent;
        overview = `共筛选出${topItems.length}条重要资讯，涵盖行业动态综合分析。`;
      }
    }

    // 构建 categories（供列表展示）
    const categories: ReportCategory[] = [{
      name: '重要资讯',
      articles: topItems.map(item => ({
        title: item.title,
        url: item.group[0].url || '',
        summary: item.description,
      })),
      content: topItems.map(item => `• ${item.title}：${item.description}`).join('\n'),
    }];

    // 构建完整日报内容
    const lines: string[] = [
      `📰 行业日报`,
      `日期：${dateLabel}`,
      `---`,
      ``,
      `【行业摘要】`,
      overview,
      ``,
      `---`,
      ``,
      `【行业要闻】`,
      ``,
      bodyContent,
      ``,
      `---`,
      `由行业动态监控系统 AI 生成 · ${dateLabel}`,
      truncatedNote,
    ];

    return {
      success: true,
      report: {
        id,
        title: `行业日报 · ${dateLabel}`,
        date,
        overview,
        categories,
        fullContent: lines.join('\n'),
        createdAt: new Date().toISOString(),
      },
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    console.error('AI 日报生成失败:', errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================================
// 备用：纯算法生成日报（当 AI 不可用时）
// ============================================================

export function generateReport(articles: Article[], date: string): Report {
  const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const dateLabel = formatDate(date);
  const TOP_N = 12;

  const deduplicated = deduplicate(articles);
  const clusters = clusterArticles(deduplicated);
  const enrichedItems = clusters.map(group => {
    const main = group.reduce((best, a) => a.title.length > best.title.length ? a : best);
    return {
      title: cleanText(main.title),
      description: synthesizeEventDescription(group),
      score: importanceScore(main),
      group,
    };
  });
  const topItems = [...enrichedItems].sort((a, b) => b.score - a.score).slice(0, TOP_N);
  const overview = generateOverview(topItems, dateLabel, deduplicated.length, articles.length);

  const categories: ReportCategory[] = [{
    name: '重要资讯',
    articles: topItems.map(item => ({
      title: item.title,
      url: item.group[0].url || '',
      summary: item.description,
    })),
    content: topItems.map(item => `• ${item.title}：${item.description}`).join('\n'),
  }];

  const lines: string[] = [
    `📰 行业日报`,
    `日期：${dateLabel}`,
    `---`,
    ``,
    `【行业摘要】`,
    overview,
    ``,
    `---`,
    ``,
    `【行业要闻】`,
    ``,
  ];

  for (const item of topItems) {
    const metrics = extractMetrics(item.description);
    let line = `• ${item.title}：${item.description}`;
    if (metrics.length > 0) {
      const uniqueMetrics = [...new Set(metrics)].slice(0, 2);
      line += `（${uniqueMetrics.join('、')}）`;
    }
    lines.push(line);
  }

  lines.push(``);
  lines.push(`---`);
  lines.push(`由行业动态监控系统自动生成 · ${dateLabel}`);

  return {
    id,
    title: `行业日报 · ${dateLabel}`,
    date,
    overview,
    categories,
    fullContent: lines.join('\n'),
    createdAt: new Date().toISOString(),
  };
}
