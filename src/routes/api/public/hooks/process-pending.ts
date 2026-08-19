import { createFileRoute } from "@tanstack/react-router";
import { fetchBinary, slugifyFromUrl } from "@/lib/fda-scraper.server";
import { summarizeLetter } from "@/lib/summarize.server";

export const Route = createFileRoute("/api/public/hooks/process-pending")({
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

async function handler({ request }: { request: Request }) {
  const authErr = verifyCronAuth(request);
  if (authErr) return authErr;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "10"), 25);

    // Rows that still need a download or summary
    const { data: pending, error } = await supabaseAdmin
      .from("warning_letters")
      .select("id, letter_url, response_url, response_storage_path, closeout_url, closeout_storage_path, letter_storage_path, company_name, subject, excerpt, summary")
      .or("letter_storage_path.is.null,summary.is.null,and(response_url.not.is.null,response_storage_path.is.null),and(closeout_url.not.is.null,closeout_storage_path.is.null)")
      .limit(limit);
    if (error) throw error;

    let processed = 0;
    const failures: Array<{ url: string; error: string }> = [];

    for (const row of pending ?? []) {
      try {
        const slug = slugifyFromUrl(row.letter_url);
        const updates: Record<string, string> = {};
        let letterHtml: string | undefined;

        if (!row.letter_storage_path) {
          const letter = await fetchBinary(row.letter_url);
          const path = `letters/${slug}.html`;
          const up = await supabaseAdmin.storage
            .from("warning-letters")
            .upload(path, letter.body, { contentType: letter.contentType, upsert: true });
          if (up.error) throw up.error;
          updates.letter_storage_path = path;
          letterHtml = new TextDecoder().decode(letter.body);
        }

        // Generate AI summary if missing
        if (!row.summary) {
          if (!letterHtml && row.letter_storage_path) {
            try {
              const { data: dl } = await supabaseAdmin.storage.from("warning-letters").download(row.letter_storage_path);
              if (dl) letterHtml = await dl.text();
            } catch { /* ignore */ }
          }
          try {
            const summary = await summarizeLetter({
              company: row.company_name,
              subject: row.subject ?? "",
              letterHtml,
              excerpt: row.excerpt ?? undefined,
            });
            if (summary) updates.summary = summary;
          } catch (e) { console.error("summary fail", e); }
        }

        if (row.response_url && !row.response_storage_path) {
          try {
            const resp = await fetchBinary(row.response_url);
            const ext = resp.contentType.includes("pdf") ? "pdf" : "bin";
            const path = `responses/${slug}.${ext}`;
            const up = await supabaseAdmin.storage
              .from("warning-letters")
              .upload(path, resp.body, { contentType: resp.contentType, upsert: true });
            if (!up.error) updates.response_storage_path = path;
          } catch (e) { console.error("response fail", e); }
        }

        if (row.closeout_url && !row.closeout_storage_path) {
          try {
            const co = await fetchBinary(row.closeout_url);
            const ext = co.contentType.includes("pdf") ? "pdf" : "bin";
            const path = `closeouts/${slug}.${ext}`;
            const up = await supabaseAdmin.storage
              .from("warning-letters")
              .upload(path, co.body, { contentType: co.contentType, upsert: true });
            if (!up.error) updates.closeout_storage_path = path;
          } catch (e) { console.error("closeout fail", e); }
        }

        if (Object.keys(updates).length) {
          await supabaseAdmin.from("warning_letters").update(updates as never).eq("id", row.id);
        }
        processed++;
      } catch (e) {
        const err = e as Error;
        failures.push({ url: row.letter_url, error: err.message });
      }
    }

    const { count: remaining } = await supabaseAdmin
      .from("warning_letters")
      .select("id", { count: "exact", head: true })
      .or("letter_storage_path.is.null,summary.is.null,and(response_url.not.is.null,response_storage_path.is.null),and(closeout_url.not.is.null,closeout_storage_path.is.null)");

    return Response.json({ ok: true, processed, remaining: remaining ?? 0, failures });
  } catch (e) {
    const err = e as Error;
    console.error("process-pending failed", err);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

