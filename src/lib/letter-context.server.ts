// Server-only helper: fetch a letter's full text either from cloud storage
// (if already archived) or directly from FDA.gov. Returns plain text trimmed
// to a token-safe length for LLM context.

const MAX_CHARS = 14000;

function htmlToText(html: string): string {
  // Drop script/style entirely
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > MAX_CHARS ? cleaned.slice(0, MAX_CHARS) + "…" : cleaned;
}

export async function getLetterText(opts: {
  letterUrl: string;
  storagePath: string | null;
}): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (opts.storagePath) {
    try {
      const { data } = await supabaseAdmin.storage
        .from("warning-letters")
        .download(opts.storagePath);
      if (data) return htmlToText(await data.text());
    } catch (e) {
      console.error("storage download failed, falling back to URL", e);
    }
  }

  try {
    const res = await fetch(opts.letterUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (Lovable FDA Letter Tracker)" },
    });
    if (!res.ok) return "";
    return htmlToText(await res.text());
  } catch (e) {
    console.error("fetch letter URL failed", e);
    return "";
  }
}
