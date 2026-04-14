/**
 * 全局配置模块
 * 所有环境变量、API地址、模型配置集中管理
 * 本地开发和 Vercel 部署自动适配
 */

// ============================================
// 部署环境检测
// ============================================

/** 是否在本地开发环境 */
export const isLocalDev =
  typeof process !== 'undefined' &&
  (process.env.NODE_ENV === 'development' ||
    !process.env.VERCEL_URL ||
    process.env.USE_LOCAL_DB === 'true');

/** 当前部署 URL（Vercel 或本地） */
export function getApiBaseUrl(): string {
  if (isLocalDev) {
    return 'http://localhost:3001';
  }
  // Vercel 部署时，前端和 API 同源
  return '';
}

/** 前端完整 URL */
export function getFrontendUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return process.env.VERCEL_URL || 'http://localhost:5173';
}

// ============================================
// Supabase 配置
// ============================================

export const supabaseConfig = {
  url: import.meta.env?.VITE_SUPABASE_URL ||
    process.env?.SUPABASE_URL ||
    '',
  anonKey: import.meta.env?.VITE_SUPABASE_ANON_KEY ||
    process.env?.SUPABASE_ANON_KEY ||
    '',
  serviceRoleKey: process.env?.SUPABASE_SERVICE_ROLE_KEY || '',
};

// ============================================
// AI 服务配置
// ============================================

export const aiConfig = {
  provider: 'siliconflow', // 可扩展：openai、anthropic、deepseek 等
  apiKey: process.env?.SILICONFLOW_API_KEY || '',
  baseUrl: 'https://api.siliconflow.cn/v1',
  model: process.env?.SILICONFLOW_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
  temperature: 0.7,
  maxTokens: 4000,
};

// ============================================
// 企业微信机器人配置（可选）
// ============================================

export const wechatWebhookConfig = {
  enabled: !!process.env?.WECHAT_WEBHOOK_KEY,
  webhookUrl: process.env?.WECHAT_WEBHOOK_KEY
    ? `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=${process.env.WECHAT_WEBHOOK_KEY}`
    : '',
};
