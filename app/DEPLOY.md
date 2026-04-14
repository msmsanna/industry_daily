# 🚀 部署指南：Vercel + Supabase

## 目录

1. [项目架构](#项目架构)
2. [本地开发](#本地开发)
3. [Supabase 配置（数据库）](#supabase-配置)
4. [Vercel 部署](#vercel-部署)
5. [环境变量清单](#环境变量清单)
6. [常见问题](#常见问题)

---

## 项目架构

```
app/                          # 根目录（Vercel 项目根）
├── api/                      # Vercel Serverless Functions
│   ├── index.ts              # GET /api  → 健康检查
│   ├── news.ts               # GET /api/news → 分页列表
│   ├── news.all.ts           # GET /api/news/all → 全部数据
│   ├── news.post.ts          # POST /api/news → 批量添加
│   ├── generate.ts           # POST /api/generate → AI日报生成
│   └── news/
│       ├── [id].ts           # DELETE /api/news/:id
│       └── cleanup.ts        # DELETE /api/news/cleanup
├── src/                      # 前端源码
│   ├── lib/
│   │   ├── config.ts         # 🔑 环境变量集中管理
│   │   ├── fetcher.ts        # API 调用（动态地址）
│   │   ├── reportGen.ts      # 日报生成逻辑
│   │   └── storage.ts        # localStorage 持久化
│   └── pages/                # 页面组件
├── vercel.json               # Vercel 构建配置
├── vite.config.ts            # Vite + 开发代理
├── .env.example              # 环境变量模板
├── package.json
│
server/                       # 后端模块（本地开发用）
├── lib/
│   ├── db.ts                 # 📦 数据库抽象层 (SQLite | Supabase)
│   └── ai.ts                 # 🤖 AI 服务抽象层 (可扩展多提供商)
├── supabase/
│   └── schema.sql            # Supabase 建表脚本
├── index.ts                  # Express 本地服务器
└── package.json
```

### 设计原则

| 层级 | 文件 | 职责 |
|------|------|------|
| **配置** | `src/lib/config.ts` | 所有环境变量、API地址 |
| **数据库** | `server/lib/db.ts` | SQLite(本地) / Supabase(生产) 自动切换 |
| **AI** | `server/lib/ai.ts` | 统一 LLM 调用，支持扩展新提供商 |
| **前端** | `src/lib/fetcher.ts` | 通过 config 动态获取 API 地址 |

---

## 本地开发

### 前置要求

- Node.js ≥ 18
- pnpm 或 npm

### 启动步骤

```bash
# 1. 安装依赖（根目录 + server 目录）
cd app && npm install
cd ../server && npm install
cd ../app

# 2. 复制环境变量模板
cp .env.example .env

# 3. 编辑 .env，填入你的 API Key
#    至少需要 SILICONFLOW_API_KEY
#    USE_LOCAL_DB=true（默认）

# 4. 启动后端（终端1）
cd server
npm run dev
# → http://localhost:3001

# 5. 启动前端（终端2）
cd app
npm run dev
# → http://localhost:5173
# → /api 请求自动代理到 localhost:3001
```

### 本地开发架构

```
浏览器 → Vite dev server (:5173) --proxy--> Express server (:3001)
                                              |
                                         SQLite (本地文件)
                                         硅基流动 API
```

---

## Supabase 配置

### 1️⃣ 创建项目

1. 访问 https://supabase.com ，注册/登录
2. 点击 "New Project"
3. 选择组织、填写项目名（如 `industry-news`）
4. 设置密码 → 创建

### 2️⃣ 建表

在 Supabase Dashboard 中：
- 左侧菜单 → **SQL Editor**
- 复制 `server/supabase/schema.sql` 内容粘贴执行

### 3️⃣ 获取密钥

Supabase Dashboard → **Settings** → **API**：

| 变量名 | 位置 |
|--------|------|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY** | public (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY** | service role key（⚠️ 权限高，仅服务端用） |

> ⚠️ **安全提醒**：Service Role Key 只在服务端使用（Serverless Functions），绝不能暴露给前端。

---

## Vercel 部署

### 方式一：通过 Git 仓库部署（推荐）

#### 1. 推送代码到 GitHub

```bash
git init
git add .
git commit -m "feat: 支持 Vercel + Supabase 部署"
git remote add origin https://github.com/YOUR_USERNAME/your-repo.git
git push -u origin main
```

#### 2. 连接 Vercel

1. 访问 https://vercel.com ，登录
2. 点击 **"Add New..." → "Project"**
3. 导入你的 GitHub 仓库
4. **Root Directory**: 设为 `./app`
5. **Framework Preset**: 选 **Vite**
6. 点击 **Deploy**

#### 3. 配置环境变量

在 Vercel Dashboard → 你的项目 → **Settings** → **Environment Variables**：

添加以下变量（见下方完整清单）：

| 名称 | 值 | 说明 |
|------|-----|------|
| `USE_LOCAL_DB` | `false` | 使用 Supabase（不是 SQLite） |
| `SUPABASE_URL` | 你的 URL | 如 `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | 你的 key | 后端用 |
| `SILICONFLOW_API_KEY` | `sk-...` | 硅基流动 API Key |
| `SILICONFLOW_MODEL` | `Qwen/Qwen2.5-7B-Instruct` | 可选，默认值 |

#### 4. 重新部署

设置完环境变量后：
- **Deployments** → 最新一次部署 → 右上角 **"..." → Redeploy**

---

### 方式二：CLI 部署

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 在 app 目录下部署
cd app
vercel

# 按提示选择：
#   - Set root directory to ./ (或确认是当前目录)
#   - Framework: Vite
#   - 添加环境变量
```

---

## 环境变量清单

### 必填

| 变量 | 示例 | 说明 |
|------|------|------|
| `USE_LOCAL_DB` | `false`（生产） / `true`（本地） | 数据库模式选择 |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` | Supabase 项目地址 |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | 后端数据库操作密钥 |
| `SILICONFLOW_API_KEY` | `sk-xxxxxxxxxx` | AI 服务 API 密钥 |

### 可选

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SILICONFLOW_MODEL` | `Qwen/Qwen2.5-7B-Instruct` | AI 模型名称 |
| `AI_TEMPERATURE` | `0.7` | AI 创意度 (0-1) |
| `AI_MAX_TOKENS` | `4000` | AI 最大输出 token 数 |
| `WECHAT_WEBHOOK_KEY` | （空） | 企业微信机器人 webhook key |

### 安全分级

| 等级 | 变量 | 可见范围 |
|------|------|----------|
| 🔴 **绝密** | `SILICONFLOW_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | 仅服务端 |
| 🟡 **受限** | `SUPABASE_ANON_KEY` | 服务端 + 前端 |
| 🟢 **公开** | `SUPABASE_URL` | 无敏感信息 |

---

## 常见问题

### Q: 本地开发报错 "Cannot find module '@vercel/node'"？
A: `@vercel/node` 仅用于 Vercel 部署时。本地开发不需要安装它。本地只启动 Express 服务器即可。

### Q: 如何切换 AI 提供商？
A: 编辑 `.env` 文件：
```
AI_PROVIDER=openai
AI_BASE_URL=https://api.openai.com/v1
OPENAI_API_KEY=sk-...
SILICONFLOW_MODEL=gpt-4o-mini
```

### Q: 数据迁移：SQLite → Supabase？
A: 可以写一个迁移脚本，从 SQLite 导出 JSON → POST 到 `/api/news` 批量导入到 Supabase。

### Q: Vercel Serverless Function 超时怎么办？
A: 免费版限制 10 秒。如果 AI 调用超时，考虑：
1. 用更快的模型（如 `Qwen3-8B`）
2. 减少发送给 AI 的文章数量

### Q: 如何回退到纯本地模式？
A: 设 `USE_LOCAL_DB=true`，不配 Supabase 相关变量，一切照旧运行。
