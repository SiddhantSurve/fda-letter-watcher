import { generateText } from "ai";
import { lovableGateway } from "./ai-gateway.server";

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function summarizeLetter(opts: {
  company: string;
  subject: string;
  letterHtml?: string;
  excerpt?: string;
}): Promise<string> {
  const gateway = lovableGateway();
  const text = (opts.letterHtml ? htmlToText(opts.letterHtml) : opts.excerpt ?? "").slice(0, 12000);
  const prompt = `Summarize this FDA warning letter in 3-4 sentences. Capture: the specific violations cited, the product/facility involved, and any corrective actions demanded. Be factual and concise.

Company: ${opts.company}
Subject: ${opts.subject}

Letter content:
${text}`;
  const { text: summary } = await generateText({
    model: gateway("google/gemini-3-flash-preview"),
    prompt,
  });
  return summary.trim();
}
