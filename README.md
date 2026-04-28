# 行业动态监控系统

一个基于 AI 的行业动态监控与日报生成系统，支持 RSS 订阅源抓取、AI 新闻分类与聚合、智能日报生成。

## 功能特点

- 📰 **RSS 订阅源管理** - 添加、管理信息源，支持 WeWe-RSS 等本地服务
- 🔄 **自动抓取** - 支持翻页抓取，获取更全的信息
- 🤖 **AI 日报生成** - 智能分析行业动态，生成结构化日报
- ⚙️ **AI 策略配置** - 可自定义提示词和模型参数
- ⭐ **收藏功能** - 收藏感兴趣的动态
- 💾 **本地存储** - SQLite 数据库，本地优先

## 技术栈

- **前端**: React + TypeScript + Vite + Tailwind CSS
- **后端**: Node.js + Express + SQLite
- **AI**: SiliconFlow API (Qwen 大模型)

## 快速开始

### 前置要求

- Node.js 18+
- npm 或 yarn

### 安装

```bash
# 克隆项目
git clone https://github.com/msmsanna/industry_daily.git
cd industry_daily

# 安装前端依赖
cd app && npm install

# 安装后端依赖
cd ../server && npm install
```

### 配置

1. 复制环境变量配置：

```bash
cd server
cp .env.example .env
```

2. 编辑 `.env` 文件，填入你的 API Key：

```env
# SiliconFlow API Key（必须）
SILICONFLOW_API_KEY=your_api_key_here

# 可选配置
SILICONFLOW_MODEL=Qwen/Qwen2.5-14B-Instruct
PORT=3001
USE_LOCAL_DB=true
```

> 获取 SiliconFlow API Key: https://cloud.siliconflow.cn/

### 启动

```bash
# 启动后端（终端1）
cd server
npm run dev  # 或 npx tsx index.ts

# 启动前端（终端2）
cd app
npm run dev
```

访问 http://localhost:5173

默认登录账号：`admin` / `123456`

## 使用说明

### 1. 添加信息源

进入「信息源管理」页面，点击「新增信息源」，
填写名称和 RSS/Atom 地址。

推荐使用 [WeWe-RSS](https://github.com/cooder-s/wewe-rss) 搭建本地 RSS 服务，可获取更完整的历史内容。

### 2. 抓取动态

- 点击单个信息源的「启用/抓取」按钮抓取该源
- 开启后会抓取最近 30 天、至多 5 页的内容

### 3. 查看动态

进入「行业动态」页面，可搜索、筛选新闻，
支持收藏和删除。

### 4. 生成日报

进入「日报生成」页面：
1. 选择日期范围和关键词
2. 点击「生成日报」
3. AI 会分析筛选的动态，生成结构化日报
4. 可保存日报或复制内容

### 5. AI 策略配置

进入「AI 策略配置」页面可自定义：
- AI 模型（7B / 14B / 32B / 72B）
- Temperature 和 Max Tokens
- System Prompt 和 User Prompt

支持实时测试提示词效果。

## 项目结构

```
industry_daily/
├── app/                    # 前端 React 应用
│   ├── src/
│   │   ├── pages/         # 页面组件
│   │   ├── components/    # 公共组件
│   │   ├── lib/           # 工具函数
│   │   └── types/         # TypeScript 类型
│   └── package.json
│
├── server/                 # 后端 Express 服务
│   ├── lib/
│   │   ├── db.ts         # SQLite 数据库
│   │   └── ai.ts         # AI 调用封装
│   ├── data/             # SQLite 数据文件
│   ├── index.ts          # 入口文件
│   └── package.json
│
└── README.md
```

## 部署

### Vercel + Render

1. **前端** 部署到 Vercel（React + Vite）
2. **后端** 部署到 Render/Railway/Render

详细部署文档后续补充。

## 注意事项

- `.env` 文件包含敏感 API Key，请勿提交到版本控制
- 本地开发模式下，数据存储在 `server/data/news.db`
- 动态默认保留 90 天，超过自动清理

## License

MIT

##wewe-rss安装链接

https://github.com/cooderl/wewe-rss
