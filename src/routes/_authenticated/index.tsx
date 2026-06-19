import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { listThreads, createThread } from "@/lib/chat.functions";

export const Route = createFileRoute("/_authenticated/")({
  component: Redirector,
});

function Redirector() {
  const navigate = useNavigate();
  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);

  useEffect(() => {
    (async () => {
      const threads = await list();
      if (threads.length > 0) {
        navigate({ to: "/chat/$threadId", params: { threadId: threads[0].id }, replace: true });
      } else {
        const { id } = await create();
        navigate({ to: "/chat/$threadId", params: { threadId: id }, replace: true });
      }
    })();
  }, []);

  return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">Loading…</div>;
}
