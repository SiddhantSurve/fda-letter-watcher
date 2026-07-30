import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { listThreads, createThread } from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, FileWarning, LogOut, ArrowRight } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "FDA Letter Tracker" },
      { name: "description", content: "Track FDA Warning Letters and Untitled Letters." },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const list = useServerFn(listThreads);
  const create = useServerFn(createThread);
  const [loading, setLoading] = useState<"warning" | "untitled" | null>(null);

  const enter = async (kind: "warning" | "untitled") => {
    setLoading(kind);
    try {
      const threads = await list({ data: { kind } });
      if (threads.length > 0) {
        navigate({ to: "/chat/$threadId", params: { threadId: threads[0].id } });
      } else {
        const { id } = await create({ data: { kind } });
        navigate({ to: "/chat/$threadId", params: { threadId: id } });
      }
    } finally {
      setLoading(null);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="glass-bar text-center text-xs px-4 py-2 font-medium text-primary">
        This is a vibe-coding product built by Sid — not formalized and currently in testing.
      </div>
      <header className="sticky top-0 z-30 glass-bar">
        <div className="mx-auto max-w-5xl px-6 py-5 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">FDA Letter Tracker</h1>
          <Button variant="ghost" size="sm" className="rounded-full" onClick={signOut}>
            <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </header>


      <main className="flex-1 mx-auto w-full max-w-5xl px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold tracking-tight">Choose an archive</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick which type of FDA correspondence you want to explore.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <ChoiceCard
            icon={<FileWarning className="h-7 w-7 text-primary" />}
            title="Warning Letters"
            description="The full FDA warning letter archive across all centers and offices. Chat with the corpus or any individual letter."
            cta="View Warning Letter"
            onClick={() => enter("warning")}
            loading={loading === "warning"}
          />
          <ChoiceCard
            icon={<AlertTriangle className="h-7 w-7 text-primary" />}
            title="Untitled Letters"
            description="OPDP untitled letters covering pharmaceutical promotional communications and related materials."
            cta="Enter Untitled Letters"
            onClick={() => enter("untitled")}
            loading={loading === "untitled"}
          />
        </div>
      </main>
    </div>
  );
}

function ChoiceCard({
  icon,
  title,
  description,
  cta,
  onClick,
  loading,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <Card className="glass glass-hover border-0 p-6 flex flex-col gap-4 rounded-3xl bg-transparent shadow-none">
      <div className="h-12 w-12 rounded-2xl glass-strong flex items-center justify-center">{icon}</div>
      <div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      <Button className="mt-auto self-start rounded-full" onClick={onClick} disabled={loading}>
        {loading ? "Loading…" : cta}
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </Card>
  );

}
