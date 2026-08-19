import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { lovableGateway } from "@/lib/ai-gateway.server";

const Input = z.object({ letterId: z.string().uuid() });

function extractPromoUrl(excerpt: string | null): string | null {
  if (!excerpt) return null;
  const m = excerpt.match(/https?:\/\/\S+/);
  return m ? m[0] : null;
}

export const summarizeLetter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: letter, error } = await supabaseAdmin
      .from("warning_letters")
      .select(
        "id, company_name, subject, letter_url, letter_storage_path, letter_kind, issue_date, issuing_office, excerpt, response_url, closeout_url",
      )
      .eq("id", data.letterId)
      .single();
    if (error || !letter) throw new Error("Letter not found");

    const isUntitled = letter.letter_kind === "untitled";
    const promoUrl = extractPromoUrl(letter.excerpt);

    const { getLetterText } = await import("@/lib/letter-context.server");

    let letterText = "";
    if (!isUntitled) {
      letterText = await getLetterText({
        letterUrl: letter.letter_url,
        storagePath: letter.letter_storage_path,
      });
      if (!letterText) throw new Error("Could not retrieve letter text");
    }

    const [responseText, closeoutText] = await Promise.all([
      letter.response_url
        ? getLetterText({ letterUrl: letter.response_url, storagePath: null })
        : Promise.resolve(""),
      letter.closeout_url
        ? getLetterText({ letterUrl: letter.closeout_url, storagePath: null })
        : Promise.resolve(""),
    ]);

    const gateway = lovableGateway();
    const kindLabel = isUntitled ? "FDA untitled letter" : "FDA warning letter";

    const parts: string[] = [];
    parts.push(`Company: ${letter.company_name}`);
    parts.push(`Product/Subject: ${letter.subject ?? "—"}`);
    parts.push(`Issued: ${letter.issue_date ?? "—"}  Office: ${letter.issuing_office ?? "—"}`);
    parts.push(`Source: ${letter.letter_url}`);
    if (promoUrl) parts.push(`Promotional material PDF: ${promoUrl}`);
    if (letter.response_url) parts.push(`Response letter URL: ${letter.response_url}`);
    if (letter.closeout_url) parts.push(`Close-out letter URL: ${letter.closeout_url}`);

    if (isUntitled) {
      parts.push(
        "\n(The primary letter is a PDF and was not parsed to text — use metadata + general OPDP enforcement knowledge.)",
      );
    } else {
      parts.push(`\n--- Letter text ---\n${letterText}`);
    }
    if (responseText) parts.push(`\n--- Response letter text ---\n${responseText}`);
    if (closeoutText) parts.push(`\n--- Close-out letter text ---\n${closeoutText}`);

    const { text: summary } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      messages: [
        {
          role: "system",
          content: `You summarize ${kindLabel}s with extreme concision. Output plain markdown with exactly these sections: **Issue**, **Solution**, **Next Steps**. If a response letter or close-out letter is provided, add a **Response / Close-out** section noting the company's response and any FDA close-out (1-3 short bullets). Use short bullets. The entire output must be 15 lines or fewer. No preamble, no closing remarks.`,
        },
        { role: "user", content: parts.join("\n") },
      ],
    });

    return { summary };
  });
