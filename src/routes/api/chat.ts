import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { lovableGateway } from "@/lib/ai-gateway.server";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { messages?: UIMessage[]; threadId?: string };
          const messages = body.messages ?? [];
          if (!Array.isArray(messages) || messages.length === 0) {
            return new Response("messages required", { status: 400 });
          }

          // Verify user from bearer token
          const auth = request.headers.get("authorization");
          if (!auth?.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401 });
          const token = auth.slice(7);

          const { createClient } = await import("@supabase/supabase-js");
          const supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_PUBLISHABLE_KEY!,
            { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
          );
          const { data: claims } = await supabase.auth.getClaims(token);
          const userId = claims?.claims?.sub;
          if (!userId) return new Response("Unauthorized", { status: 401 });

          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          const userText = lastUser
            ? lastUser.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim()
            : "";

          // Keyword search over letter summaries / metadata
          const tokens = Array.from(
            new Set(
              userText
                .toLowerCase()
                .replace(/[^\w\s]/g, " ")
                .split(/\s+/)
                .filter((t) => t.length > 3 && !STOP.has(t)),
            ),
          ).slice(0, 8);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          let matches: Array<{ company_name: string; subject: string; posted_date: string | null; issuing_office: string | null; summary: string | null; excerpt: string | null; letter_url: string }> = [];
          if (tokens.length > 0) {
            const orExpr = tokens
              .map((t) => `summary.ilike.%${t}%,company_name.ilike.%${t}%,subject.ilike.%${t}%,issuing_office.ilike.%${t}%,excerpt.ilike.%${t}%`)
              .join(",");
            const { data } = await supabaseAdmin
              .from("warning_letters")
              .select("company_name, subject, posted_date, issuing_office, summary, excerpt, letter_url")
              .or(orExpr)
              .limit(12);
            matches = data ?? [];
          }

          const context = matches.length
            ? matches
                .map(
                  (m, i) =>
                    `[${i + 1}] ${m.company_name} — ${m.subject} (posted ${m.posted_date ?? "?"}, ${m.issuing_office ?? "?"})\nSummary: ${m.summary ?? m.excerpt ?? "(no summary yet)"}\nSource: ${m.letter_url}`,
                )
                .join("\n\n")
            : "(no matching letters found in the archive)";

          const system = `You are an expert assistant answering questions about FDA warning letters. Use ONLY the provided letter excerpts below to answer. If the answer isn't in them, say so. Always cite letters by [number] and include the company name.

Retrieved letters:
${context}`;

          const gateway = lovableGateway();
          const result = streamText({
            model: gateway("google/gemini-3-flash-preview"),
            system,
            messages: await convertToModelMessages(messages),
            onFinish: async ({ text }) => {
              if (!body.threadId) return;
              try {
                // Persist both the latest user message and the assistant reply
                const userPayload = lastUser
                  ? { thread_id: body.threadId, user_id: userId, role: "user", content: { parts: lastUser.parts } as never }
                  : null;
                const inserts = [
                  ...(userPayload ? [userPayload] : []),
                  {
                    thread_id: body.threadId,
                    user_id: userId,
                    role: "assistant",
                    content: { parts: [{ type: "text", text }] } as never,
                  },
                ];
                await supabase.from("chat_messages").insert(inserts as never);

                // Auto-title thread on first exchange
                if (userText) {
                  const { count } = await supabase
                    .from("chat_messages")
                    .select("id", { count: "exact", head: true })
                    .eq("thread_id", body.threadId);
                  if ((count ?? 0) <= 2) {
                    await supabase
                      .from("chat_threads")
                      .update({ title: userText.slice(0, 80) })
                      .eq("id", body.threadId);
                  }
                }
              } catch (e) {
                console.error("persist chat fail", e);
              }
            },
          });

          return result.toUIMessageStreamResponse({ originalMessages: messages });
        } catch (e) {
          console.error("chat route fail", e);
          return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
        }
      },
    },
  },
});

const STOP = new Set([
  "what","when","where","which","there","their","about","would","could","should","these","those","does","with","this","that","from","have","been","were","into","they","them","than","then","just","like","also","such","more","most","some","many","much","very","over","under","tell","show","find","give","list","based","using","summary","summarize","letter","letters","warning","warnings","fda","please","question","answer","describe","explain","compare","between","example",
]);
