# 部署方案：Vercel + Render

## 架构图

```
用户访问
    │
    ▼
┌─────────────────┐
│   Vercel        │  ← 前端（React + Vite）
│  免费托管       │
└────────┬────────┘
         │ API 请求
         ▼
┌─────────────────┐
│   Render       │  ← 后端（Express + SQLite）
│  Node.js 服务  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  SiliconFlow   │  ← AI 生成日报
│  API           │
└─────────────────┘
```

---

## 第一步：部署后端到 Render

### 1.1 创建 Render 账号

1. 访问 https://render.com
2. 使用 GitHub 账号登录
3. 点击 "New +" → "Web Service"

### 1.2 部署配置

| 配置项 | 值 |
|--------|-----|
| Name | `industry-daily-api` |
| Root Directory | `server` |
| Environment | `Node` |
| Build Command | `npm install` |
| Start Command | `npx tsx index.ts` |
| Instance Type | Free（免费，会休眠） |

### 1.3 添加环境变量

在 Render 后台，为你的服务添加以下环境变量：

```
SILICONFLOW_API_KEY=你的API密钥
SILICONFLOW_MODEL=Qwen/Qwen2.5-14B-Instruct
PORT=10000
USE_LOCAL_DB=true
```

### 1.4 获取后端 URL

部署完成后，Render 会给你一个 URL，例如：
`https://industry-daily-api.onrender.com`

---

## 第二步：部署前端到 Vercel

### 2.1 创建 Vercel 账号

1. 访问 https://vercel.com
2. 使用 GitHub 账号登录

### 2.2 导入项目

1. 点击 "Add New..." → "Project"
2. 选择 `industry_daily` 仓库
3. 配置：

| 配置项 | 值 |
|--------|-----|
| Framework Preset | `Other` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

### 2.3 添加环境变量

在 Vercel 后台添加：

```
VITE_API_URL=https://industry-daily-api.onrender.com
```

> 注意：需要把后端的 Render URL 填入

### 2.4 修改前端 API 配置

需要修改 `app/src/lib/config.ts`，让前端知道生产环境的 API 地址：

```typescript
// 修改 getApiBaseUrl 函数
export function getApiBaseUrl(): string {
  if (isLocalDev) {
    return '/api';
  }
  // 生产环境：使用 Vercel 环境变量或手动配置的 URL
  return import.meta.env.VITE_API_URL || '';
}
```

然后在 Vercel 环境变量中设置 `VITE_API_URL` 为你的 Render URL。

---

## 第三步：测试

部署完成后：

1. 打开 Vercel 给你的前端 URL（如 `https://industry-daily.vercel.app`）
2. 登录账号：`admin` / `123456`
3. 测试：
   - 添加一个 RSS 源
   - 抓取测试
   - 生成日报

---

## 费用说明

| 服务 | 免费额度 | 备注 |
|------|----------|------|
| Vercel | 100GB 带宽/月 | 前端足够 |
| Render | 750 小时/月 | 免费实例会休眠，唤醒需要 30 秒 |

Render 免费实例在 15 分钟无活动后会进入休眠状态，下次访问时会自动唤醒。

---

## 如果遇到问题

### 1. RSS 抓取失败

由于浏览器直接请求 RSS 源可能遇到 CORS 问题，生产环境可能需要：
- 使用后端代理抓取 RSS
- 或配置 CORS 头

### 2. 数据库持久化

Render 免费实例的磁盘在实例重启后会被清空。如果需要持久化存储：
- 升级到付费计划（$7/月）
- 或使用外部数据库（如 Supabase）

---

## 备选方案：Supabase 数据库（可选）

如果想数据持久化，可以：

1. 在 https://supabase.com 创建免费数据库
2. 修改代码中的 `USE_LOCAL_DB=false`
3. 配置 Supabase 的连接信息

需要我帮你配置这个吗？