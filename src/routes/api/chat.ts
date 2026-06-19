import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { lovableGateway } from "@/lib/ai-gateway.server";
import { getLetterText } from "@/lib/letter-context.server";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as {
            messages?: UIMessage[];
            threadId?: string;
            letterId?: string;
          };
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
            {
              global: { headers: { Authorization: `Bearer ${token}` } },
              auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
            },
          );
          const { data: claims } = await supabase.auth.getClaims(token);
          const userId = claims?.claims?.sub;
          if (!userId) return new Response("Unauthorized", { status: 401 });

          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          const userText = lastUser
            ? lastUser.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim()
            : "";

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // ── Build context ────────────────────────────────────────────────
          let system: string;

          if (body.letterId) {
            // Per-letter chat: scope strictly to one letter, fetch its full text.
            const { data: letter } = await supabaseAdmin
              .from("warning_letters")
              .select(
                "company_name, subject, posted_date, issue_date, issuing_office, letter_url, letter_storage_path",
              )
              .eq("id", body.letterId)
              .single();

            if (!letter) return new Response("Letter not found", { status: 404 });

            const text = await getLetterText({
              letterUrl: letter.letter_url,
              storagePath: letter.letter_storage_path,
            });

            system = `You are an expert assistant answering questions about a single FDA warning letter. Use ONLY the letter content below. If the answer isn't in it, say so plainly.

Letter metadata:
- Company: ${letter.company_name}
- Subject: ${letter.subject ?? "—"}
- Posted: ${letter.posted_date ?? "—"}  Issued: ${letter.issue_date ?? "—"}
- Issuing office: ${letter.issuing_office ?? "—"}
- Source: ${letter.letter_url}

Letter content:
${text || "(unable to load letter content)"}`;
          } else {
            // Archive-wide chat: keyword search → fetch full text of top matches.
            const tokens = Array.from(
              new Set(
                userText
                  .toLowerCase()
                  .replace(/[^\w\s]/g, " ")
                  .split(/\s+/)
                  .filter((t) => t.length > 3 && !STOP.has(t)),
              ),
            ).slice(0, 8);

            let matches: Array<{
              id: string;
              company_name: string;
              subject: string | null;
              posted_date: string | null;
              issuing_office: string | null;
              letter_url: string;
              letter_storage_path: string | null;
            }> = [];

            if (tokens.length > 0) {
              const orExpr = tokens
                .map(
                  (t) =>
                    `company_name.ilike.%${t}%,subject.ilike.%${t}%,issuing_office.ilike.%${t}%,excerpt.ilike.%${t}%`,
                )
                .join(",");
              const { data } = await supabaseAdmin
                .from("warning_letters")
                .select("id, company_name, subject, posted_date, issuing_office, letter_url, letter_storage_path")
                .or(orExpr)
                .limit(4);
              matches = data ?? [];
            }

            // Fetch full text for each match in parallel (capped to 4)
            const enriched = await Promise.all(
              matches.map(async (m, i) => {
                const text = await getLetterText({
                  letterUrl: m.letter_url,
                  storagePath: m.letter_storage_path,
                });
                return `[${i + 1}] ${m.company_name} — ${m.subject ?? "(no subject)"} (posted ${m.posted_date ?? "?"}, ${m.issuing_office ?? "?"})\nSource: ${m.letter_url}\n---\n${text || "(content unavailable)"}`;
              }),
            );

            const context = enriched.length
              ? enriched.join("\n\n========\n\n")
              : "(no matching letters found in the archive)";

            system = `You are an expert assistant answering questions about FDA warning letters. Use ONLY the retrieved letter content below to answer. If the answer isn't in them, say so. Cite letters by [number] and the company name.

Retrieved letters:
${context}`;
          }

          const gateway = lovableGateway();
          const result = streamText({
            model: gateway("google/gemini-3-flash-preview"),
            system,
            messages: await convertToModelMessages(messages),
            onFinish: async ({ text }) => {
              // Only persist for archive-wide threaded chats
              if (!body.threadId || body.letterId) return;
              try {
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
