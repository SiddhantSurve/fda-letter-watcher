import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { createThread, listThreads } from "@/lib/chat.functions";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Warning Letters — FDA Letter Tracker" },
      {
        name: "description",
        content: "Search, summarize, and ask questions across FDA warning letters.",
      },
      { property: "og:title", content: "Warning Letters — FDA Letter Tracker" },
      {
        property: "og:description",
        content: "Search, summarize, and ask questions across FDA warning letters.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WarningArchiveEntry,
});

function WarningArchiveEntry() {
  const navigate = useNavigate();
  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const openWarningArchive = async () => {
      try {
        const threads = await list({ data: { kind: "warning" } });
        const threadId = threads[0]?.id ?? (await create({ data: { kind: "warning" } })).id;
        await navigate({
          to: "/chat/$threadId",
          params: { threadId },
          replace: true,
        });
      } catch {
        await navigate({ to: "/auth", replace: true });
      }
    };

    void openWarningArchive();
  }, [create, list, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        Opening Warning Letters…
      </div>
    </main>
  );
}