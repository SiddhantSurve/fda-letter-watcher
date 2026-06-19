import { createFileRoute } from "@tanstack/react-router";
import { fetchListing, fetchBinary, slugifyFromUrl } from "@/lib/fda-scraper.server";

export const Route = createFileRoute("/api/public/hooks/scrape-fda")({
  server: {
    handlers: {
      POST: handler,
      GET: handler,
    },
  },
});

async function handler() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = await fetchListing();

    // Find which letter_urls are new
    const urls = rows.map((r) => r.letter_url);
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("warning_letters")
      .select("letter_url")
      .in("letter_url", urls);
    if (exErr) throw exErr;
    const existingSet = new Set((existing ?? []).map((r) => r.letter_url));

    const newRows = rows.filter((r) => !existingSet.has(r.letter_url));
    const results: Array<{ url: string; ok: boolean; error?: string }> = [];

    for (const row of newRows) {
      try {
        const slug = slugifyFromUrl(row.letter_url);

        // Download main letter (HTML page)
        const letter = await fetchBinary(row.letter_url);
        const letterPath = `letters/${slug}.html`;
        const up1 = await supabaseAdmin.storage
          .from("warning-letters")
          .upload(letterPath, letter.body, { contentType: letter.contentType, upsert: true });
        if (up1.error) throw up1.error;

        let response_storage_path: string | null = null;
        if (row.response_url) {
          try {
            const resp = await fetchBinary(row.response_url);
            const ext = resp.contentType.includes("pdf") ? "pdf" : "bin";
            response_storage_path = `responses/${slug}.${ext}`;
            const up = await supabaseAdmin.storage
              .from("warning-letters")
              .upload(response_storage_path, resp.body, { contentType: resp.contentType, upsert: true });
            if (up.error) throw up.error;
          } catch (e) {
            console.error("response download failed", row.response_url, e);
            response_storage_path = null;
          }
        }

        let closeout_storage_path: string | null = null;
        if (row.closeout_url) {
          try {
            const co = await fetchBinary(row.closeout_url);
            const ext = co.contentType.includes("pdf") ? "pdf" : "bin";
            closeout_storage_path = `closeouts/${slug}.${ext}`;
            const up = await supabaseAdmin.storage
              .from("warning-letters")
              .upload(closeout_storage_path, co.body, { contentType: co.contentType, upsert: true });
            if (up.error) throw up.error;
          } catch (e) {
            console.error("closeout download failed", row.closeout_url, e);
            closeout_storage_path = null;
          }
        }

        const { error: insErr } = await supabaseAdmin.from("warning_letters").insert({
          letter_url: row.letter_url,
          posted_date: row.posted_date,
          issue_date: row.issue_date,
          company_name: row.company_name,
          issuing_office: row.issuing_office,
          subject: row.subject,
          excerpt: row.excerpt,
          letter_storage_path: letterPath,
          response_url: row.response_url,
          response_storage_path,
          closeout_url: row.closeout_url,
          closeout_storage_path,
        });
        if (insErr) throw insErr;
        results.push({ url: row.letter_url, ok: true });
      } catch (e: any) {
        console.error("Failed to ingest", row.letter_url, e);
        results.push({ url: row.letter_url, ok: false, error: String(e?.message ?? e) });
      }
    }

    // Also: backfill response/closeout for previously-stored rows that now have new links
    const { data: stored } = await supabaseAdmin
      .from("warning_letters")
      .select("id, letter_url, response_url, response_storage_path, closeout_url, closeout_storage_path")
      .in("letter_url", urls);
    const storedMap = new Map((stored ?? []).map((r) => [r.letter_url, r]));
    for (const row of rows) {
      const s = storedMap.get(row.letter_url);
      if (!s) continue;
      const updates: {
        response_url?: string;
        response_storage_path?: string;
        closeout_url?: string;
        closeout_storage_path?: string;
      } = {};
      const slug = slugifyFromUrl(row.letter_url);

      if (row.response_url && !s.response_storage_path) {
        try {
          const resp = await fetchBinary(row.response_url);
          const ext = resp.contentType.includes("pdf") ? "pdf" : "bin";
          const p = `responses/${slug}.${ext}`;
          const up = await supabaseAdmin.storage
            .from("warning-letters")
            .upload(p, resp.body, { contentType: resp.contentType, upsert: true });
          if (!up.error) {
            updates.response_url = row.response_url;
            updates.response_storage_path = p;
          }
        } catch (e) { console.error("backfill response", e); }
      }
      if (row.closeout_url && !s.closeout_storage_path) {
        try {
          const co = await fetchBinary(row.closeout_url);
          const ext = co.contentType.includes("pdf") ? "pdf" : "bin";
          const p = `closeouts/${slug}.${ext}`;
          const up = await supabaseAdmin.storage
            .from("warning-letters")
            .upload(p, co.body, { contentType: co.contentType, upsert: true });
          if (!up.error) {
            updates.closeout_url = row.closeout_url;
            updates.closeout_storage_path = p;
          }
        } catch (e) { console.error("backfill closeout", e); }
      }
      if (Object.keys(updates).length) {
        await supabaseAdmin.from("warning_letters").update(updates).eq("id", s.id);
      }
    }

    return Response.json({
      ok: true,
      total_listed: rows.length,
      new_ingested: results.filter((r) => r.ok).length,
      failures: results.filter((r) => !r.ok),
    });
  } catch (e: any) {
    console.error("scrape-fda failed", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
