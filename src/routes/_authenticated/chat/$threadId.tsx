import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listLetters,
  getStats,
  refreshCatalog,
} from "@/lib/letters.functions";
import {
  listThreads,
  createThread,
  deleteThread,
  getThreadMessages,
} from "@/lib/chat.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  FileText,
  RefreshCw,
  ExternalLink,
  Search,
  Send,
  Plus,
  Trash2,
  LogOut,
  MessageSquare,
  MessageCircle,
} from "lucide-react";
import { LetterChatDialog } from "@/components/letter-chat-dialog";
import { summarizeLetter } from "@/lib/letter-summary.functions";
import ReactMarkdown from "react-markdown";
import { Sparkles, Loader2 } from "lucide-react";

const PAGE_SIZE = 25;

export const Route = createFileRoute("/_authenticated/chat/$threadId")({
  head: () => ({
    meta: [
      { title: "FDA Warning Letter Tracker" },
      { name: "description", content: "Chat with the FDA warning letter archive." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { threadId } = useParams({ from: "/_authenticated/chat/$threadId" });
  const navigate = useNavigate();
  const qc = useQueryClient();

  const list = useServerFn(listLetters);
  const stats = useServerFn(getStats);
  const refresh = useServerFn(refreshCatalog);
  const listThreadsFn = useServerFn(listThreads);
  const createThreadFn = useServerFn(createThread);
  const deleteThreadFn = useServerFn(deleteThread);
  const getMsgs = useServerFn(getThreadMessages);

  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const lettersQ = useQuery({
    queryKey: ["letters", q, page],
    queryFn: () => list({ data: { search: q, limit: PAGE_SIZE, offset: page * PAGE_SIZE } }),
  });
  const statsQ = useQuery({ queryKey: ["stats"], queryFn: () => stats() });
  const threadsQ = useQuery({ queryKey: ["threads"], queryFn: () => listThreadsFn() });
  const initialMsgsQ = useQuery({
    queryKey: ["msgs", threadId],
    queryFn: () => getMsgs({ data: { threadId } }),
  });

  const refreshMut = useMutation({
    mutationFn: () => refresh(),
    onSuccess: (r) => {
      toast.success(`Catalog refreshed — ${r.new_rows} new letter(s)`);
      qc.invalidateQueries({ queryKey: ["letters"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const newThread = async () => {
    const { id } = await createThreadFn();
    qc.invalidateQueries({ queryKey: ["threads"] });
    navigate({ to: "/chat/$threadId", params: { threadId: id } });
  };

  const removeThread = async (id: string) => {
    await deleteThreadFn({ data: { id } });
    const remaining = (threadsQ.data ?? []).filter((t) => t.id !== id);
    qc.invalidateQueries({ queryKey: ["threads"] });
    if (id === threadId) {
      if (remaining.length > 0) navigate({ to: "/chat/$threadId", params: { threadId: remaining[0].id } });
      else navigate({ to: "/" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      <div className="bg-primary text-primary-foreground text-center text-xs px-4 py-2 font-medium">
        This is a vibe-coding product built by Sid — not formalized and currently in testing.
      </div>
      <header className="border-b border-t-4 border-t-primary">
        <div className="mx-auto max-w-7xl px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">FDA Warning Letter Tracker</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
              </span>
              <p className="text-xs text-muted-foreground">
                Actively reading through {statsQ.data?.total.toLocaleString() ?? "—"} letters...
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending}>
              <RefreshCw className={`mr-2 h-3.5 w-3.5 ${refreshMut.isPending ? "animate-spin" : ""}`} />
              Refresh catalog
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6 space-y-6">
        {/* Explanatory Header */}
        <div className="bg-card border rounded-lg p-5">
          <h2 className="text-sm font-semibold mb-1">About this tracker</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            This workspace monitors FDA warning letters in real-time. Use the chat interface to query trends, common violations, and specific compliance themes across the entire database, or use the <strong>"Ask me"</strong> feature next to individual letters to chat directly with that specific document.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
          {/* Thread sidebar */}
          <aside className="space-y-2">
            <Button onClick={newThread} className="w-full" size="sm">
            <Plus className="mr-2 h-4 w-4" /> New chat
          </Button>
          <div className="space-y-1">
            {(threadsQ.data ?? []).map((t) => (
              <div
                key={t.id}
                className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-sm cursor-pointer ${
                  t.id === threadId ? "bg-accent" : "hover:bg-accent/50"
                }`}
                onClick={() => navigate({ to: "/chat/$threadId", params: { threadId: t.id } })}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate flex-1">{t.title}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeThread(t.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  aria-label="Delete thread"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </aside>

        <div className="space-y-6 min-w-0">
          {/* Chat */}
          <ChatPanel
            key={threadId}
            threadId={threadId}
            initialMessages={initialMsgsQ.data as UIMessage[] | undefined}
            onSent={() => qc.invalidateQueries({ queryKey: ["threads"] })}
          />

          {/* Letters list */}
          <section>
            <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-semibold">Archive</h2>
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search company, subject, office…"
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(0); }}
                  className="pl-9"
                />
              </div>
            </div>

            {lettersQ.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (lettersQ.data?.letters.length ?? 0) === 0 ? (
              <Card className="p-10 text-center">
                <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">No letters yet — click Refresh catalog.</p>
              </Card>
            ) : (
              <>
                <div className="space-y-3">
                  {lettersQ.data!.letters.map((l) => (
                    <LetterCard key={l.id} letter={l} />
                  ))}
                </div>
                <Pager page={page} setPage={setPage} total={lettersQ.data!.total} />
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  </div>
  );
}

type Letter = {
  id: string;
  letter_url: string;
  posted_date: string | null;
  issue_date: string | null;
  company_name: string;
  issuing_office: string | null;
  subject: string | null;
  summary: string | null;
  excerpt: string | null;
  response_url: string | null;
  closeout_url: string | null;
  letter_storage_path: string | null;
};

function LetterCard({ letter: l }: { letter: Letter }) {
  const [chatOpen, setChatOpen] = useState(false);
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Posted {l.posted_date ?? "—"}</span>
            <span>·</span>
            <span>Issued {l.issue_date ?? "—"}</span>
          </div>
          <h3 className="mt-1 font-semibold">{l.company_name}</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{l.subject}</p>
          <p className="text-xs text-muted-foreground mt-1">{l.issuing_office}</p>
          {l.excerpt && (
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-3">
              {l.excerpt}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {l.response_url && <Badge variant="secondary">Response letter</Badge>}
            {l.closeout_url && <Badge variant="secondary">Close-out letter</Badge>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => setChatOpen(true)}>
            <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Ask me
          </Button>
          <a
            href={l.letter_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="mr-1 h-3 w-3" /> FDA.gov
          </a>
        </div>
      </div>
      <LetterChatDialog
        open={chatOpen}
        onOpenChange={setChatOpen}
        letterId={l.id}
        company={l.company_name}
        subject={l.subject}
      />
    </Card>
  );
}

function Pager({ page, setPage, total }: { page: number; setPage: (n: number) => void; total: number }) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="mt-6 flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{total.toLocaleString()} letters · page {page + 1} of {pageCount}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
        <Button size="sm" variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

function ChatPanel({
  threadId,
  initialMessages,
  onSent,
}: {
  threadId: string;
  initialMessages: UIMessage[] | undefined;
  onSent: () => void;
}) {
  const [input, setInput] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: async ({ messages }) => {
          const { data } = await supabase.auth.getSession();
          const headers: Record<string, string> = {};
          if (data.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
          return { body: { messages, threadId }, headers };
        },
      }),
    [threadId],
  );

  const { messages, sendMessage, status } = useChat({
    id: threadId,
    messages: initialMessages ?? [],
    transport,
    onFinish: () => onSent(),
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    taRef.current?.focus();
  }, [threadId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || status === "submitted" || status === "streaming") return;
    setInput("");
    await sendMessage({ text });
    taRef.current?.focus();
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="border-b px-5 py-3">
        <h2 className="text-base font-semibold">Ask the archive</h2>
        <p className="text-xs text-muted-foreground">
          Ask anything about FDA warning letters — answers cite specific letters from the archive.
        </p>
      </div>
      <div ref={scrollRef} className="max-h-[420px] min-h-[180px] overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-sm text-muted-foreground space-y-2">
            <p>Try:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>What violations are most common in cosmetics warning letters?</li>
              <li>Show me recent letters about data integrity in pharmaceutical manufacturing.</li>
              <li>Which companies received warnings about unapproved drug claims this year?</li>
            </ul>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[80%] rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap"
                    : "max-w-full text-sm leading-relaxed whitespace-pre-wrap"
                }
              >
                {m.parts.map((p, i) => (p.type === "text" ? <span key={i}>{p.text}</span> : null))}
              </div>
            </div>
          ))
        )}
        {status === "submitted" && (
          <p className="text-sm text-muted-foreground animate-pulse">Thinking…</p>
        )}
      </div>
      <form onSubmit={submit} className="border-t p-3 flex items-end gap-2">
        <Textarea
          ref={taRef}
          rows={1}
          placeholder="Ask a question about FDA warning letters…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(e as unknown as React.FormEvent);
            }
          }}
          className="resize-none min-h-[40px] max-h-[160px]"
        />
        <Button type="submit" size="icon" disabled={!input.trim() || status === "submitted" || status === "streaming"}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </Card>
  );
}
