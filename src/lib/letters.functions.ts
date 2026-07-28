import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

function publicClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
  );
}

export const listLetters = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({
      search: z.string().optional(),
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional(),
      kind: z.enum(["warning", "untitled"]).optional(),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      sort: z.enum(["posted_desc", "posted_asc", "company_asc", "company_desc"]).optional(),
    }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const limit = data.limit ?? 50;
    const offset = data.offset ?? 0;
    const kind = data.kind ?? "warning";
    const sort = data.sort ?? "posted_desc";

    const sortMap: Record<typeof sort, { column: string; ascending: boolean; nullsFirst?: boolean }> = {
      posted_desc: { column: "posted_on", ascending: false, nullsFirst: false },
      posted_asc: { column: "posted_on", ascending: true, nullsFirst: true },
      company_asc: { column: "company_name", ascending: true },
      company_desc: { column: "company_name", ascending: false },
    };
    const { column, ascending, nullsFirst } = sortMap[sort];

    let q = supabase
      .from("warning_letters")
      .select("*", { count: "exact" })
      .eq("letter_kind", kind)
      .order(column, ascending ? { ascending: true, nullsFirst: nullsFirst ?? false } : { ascending: false, nullsFirst: nullsFirst ?? false })
      .range(offset, offset + limit - 1);
    // Stable tie-breaker for date sorts
    if (column === "posted_on") {
      q = q.order("created_at", { ascending: false });
    }
    if (data.from) q = q.gte("posted_on", data.from);
    if (data.to) q = q.lte("posted_on", data.to);
    if (data.search) {
      const s = data.search.replace(/[%_]/g, "");
      q = q.or(`company_name.ilike.%${s}%,subject.ilike.%${s}%,issuing_office.ilike.%${s}%`);
    }
    const { data: rows, error, count } = await q;
    if (error) throw error;
    return { letters: rows ?? [], total: count ?? 0 };
  });

export const getStats = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({ kind: z.enum(["warning", "untitled"]).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const supabase = publicClient();
    const kind = data.kind ?? "warning";
    const base = () =>
      supabase.from("warning_letters").select("id", { count: "exact", head: true }).eq("letter_kind", kind);
    const [total, withLetter, withResponse, withCloseout, pending] = await Promise.all([
      base(),
      base().not("letter_storage_path", "is", null),
      base().not("response_storage_path", "is", null),
      base().not("closeout_storage_path", "is", null),
      base().or("letter_storage_path.is.null,and(response_url.not.is.null,response_storage_path.is.null),and(closeout_url.not.is.null,closeout_storage_path.is.null)"),
    ]);
    return {
      total: total.count ?? 0,
      archived: withLetter.count ?? 0,
      withResponse: withResponse.count ?? 0,
      withCloseout: withCloseout.count ?? 0,
      pending: pending.count ?? 0,
    };
  });

export const getDownloadUrl = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ path: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("warning-letters")
      .createSignedUrl(data.path, 60 * 10);
    if (error) throw error;
    return { url: signed.signedUrl };
  });

export const refreshCatalog = createServerFn({ method: "POST" }).handler(async () => {
  const { fetchAllListings } = await import("@/lib/fda-scraper.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows = await fetchAllListings();
  const { data: existing } = await supabaseAdmin
    .from("warning_letters")
    .select("letter_url, response_url, closeout_url");
  const existingMap = new Map((existing ?? []).map((r) => [r.letter_url, r] as const));
  const toInsert = rows
    .filter((r) => !existingMap.has(r.letter_url))
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
    }));
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
        .in("letter_url", toInsert.map((r) => r.letter_url));
      if (newRows && newRows.length > 0) {
        const { notifyNewLetters } = await import("@/lib/notify-new-letters.server");
        await notifyNewLetters("warning", newRows as never);
      }
    } catch (e) {
      console.error("notifyNewLetters (warning) failed", e);
    }
  }
  // Patch newly-added response/closeout URLs onto existing rows
  let urlUpdates = 0;
  for (const r of rows) {
    const ex = existingMap.get(r.letter_url);
    if (!ex) continue;
    if (ex.response_url !== r.response_url || ex.closeout_url !== r.closeout_url) {
      await supabaseAdmin
        .from("warning_letters")
        .update({ response_url: r.response_url, closeout_url: r.closeout_url })
        .eq("letter_url", r.letter_url);
      urlUpdates++;
    }
  }
  return { total_listed: rows.length, new_rows: toInsert.length, url_updates: urlUpdates };
});

export const refreshUntitledCatalog = createServerFn({ method: "POST" }).handler(async () => {
  const { fetchUntitledListings } = await import("@/lib/untitled-scraper.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows = await fetchUntitledListings();
  const { data: existing } = await supabaseAdmin
    .from("warning_letters")
    .select("letter_url, response_url, closeout_url")
    .eq("letter_kind", "untitled");
  const existingMap = new Map((existing ?? []).map((r) => [r.letter_url, r] as const));
  const toInsert = rows
    .filter((r) => !existingMap.has(r.letter_url))
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
  for (let i = 0; i < toInsert.length; i += 500) {
    const chunk = toInsert.slice(i, i + 500);
    const { error } = await supabaseAdmin
      .from("warning_letters")
      .upsert(chunk as never, { onConflict: "letter_url", ignoreDuplicates: true });
    if (error) throw error;
  }
  let urlUpdates = 0;
  for (const r of rows) {
    const ex = existingMap.get(r.letter_url);
    if (!ex) continue;
    if (ex.response_url !== r.response_url || ex.closeout_url !== r.closeout_url) {
      await supabaseAdmin
        .from("warning_letters")
        .update({ response_url: r.response_url, closeout_url: r.closeout_url })
        .eq("letter_url", r.letter_url);
      urlUpdates++;
    }
  }
  return { total_listed: rows.length, new_rows: toInsert.length, url_updates: urlUpdates };
});

export const processBatch = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ limit: z.number().int().min(1).max(50).optional() }).parse(input ?? {}))
  .handler(async ({ data }) => {
    const { fetchBinary, slugifyFromUrl } = await import("@/lib/fda-scraper.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const limit = data.limit ?? 20;
    const { data: pending, error } = await supabaseAdmin
      .from("warning_letters")
      .select("id, letter_url, response_url, response_storage_path, closeout_url, closeout_storage_path, letter_storage_path")
      .or("letter_storage_path.is.null,and(response_url.not.is.null,response_storage_path.is.null),and(closeout_url.not.is.null,closeout_storage_path.is.null)")
      .limit(limit);
    if (error) throw error;
    let processed = 0;
    for (const row of pending ?? []) {
      try {
        const slug = slugifyFromUrl(row.letter_url);
        const updates: Record<string, string> = {};
        if (!row.letter_storage_path) {
          const letter = await fetchBinary(row.letter_url);
          const path = `letters/${slug}.html`;
          const up = await supabaseAdmin.storage.from("warning-letters").upload(path, letter.body, { contentType: letter.contentType, upsert: true });
          if (up.error) throw up.error;
          updates.letter_storage_path = path;
        }
        if (row.response_url && !row.response_storage_path) {
          try {
            const resp = await fetchBinary(row.response_url);
            const ext = resp.contentType.includes("pdf") ? "pdf" : "bin";
            const path = `responses/${slug}.${ext}`;
            const up = await supabaseAdmin.storage.from("warning-letters").upload(path, resp.body, { contentType: resp.contentType, upsert: true });
            if (!up.error) updates.response_storage_path = path;
          } catch (e) { console.error("response fail", e); }
        }
        if (row.closeout_url && !row.closeout_storage_path) {
          try {
            const co = await fetchBinary(row.closeout_url);
            const ext = co.contentType.includes("pdf") ? "pdf" : "bin";
            const path = `closeouts/${slug}.${ext}`;
            const up = await supabaseAdmin.storage.from("warning-letters").upload(path, co.body, { contentType: co.contentType, upsert: true });
            if (!up.error) updates.closeout_storage_path = path;
          } catch (e) { console.error("closeout fail", e); }
        }
        if (Object.keys(updates).length) {
          await supabaseAdmin.from("warning_letters").update(updates as never).eq("id", row.id);
        }
        processed++;
      } catch (e) {
        console.error("ingest fail", row.letter_url, e);
      }
    }
    const { count: remaining } = await supabaseAdmin
      .from("warning_letters")
      .select("id", { count: "exact", head: true })
      .or("letter_storage_path.is.null,and(response_url.not.is.null,response_storage_path.is.null),and(closeout_url.not.is.null,closeout_storage_path.is.null)");
    return { processed, remaining: remaining ?? 0 };
  });
