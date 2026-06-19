import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { lovableGateway } from "@/lib/ai-gateway.server";

const Input = z.object({ letterId: z.string().uuid() });

export const summarizeLetter = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {


    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: letter, error } = await supabaseAdmin
      .from("warning_letters")
      .select("id, company_name, subject, letter_url, letter_storage_path, letter_kind, issue_date, issuing_office")
      .eq("id", data.letterId)
      .single();
    if (error || !letter) throw new Error("Letter not found");

    const isUntitled = letter.letter_kind === "untitled";
    let text = "";
    if (!isUntitled) {
      const { getLetterText } = await import("@/lib/letter-context.server");
      text = await getLetterText({
        letterUrl: letter.letter_url,
        storagePath: letter.letter_storage_path,
      });
      if (!text) throw new Error("Could not retrieve letter text");
    }

    const gateway = lovableGateway();
    const kindLabel = isUntitled ? "FDA untitled letter" : "FDA warning letter";
    const userContent = isUntitled
      ? `This is an ${kindLabel} (PDF — content not parsed). Use only metadata + general OPDP enforcement knowledge.\n\nCompany: ${letter.company_name}\nProduct/Issue: ${letter.subject ?? "—"}\nIssued: ${letter.issue_date ?? "—"}\nOffice: ${letter.issuing_office ?? "—"}\nSource PDF: ${letter.letter_url}`
      : `Company: ${letter.company_name}\nSubject: ${letter.subject ?? "—"}\n\nLetter text:\n${text}`;

    const { text: summary } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      messages: [
        {
          role: "system",
          content: `You summarize ${kindLabel}s with extreme concision. Output plain markdown with exactly three sections: **Issue**, **Solution**, **Next Steps**. Use short bullets. The entire output must be 15 lines or fewer. No preamble, no closing remarks.`,
        },
        { role: "user", content: userContent },
      ],
    });

    return { summary };
  });
