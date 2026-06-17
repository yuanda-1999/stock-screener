// 缓存预热 SSE API
import { NextRequest } from "next/server";

let _loaded = false;

export async function GET(req: NextRequest) {
  const { loadAllToMemory } = await import("@/lib/cache/index");

  if (!_loaded) {
    await loadAllToMemory();
    _loaded = true;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: {"type":"done","summary":{"storage":"sqlite","status":"loaded"}}\n\n`)
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
