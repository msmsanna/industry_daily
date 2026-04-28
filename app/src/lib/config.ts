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
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

/** 当前部署 URL（Vercel 或本地） */
export function getApiBaseUrl(): string {
  // 本地开发：使用 /api 前缀，由 Vite 代理转发到后端 :3001
  if (isLocalDev) {
    return '/api';
  }
  // Vercel 部署时，前端和 API 同源
  return '';
}

/** 前端完整 URL */
export function getFrontendUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:5173';
}

// ============================================
// Supabase 配置（暂未启用）
// ============================================

export const supabaseConfig = {
  url: import.meta.env?.VITE_SUPABASE_URL || '',
  anonKey: import.meta.env?.VITE_SUPABASE_ANON_KEY || '',
  serviceRoleKey: '',
};

// ============================================
// AI 服务配置（后端使用，前端仅作参考）
// ============================================

export const aiConfig = {
  provider: 'siliconflow',
  apiKey: '', // 前端不存储 API Key，由后端代理
  baseUrl: 'https://api.siliconflow.cn/v1',
  model: 'Qwen/Qwen2.5-7B-Instruct',
  temperature: 0.7,
  maxTokens: 4000,
};

// ============================================
// 企业微信机器人配置（可选）
// ============================================

export const wechatWebhookConfig = {
  enabled: false,
  webhookUrl: '',
};
