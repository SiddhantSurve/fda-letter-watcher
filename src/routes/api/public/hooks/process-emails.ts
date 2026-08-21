import { createFileRoute } from "@tanstack/react-router";
import { assertCronAuthorized } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/process-emails")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});

/**
 * Cron-facing wrapper around the email queue processor.
 * The scheduled job authenticates with `x-cron-secret`; this handler then calls
 * the internal queue route with the server-side service role key.
 */
async function handler({ request }: { request: Request }) {
  const denied = await assertCronAuthorized(request);
  if (denied) return denied;

  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) {
    return new Response(JSON.stringify({ ok: false, error: "missing service key" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const target = new URL("/lovable/email/queue/process", new URL(request.url).origin);
  const res = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: "{}",
  });

  const text = await res.text();
  return new Response(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
