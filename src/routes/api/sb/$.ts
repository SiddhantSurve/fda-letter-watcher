import { createFileRoute } from "@tanstack/react-router";

const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "origin",
  "referer",
  "cf-connecting-ip",
  "cf-ray",
  "cf-visitor",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-for",
]);

async function proxy({ request }: { request: Request }) {
  const base = process.env["SUPABASE_URL"];
  if (!base) {
    return new Response(JSON.stringify({ error: "Backend not configured" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const incoming = new URL(request.url);
  const suffix = incoming.pathname.replace(/^\/api\/sb/, "");
  const target = new URL(base.replace(/\/$/, "") + suffix + incoming.search);

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });

  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  const upstream = await fetch(target.toString(), {
    method,
    headers,
    body,
    redirect: "manual",
  });

  const outHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (k === "content-encoding" || k === "content-length" || k === "transfer-encoding") return;
    outHeaders.set(key, value);
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

export const Route = createFileRoute("/api/sb/$")({
  server: {
    handlers: {
      GET: proxy,
      POST: proxy,
      PUT: proxy,
      PATCH: proxy,
      DELETE: proxy,
      HEAD: proxy,
      OPTIONS: proxy,
    },
  },
});
