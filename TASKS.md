# Tasks

> 最后更新: 2026-06-17

## Active

_无_

## Completed Recently

- 线上调试: Vercel 环境变量补全 (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TUSHARE_TOKEN)
- Supabase: 8 张大表创建 trade_date / end_date 索引
- 数据加载优化: 按需加载策略 — 不用日线就不加载，加载时间从 50s 降到 2-3s
- SSE 流式响应: 加载阶段立即发送 loading 事件，前端不再卡住
- 前端: 开始筛选按钮旁进度显示 (done/total + 进度条)
- 筹码集中度: 筛选逻辑改为 ≥ (保留筹码分散的股票)

## Completed

- Phase 1: 脚手架 — Next.js 16 + shadcn/ui + Tailwind v4 + Fira 字体
- Phase 2: 数据层 — 内存 Map + JSON 双模式缓存
- Phase 3: Tushare 筛选逻辑 — 25 指标 check + SSE 生成器
- Phase 4: 数据采集 — daily_basic 5208只 + finance 16587行 (2023-2025)
- Phase 5: API 路由 — combined + prewarm SSE endpoints
- Phase 6: 前端页面 — 搜索 + 折叠面板 + 动态结果表格
- Phase 7: 线上部署 — Supabase Pro 建表 + 1012万行数据上传 + Vercel + xuangubao.top

## Next

- [ ] 筛选移到数据库层: 用 Supabase PostgreSQL 直接计算指标/过滤，避免数据搬运到 Vercel 内存
- [ ] 增量更新: 每日定时拉取新交易日数据到 Supabase
- [ ] 请求频率限制 (API rate limiting)
- [ ] 用户认证（如需要）
