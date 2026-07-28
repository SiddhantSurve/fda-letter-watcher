import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/letter-file/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const kind = url.searchParams.get("kind") ?? "letter";
        const column =
          kind === "closeout"
            ? "closeout_url"
            : kind === "response"
              ? "response_url"
              : "letter_url";

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: letter, error } = await supabaseAdmin
          .from("warning_letters")
          .select(`id, company_name, ${column}`)
          .eq("id", params.id)
          .single();
        if (error || !letter) return new Response("Not found", { status: 404 });

        const target = (letter as Record<string, string | null>)[column];
        if (!target) return new Response("No file", { status: 404 });

        const upstream = await fetch(target, {
          headers: { "User-Agent": "Mozilla/5.0 FDAInsights" },
          redirect: "follow",
        });
        if (!upstream.ok || !upstream.body) {
          return new Response("Upstream fetch failed", { status: 502 });
        }

        const contentType =
          upstream.headers.get("content-type") ?? "application/octet-stream";
        const isPdf = contentType.includes("pdf");
        const safeName =
          (letter.company_name || "letter")
            .replace(/[^a-z0-9]+/gi, "-")
            .toLowerCase()
            .slice(0, 60) || "letter";
        const ext = isPdf ? "pdf" : contentType.includes("html") ? "html" : "bin";
        const filename = `${safeName}-${kind}.${ext}`;

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
