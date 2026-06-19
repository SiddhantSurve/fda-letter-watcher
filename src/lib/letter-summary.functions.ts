import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const Input = z.object({ letterId: z.string().uuid() });

export const summarizeLetter = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: letter, error } = await supabaseAdmin
      .from("warning_letters")
      .select("id, company_name, subject, letter_url, letter_storage_path")
      .eq("id", data.letterId)
      .single();
    if (error || !letter) throw new Error("Letter not found");

    const { getLetterText } = await import("@/lib/letter-context.server");
    const text = await getLetterText({
      letterUrl: letter.letter_url,
      storagePath: letter.letter_storage_path,
    });
    if (!text) throw new Error("Could not retrieve letter text");

    const gateway = createLovableAiGatewayProvider(key);
    const { text: summary } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      messages: [
        {
          role: "system",
          content:
            "You summarize FDA warning letters with extreme concision. Output plain markdown with exactly three sections: **Issue**, **Solution**, **Next Steps**. Use short bullets. The entire output must be 15 lines or fewer. No preamble, no closing remarks.",
        },
        {
          role: "user",
          content: `Company: ${letter.company_name}\nSubject: ${letter.subject ?? "—"}\n\nLetter text:\n${text}`,
        },
      ],
    });

    return { summary };
  });
