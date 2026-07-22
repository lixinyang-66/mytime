# MyTime

MyTime 是一个个人时间管理系统，核心理念是：**感知时间的流逝**。

它不是为了制造新的打卡压力，而是帮助用户在一段时间过去后，诚实记录自己真正做了什么。时间长短不是衡量努力的唯一标准，坚持不是打卡，而是每天靠近目标。

## V1.1 主要能力

- PWA 支持：可添加到手机主屏幕或电脑桌面，以独立应用方式打开
- 项目制管理：每个项目可设置名称、开始时间、截止时间、总目标、每天固定时间
- 项目密码：系统不再使用全局访问密码，每个项目单独设置密码
- 周计划：每个项目按周制定计划
- 任务板块：支持考公、论文、秋招、科研项目、运动、阅读、学生工作、娱乐、外语、兴趣爱好
- 自定义任务板块：用户可创建自己的任务板块
- 任务类型：区分临时任务和长期任务；临时任务可选目标，长期任务必须设置目标
- 每周任务数量限制：每周至少选择 1 个任务板块，最多选择 4 个任务板块
- 时间记录：开始、暂停、结束，并记录这段时间真正做了什么
- 最近记录：支持按任务板块筛选查看记录
- 统计：今天、本周、本月、累计、本周完成率、连续记录天数

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
```

说明：

- `SUPABASE_URL`：Supabase Project URL，格式应为 `https://xxxx.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY`：Supabase service role key，仅服务端使用，不能提交到 GitHub
- `SESSION_SECRET`：用于项目密码哈希和登录 cookie 签名，建议使用 32 位以上随机字符串
- `DEVELOPER_ADMIN_PASSWORD`：开发者管理密码，用于删除现有项目，只能配置在 Vercel 环境变量中，不要提交真实密码

## Supabase 数据库

如果是从 Summer Sprint V1.0 升级到 MyTime V1.1，请在 Supabase SQL Editor 执行：

```text
supabase/mytime_v1_1_migration.sql
```

如果是全新项目，可以先执行旧的初始化脚本，再执行迁移脚本：

```text
supabase/schema.sql
supabase/mytime_v1_1_migration.sql
```

迁移后会新增：

- `projects`
- `task_boards`
- `weekly_plan_items`

并为旧表补充：

- `weekly_plans.project_id`
- `study_sessions.project_id`
- `study_sessions.task_board_id`

## Vercel 部署

1. 将代码推送到 GitHub。
2. Vercel 会自动检测 GitHub 代码变化并重新部署。
3. 确认 Vercel 环境变量包含：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SESSION_SECRET`
   - `DEVELOPER_ADMIN_PASSWORD`
4. V1.1 不再需要 `ACCESS_PASSWORD`。
5. 部署完成后，打开网站进入项目选择/创建页。

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
