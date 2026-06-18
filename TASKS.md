# Tasks

> 最后更新: 2026-06-18

## Active

_无_

## Completed Recently

- 筛选移到数据库层: 创建 PostgreSQL `screen_stocks_basic` 函数，15 个简单指标（PE/PB/ROE/市值/换手率等）在 DB 层用 LATERAL JOIN + WHERE 过滤，候选集从 5200 缩减到 200-500
- API 路由改造: combined/route.ts 两层筛选 — DB 过滤 → 候选股按需加载 bar 数据 → JS 技术指标检查
- cache 层: 新增 `loadCandidatesToMemory` 按代码列表加载 + `loadForCodes` Supabase IN 查询
- 增量更新: Vercel Cron 端点 `/api/cron/daily-refresh` — 每日 18:00 从 Tushare 批量拉取 + Upsert Supabase
- vercel.json: 配置 Cron schedule `0 10 * * 1-5` (10:00 UTC)
- Supabase 迁移: `20260618000000_db_screening.sql` (筛选函数), `20260618000001_indicator_cache.sql` (技术指标缓存表预留)

## Completed

- Phase 1: 脚手架 — Next.js 16 + shadcn/ui + Tailwind v4 + Fira 字体
- Phase 2: 数据层 — 内存 Map + JSON 双模式缓存
- Phase 3: Tushare 筛选逻辑 — 25 指标 check + SSE 生成器
- Phase 4: 数据采集 — daily_basic 5208只 + finance 16587行 (2023-2025)
- Phase 5: API 路由 — combined + prewarm SSE endpoints
- Phase 6: 前端页面 — 搜索 + 折叠面板 + 动态结果表格
- Phase 7: 线上部署 — Supabase Pro 建表 + 1012万行数据上传 + Vercel + xuangubao.top
- 线上调试: Vercel 环境变量补全 + Supabase 索引 + 按需加载 + SSE 优化 + 进度条
- 筛选 DB 化: PostgreSQL 筛选函数 + 两层筛选 + 候选股按需加载
- 增量更新: Vercel Cron 每日批量拉取 + 写入 Supabase

## Next

- [ ] 在 Supabase 中执行迁移: `20260618000000_db_screening.sql` (通过 Supabase Dashboard SQL Editor)
- [ ] 设置 Vercel 环境变量 `CRON_SECRET` (用于 Cron 端点鉴权)
- [ ] 技术指标缓存表填充: 运行 `recompute_all_indicators()` 填充 KDJ/RSI/BOLL/WR/BIAS 表
- [ ] 全部筛选移到 DB 层: 将技术指标检查也加入到 `screen_stocks_basic` 函数
- [ ] 请求频率限制 (API rate limiting)
- [ ] 用户认证（如需要）
