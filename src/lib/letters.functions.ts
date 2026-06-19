import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const listLetters = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
  );
  const { data, error } = await supabase
    .from("warning_letters")
    .select("*")
    .order("posted_date", { ascending: false })
    .limit(500);
  if (error) throw error;
  return { letters: data ?? [] };
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

export const triggerScan = createServerFn({ method: "POST" }).handler(async () => {
  const { fetchListing, fetchBinary, slugifyFromUrl } = await import("@/lib/fda-scraper.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const rows = await fetchListing();
  const urls = rows.map((r) => r.letter_url);
  const { data: existing } = await supabaseAdmin
    .from("warning_letters")
    .select("letter_url")
    .in("letter_url", urls);
  const existingSet = new Set((existing ?? []).map((r) => r.letter_url));
  const newRows = rows.filter((r) => !existingSet.has(r.letter_url));
  let ingested = 0;
  for (const row of newRows.slice(0, 25)) {
    try {
      const slug = slugifyFromUrl(row.letter_url);
      const letter = await fetchBinary(row.letter_url);
      const letterPath = `letters/${slug}.html`;
      await supabaseAdmin.storage
        .from("warning-letters")
        .upload(letterPath, letter.body, { contentType: letter.contentType, upsert: true });

      let response_storage_path: string | null = null;
      if (row.response_url) {
        try {
          const resp = await fetchBinary(row.response_url);
          const ext = resp.contentType.includes("pdf") ? "pdf" : "bin";
          response_storage_path = `responses/${slug}.${ext}`;
          await supabaseAdmin.storage
            .from("warning-letters")
            .upload(response_storage_path, resp.body, { contentType: resp.contentType, upsert: true });
        } catch {}
      }
      let closeout_storage_path: string | null = null;
      if (row.closeout_url) {
        try {
          const co = await fetchBinary(row.closeout_url);
          const ext = co.contentType.includes("pdf") ? "pdf" : "bin";
          closeout_storage_path = `closeouts/${slug}.${ext}`;
          await supabaseAdmin.storage
            .from("warning-letters")
            .upload(closeout_storage_path, co.body, { contentType: co.contentType, upsert: true });
        } catch {}
      }
      await supabaseAdmin.from("warning_letters").insert({
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
      ingested++;
    } catch (e) {
      console.error("ingest fail", row.letter_url, e);
    }
  }
  return { total_listed: rows.length, new_ingested: ingested };
});
