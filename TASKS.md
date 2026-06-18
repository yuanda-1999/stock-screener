# Tasks

> 最后更新: 2026-06-18

## Active

_无_

## Completed Recently

- 筹码集中度修复: 公式从通达信版改为东方财富版 `(P95-P5)/(P95+P5)*100`，范围 0-100%
- MACD 周线化: 从日线改为周线，EMA12/EMA26 基于周收盘价，UI 显示"周数"默认 26
- TypeScript 编译修复: weekly bars fallback 缺少 code 字段
- 行业/版块筛选: 110 个 Tushare 行业分类 — 前端多选搜索 + DB 层预过滤 + JS 层二次过滤
- DB 函数修复: 行业筛选改用预提取值，避免动态 SQL 中 filters 参数不可用
- 前端修复: "板块"分类加入 CATEGORIES 数组，修复行业筛选不显示 bug
- 移除预热缓存: 删除无用按钮和 `/api/screening/prewarm` 路由

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
- 技术指标 DB 化: KDJ/RSI/BOLL/WR/BIAS 预计算缓存表 + screen_stocks_basic LATERAL JOIN
- MACD 预过滤: 确保 MACD 数据存在的股票才进入候选集
- 指标重算模块: `src/lib/screening/indicator-recompute.ts` 共享模块，cron 端点每日调用

## Next

- [ ] 请求频率限制 (API rate limiting)
- [ ] 用户认证（如需要）
