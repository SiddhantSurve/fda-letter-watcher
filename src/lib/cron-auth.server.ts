/**
 * Shared guard for background job endpoints under /api/public/hooks/*.
 * The scheduled jobs send `x-cron-secret`, whose value is stored in the
 * private `internal_settings` table (service-role access only).
 */
export async function assertCronAuthorized(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-cron-secret") ?? url.searchParams.get("cron_secret") ?? "";
  if (!provided) return new Response("Unauthorized", { status: 401 });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("internal_settings")
    .select("value")
    .eq("key", "cron_token")
    .single();

  const expected = (data as { value?: string } | null)?.value ?? "";
  if (!expected || provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}
