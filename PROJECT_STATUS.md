# Project Status: A 股指标筛选平台

> 最后更新: 2026-06-17

## 当前状态

已上线，生产环境运行中。筛选功能经过线上调试已基本可用。

## 生产地址

- https://xuangubao.top
- Vercel: https://stock-screener-omega-brown.vercel.app
- GitHub: https://github.com/yuanda-1999/stock-screener
- Supabase: https://supabase.com/dashboard/project/cmaakeewurufvziqwagb

## 已完成 (7/7 Phase)

- **Phase 1: 脚手架** — Next.js 16 + shadcn/ui + Tailwind CSS v4 亮色主题
- **Phase 2: 数据层** — 内存 Map + JSON 双模式，env 驱动二选一
- **Phase 3: Tushare 筛选逻辑** — 25 个指标 check 函数 + SSE 流式生成器
- **Phase 4: 数据采集** — daily_basic 5208只 + finance 16587行 (2023-2025)
- **Phase 5: API 路由** — /api/screening/combined + /api/screening/prewarm
- **Phase 6: 前端页面** — 搜索栏 + 折叠筛选面板 + SSE 结果表格
- **Phase 7: 部署配置** — Vercel + Supabase Pro (1012万行) + 自定义域名

## 线上调试 (2026-06-17)

- Vercel 环境变量补全 (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TUSHARE_TOKEN)
- Supabase 大表创建索引 (daily_bar_cache, monthly_bar_cache, weekly_bar_cache, macd_factor_cache, cyq_perf_cache, daily_basic_cache, finance_cache, dividend_cache)
- 数据加载优化: 按需加载 (不用日线就不加载), orderBy + limit 控制数量
- SSE 流式响应: 加载阶段立即发送 loading 事件防止前端卡住
- 筹码集中度: 筛选逻辑改为 ≥ (保留筹码分散的股票)
- 顶部栏: 开始筛选按钮旁增加进度显示

## 已知限制

- Vercel 函数超时 300s，Supabase REST API 分页加载有延迟
- 本地 SQLite (<1s) vs 线上 Supabase (取决于数据量) 速度差异大
- 技术指标 (KDJ/MACD) 筛选用时长于基本面指标 (PE/PB)

## 本地测试

```bash
bun run dev                 # 启动开发服务器 → localhost:3000
bun run scripts/export-data.ts  # SQLite → JSON 同步（数据更新后运行）
```

## 技术栈

Next.js 16 (App Router) / shadcn/ui / Tailwind CSS v4 / Supabase (线上) / SQLite (本地) / Vercel
