# MyTime 知识库

`src/data/all_knowledge_base.json` 是 MyTime 的版本化知识库，当前包含项目管理、科研、考试、健身、比赛和计划完成心理学等条目。

## 强制运行规则

MyTime 的 AI 请求必须遵循下面的顺序：

1. 读取 `src/data/all_knowledge_base.json`。
2. 根据项目类型、名称、目标、子类型和当前进展检索相关条目。
3. 将检索结果和系统原则卡放入 DeepSeek 请求上下文。
4. 要求模型优先依据知识库设计阶段、产出、顺序和约束，再结合用户实际日期调整。
5. 没有知识库标记的请求禁止发送给 DeepSeek；系统会在请求层拦截并降级到本地规则计划。

代码中的 `[MYTIME_KNOWLEDGE_BASE_REQUIRED]` 是强制标记，不是给模型看的可选建议。以后新增 AI 调用时，必须通过 `buildKnowledgeContext(...)` 把知识库上下文加入消息，否则请求不会发出。

## 运行方式

服务端会在生成计划和周复盘时，根据项目类型、项目名称、目标、子类型和当前进展，从 JSON 中检索最相关的条目，只把有限的结果注入 DeepSeek 提示词。系统原则卡仍会作为基础约束保留。

## 更新知识库

1. 用新版 `all_knowledge_base.json` 替换 `src/data/all_knowledge_base.json`。
2. 在本地执行 `npx.cmd tsc --noEmit --pretty false` 和 `npm.cmd run build`。
3. 提交并部署。JSON 会随部署进入服务端，不需要新增 Vercel 环境变量。

JSON 条目建议继续保留 `id`、`domain_en`、`kb_type`、`category`、`subcategory`、`title`、`content` 和 `tags` 字段；其中 `domain_en` 使用 `research`、`fitness`、`competition`、`exam`、`project_management` 或 `psychology`。

## GitHub 发布流程

涉及知识库或 AI 生成逻辑的改动，按以下流程发布：

1. 从最新 `main` 创建功能分支。
2. 修改代码和知识库后运行类型检查、生产构建和 `git diff --check`。
3. 只提交本次改动涉及的文件，不提交本地缓存、临时文件和 `work/` 目录。
4. 推送功能分支并创建 Draft PR，合并前确认 Vercel Preview 构建成功。
