# Project Status: A 股指标筛选平台

> 最后更新: 2026-06-17

## 当前状态

7 个 Phase 全部完成，正在部署到 Supabase + Vercel。

## 已完成

- **Phase 1: 脚手架** — Next.js 16 + shadcn/ui + Tailwind CSS v4 亮色主题
- **Phase 2: 数据层** — 内存 Map + JSON 文件双模式，env 驱动二选一
- **Phase 3: Tushare 筛选逻辑** — 25 个指标 check 函数 + SSE 流式生成器
- **Phase 4: 数据采集** — daily_basic 5208只 + finance 16587行 (2023-2025)
- **Phase 5: API 路由** — /api/screening/combined + /api/screening/prewarm
- **Phase 6: 前端页面** — 搜索栏 + 折叠筛选面板 + SSE 结果表格
- **Phase 7: 部署配置** — Vercel + Supabase schema + 数据上传脚本

## 进行中

- **线上部署** — GitHub 仓库创建 + Supabase 配置 + Vercel 部署

## 本地测试

```bash
bun run dev                 # 启动开发服务器 → localhost:3000
bun run scripts/export-data.ts  # SQLite → JSON 同步（数据更新后运行）
```

## 技术栈

Next.js 16 (App Router) / shadcn/ui / Tailwind CSS v4 / bun:sqlite (脚本) / JSON (运行时) / Supabase (线上)
