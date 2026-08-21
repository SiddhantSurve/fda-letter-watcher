import { createFileRoute } from "@tanstack/react-router";
import { fetchAllListings } from "@/lib/fda-scraper.server";
import { assertCronAuthorized } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/hooks/scrape-fda")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});

// Listing-only pass: fetches the full FDA catalog (~3,500+ rows) via the
// JSON datatables endpoint and upserts metadata. Files are downloaded
// separately by /api/public/hooks/process-pending in batches.
async function handler({ request }: { request: Request }) {
  const denied = await assertCronAuthorized(request);
  if (denied) return denied;
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

    // Notify subscribers about newly-added warning letters
    if (toInsert.length > 0) {
      try {
        const { data: newRows } = await supabaseAdmin
          .from("warning_letters")
          .select("id, company_name, subject, posted_date, issuing_office, excerpt, letter_url")
          .in("letter_url", toInsert.map((r) => r["letter_url"] as string));
        if (newRows && newRows.length > 0) {
          const { notifyNewLetters } = await import("@/lib/notify-new-letters.server");
          await notifyNewLetters("warning", newRows as never);
        }
      } catch (e) {
        console.error("notifyNewLetters (warning) failed", e);
      }
    }

    // Patch response/closeout url additions on existing rows
    for (const u of toUpdate) {
      await supabaseAdmin
        .from("warning_letters")
        .update({ response_url: u.response_url, closeout_url: u.closeout_url })
        .eq("letter_url", u.letter_url);
    }

    // ---- Untitled letters catalog ----
    let untitledListed = 0;
    let untitledNew = 0;
    try {
      const { fetchUntitledListings } = await import("@/lib/untitled-scraper.server");
      const uRows = await fetchUntitledListings();
      untitledListed = uRows.length;
      const { data: uExisting } = await supabaseAdmin
        .from("warning_letters")
        .select("letter_url")
        .eq("letter_kind", "untitled");
      const uSeen = new Set((uExisting ?? []).map((r) => r.letter_url));
      const uInsert = uRows
        .filter((r) => !uSeen.has(r.letter_url))
        .map((r) => ({
          letter_url: r.letter_url,
          posted_date: r.posted_date,
          issue_date: r.issue_date,
          company_name: r.company_name,
          issuing_office: r.issuing_office,
          subject: r.subject,
          excerpt: r.excerpt,
          response_url: r.response_url,
          closeout_url: r.closeout_url,
          letter_kind: "untitled",
        }));
      untitledNew = uInsert.length;
      for (let i = 0; i < uInsert.length; i += 500) {
        await supabaseAdmin
          .from("warning_letters")
          .upsert(uInsert.slice(i, i + 500) as never, { onConflict: "letter_url", ignoreDuplicates: true });
      }
      if (uInsert.length > 0) {
        const { data: newRows } = await supabaseAdmin
          .from("warning_letters")
          .select("id, company_name, subject, posted_date, issuing_office, excerpt, letter_url")
          .eq("letter_kind", "untitled")
          .in("letter_url", uInsert.map((r) => r.letter_url));
        if (newRows && newRows.length > 0) {
          const { notifyNewLetters } = await import("@/lib/notify-new-letters.server");
          await notifyNewLetters("untitled", newRows as never);
        }
      }
    } catch (e) {
      console.error("untitled scrape/notify failed", e);
    }

    return Response.json({
      ok: true,
      total_listed: rows.length,
      new_rows: toInsert.length,
      url_updates: toUpdate.length,
      untitled_listed: untitledListed,
      untitled_new: untitledNew,
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
