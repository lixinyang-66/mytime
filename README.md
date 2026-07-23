# MyTime

MyTime 是一个个人时间管理系统，核心理念是：**感知时间的流逝**。

它不是为了制造新的打卡压力，而是帮助用户在一段时间过去后，诚实记录自己真正做了什么。时间长短不是衡量努力的唯一标准，坚持不是打卡，而是每天靠近目标。

## V2.0 主要能力

- 时间空间：通过空间名称和密码进入独立的个人时间管理空间，一个空间可以管理多个项目
- 多项目管理：每个项目可设置目标、起止日期、每日固定时间、难度和运行状态
- AI 阶段计划：根据项目目标、周期、每日可用时间和难度，使用 DeepSeek 自动拆解 3～5 个阶段
- 自动降级：未配置 DeepSeek API Key、接口失败或结果不合法时，自动使用内置规则引擎生成计划
- 项目甘特图：查看阶段时间轴、状态和进度；支持手动编辑阶段或让 AI 重新生成
- 自定义任务板块：支持临时任务和长期任务；长期任务必须设置目标
- 周计划：为任务板块分配每日时间，分配总时长必须与项目每日固定时间一致
- 时间记录：支持开始、暂停和结束，并记录这段时间真正完成的内容
- 复盘系统：支持创建每日、每周和每月复盘，记录总结、洞察、下一步计划、投入时间与完成率
- 数据统计：展示今天、本周、本月、累计时长、本周完成率和连续记录天数
- PWA 支持：可添加到手机主屏幕或电脑桌面，以独立应用方式打开

## 技术栈

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL
- Vercel
- GitHub

## 本地开发

```bash
npm install
cp .env.example .env.local
npm run dev
```

然后访问：

```text
http://localhost:3000
```

## 环境变量

在本地 `.env.local` 或 Vercel 项目环境变量中配置：

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SESSION_SECRET=your-long-random-session-secret
DEVELOPER_ADMIN_PASSWORD=your-developer-admin-password
DEEPSEEK_API_KEY=sk-xxxx-your-key-here
```

说明：

- `SUPABASE_URL`：Supabase Project URL，格式应为 `https://xxxx.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`：Supabase service role key，仅服务端使用，不能提交到 GitHub
- `SESSION_SECRET`：用于空间密码哈希和登录 cookie 签名，建议使用 32 位以上随机字符串
- `DEVELOPER_ADMIN_PASSWORD`：开发者管理密码，用于删除现有项目，只能配置在 Vercel 环境变量中，不要提交真实密码
- `DEEPSEEK_API_KEY`：可选，用于调用 DeepSeek 生成定制化阶段计划；未配置时自动使用内置规则引擎

## Supabase 数据库

如果已经运行 MyTime V1.1，请先备份数据，然后在 Supabase SQL Editor 执行：

```text
supabase/mytime_v2_0_migration.sql
```

如果是从 Summer Sprint V1.0 升级或全新部署，请按顺序执行：

```text
supabase/schema.sql
supabase/mytime_v1_1_migration.sql
supabase/mytime_custom_boards_migration.sql
supabase/mytime_v2_0_migration.sql
```

V2.0 迁移会新增：

- `spaces`
- `project_phases`
- `reviews`

并为 `projects` 补充：

- `space_id`
- `goal`
- `difficulty`
- `plan_source`
- `daily_start_time`
- `daily_end_time`
- `status`

## Vercel 部署

1. 将代码推送到 GitHub。
2. Vercel 会自动检测 GitHub 代码变化并重新部署。
3. 确认 Vercel 环境变量包含：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SESSION_SECRET`
   - `DEVELOPER_ADMIN_PASSWORD`
   - `DEEPSEEK_API_KEY`（可选）
4. V2.0 不需要 `ACCESS_PASSWORD`，登录密码由每个时间空间单独设置。
5. 部署完成后，打开网站创建或进入时间空间。

## PWA 使用方式

### iPhone

使用 Safari 打开网站：

```text
https://summer-sprint.vercel.app/
```

点击分享按钮，选择“添加到主屏幕”。

### Android

使用 Chrome 打开网站，点击右上角三个点，选择“添加到主屏幕”或“安装应用”。

### Windows / Edge

使用 Edge 打开网站，点击右上角三个点：

```text
应用 → 将此站点作为应用安装
```

## 产品原则

- 感知时间流逝，而不是制造打卡压力
- 记录这段时间做了什么，而不是只记录时间长度
- 警惕形式主义和假努力
- 坚持不是打卡，而是每天靠近目标

