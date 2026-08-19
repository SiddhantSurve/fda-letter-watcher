import { createFileRoute } from "@tanstack/react-router";
import { fetchAllListings } from "@/lib/fda-scraper.server";

export const Route = createFileRoute("/api/public/hooks/scrape-fda")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});

function verifyCronAuth(request: Request): Response | null {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!auth || auth !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }
  return null;
}

// Listing-only pass: fetches the full FDA catalog (~3,500+ rows) via the
// JSON datatables endpoint and upserts metadata. Files are downloaded
// separately by /api/public/hooks/process-pending in batches.
async function handler({ request }: { request: Request }) {
  const authErr = verifyCronAuth(request);
  if (authErr) return authErr;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = await fetchAllListings();

    const { data: existing, error: exErr } = await supabaseAdmin
      .from("warning_letters")
      .select("letter_url, response_url, closeout_url");
    if (exErr) throw exErr;
    const existingMap = new Map(
      (existing ?? []).map((r) => [r.letter_url, r] as const),
    );

    const toInsert: Array<Record<string, unknown>> = [];
    const toUpdate: Array<{ letter_url: string; response_url: string | null; closeout_url: string | null }> = [];

    for (const r of rows) {
      const existing = existingMap.get(r.letter_url);
      if (!existing) {
        toInsert.push({
          letter_url: r.letter_url,
          posted_date: r.posted_date,
          issue_date: r.issue_date,
          company_name: r.company_name,
          issuing_office: r.issuing_office,
          subject: r.subject,
          excerpt: r.excerpt,
          response_url: r.response_url,
          closeout_url: r.closeout_url,
        });
      } else if (
        existing.response_url !== r.response_url ||
        existing.closeout_url !== r.closeout_url
      ) {
        toUpdate.push({
          letter_url: r.letter_url,
          response_url: r.response_url,
          closeout_url: r.closeout_url,
        });
      }
    }

    // Insert in chunks
    for (let i = 0; i < toInsert.length; i += 500) {
      const chunk = toInsert.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("warning_letters").upsert(chunk as never, { onConflict: "letter_url", ignoreDuplicates: true });
      if (error) throw error;
    }

    // Patch response/closeout url additions on existing rows
    for (const u of toUpdate) {
      await supabaseAdmin
        .from("warning_letters")
        .update({ response_url: u.response_url, closeout_url: u.closeout_url })
        .eq("letter_url", u.letter_url);
    }

    return Response.json({
      ok: true,
      total_listed: rows.length,
      new_rows: toInsert.length,
      url_updates: toUpdate.length,
    });
  } catch (e) {
    const err = e as Error;
    console.error("scrape-fda failed", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
