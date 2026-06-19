import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  listLetters,
  getDownloadUrl,
  refreshCatalog,
  processBatch,
  getStats,
} from "@/lib/letters.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Download, FileText, RefreshCw, ExternalLink, Search, Pause, Play } from "lucide-react";

const PAGE_SIZE = 50;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FDA Warning Letter Tracker" },
      { name: "description", content: "Auto-archives every FDA warning letter, response letter, and close-out letter." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const list = useServerFn(listLetters);
  const stats = useServerFn(getStats);
  const refresh = useServerFn(refreshCatalog);
  const process = useServerFn(processBatch);
  const getUrl = useServerFn(getDownloadUrl);

  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [autoDownload, setAutoDownload] = useState(false);
  const autoRef = useRef(false);
  autoRef.current = autoDownload;

  const lettersQ = useQuery({
    queryKey: ["letters", q, page],
    queryFn: () => list({ data: { search: q, limit: PAGE_SIZE, offset: page * PAGE_SIZE } }),
  });

  const statsQ = useQuery({
    queryKey: ["stats"],
    queryFn: () => stats(),
    refetchInterval: 5000,
  });

  const refreshMut = useMutation({
    mutationFn: () => refresh(),
    onSuccess: (r) => {
      toast.success(`Catalog refreshed — ${r.new_rows} new letter(s) added`);
      qc.invalidateQueries({ queryKey: ["letters"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e: Error) => toast.error(`Refresh failed: ${e.message}`),
  });

  const batchMut = useMutation({
    mutationFn: () => process({ data: { limit: 20 } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["letters"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      if (autoRef.current && r.remaining > 0) {
        setTimeout(() => batchMut.mutate(), 250);
      } else if (r.remaining === 0) {
        setAutoDownload(false);
        toast.success("All letters downloaded");
      }
    },
    onError: (e: Error) => {
      setAutoDownload(false);
      toast.error(`Download failed: ${e.message}`);
    },
  });

  useEffect(() => {
    if (autoDownload && !batchMut.isPending) batchMut.mutate();
  }, [autoDownload]);

  const download = async (path: string | null | undefined, filename: string) => {
    if (!path) return;
    try {
      const { url } = await getUrl({ data: { path } });
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      toast.error("Download failed");
    }
  };

  const s = statsQ.data;
  const total = lettersQ.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      <header className="border-b">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">FDA Warning Letter Tracker</h1>
              <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
                Monitors the FDA warning letters catalog (3,500+ letters) and archives every letter plus its response and close-out letter when available. Refreshes automatically every Monday.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending}>
                <RefreshCw className={`mr-2 h-4 w-4 ${refreshMut.isPending ? "animate-spin" : ""}`} />
                {refreshMut.isPending ? "Refreshing…" : "Refresh catalog"}
              </Button>
              <Button
                onClick={() => setAutoDownload((v) => !v)}
                disabled={!s || s.pending === 0}
              >
                {autoDownload ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                {autoDownload ? "Pause downloads" : `Download pending${s?.pending ? ` (${s.pending})` : ""}`}
              </Button>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard label="Letters in catalog" value={s?.total ?? 0} />
            <StatCard label="Archived" value={s?.archived ?? 0} />
            <StatCard label="Pending download" value={s?.pending ?? 0} highlight={(s?.pending ?? 0) > 0} />
            <StatCard label="With response" value={s?.withResponse ?? 0} />
            <StatCard label="With close-out" value={s?.withCloseout ?? 0} />
          </div>
          {autoDownload && (
            <p className="mt-3 text-xs text-muted-foreground">
              Downloading 20 at a time — keep this page open. {batchMut.isPending && "Working…"}
            </p>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search company, subject, or issuing office…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            className="pl-9"
          />
        </div>

        {lettersQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (lettersQ.data?.letters.length ?? 0) === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-semibold">No letters yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Click <strong>Refresh catalog</strong> to fetch the full FDA list.
            </p>
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {lettersQ.data!.letters.map((l) => (
                <Card key={l.id} className="p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Posted {l.posted_date}</span>
                        <span>·</span>
                        <span>Issued {l.issue_date}</span>
                      </div>
                      <h3 className="mt-1 font-semibold">{l.company_name}</h3>
                      <p className="text-sm text-muted-foreground mt-0.5">{l.subject}</p>
                      <p className="text-xs text-muted-foreground mt-1">{l.issuing_office}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!l.letter_storage_path && <Badge variant="outline">Pending download</Badge>}
                        {l.response_storage_path && <Badge variant="secondary">Response letter</Badge>}
                        {l.closeout_storage_path && <Badge variant="secondary">Close-out letter</Badge>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button size="sm" variant="outline" disabled={!l.letter_storage_path}
                        onClick={() => download(l.letter_storage_path, `${l.company_name}-warning-letter.html`)}>
                        <Download className="mr-2 h-3.5 w-3.5" /> Letter
                      </Button>
                      {l.response_storage_path && (
                        <Button size="sm" variant="outline"
                          onClick={() => download(l.response_storage_path, `${l.company_name}-response.pdf`)}>
                          <Download className="mr-2 h-3.5 w-3.5" /> Response
                        </Button>
                      )}
                      {l.closeout_storage_path && (
                        <Button size="sm" variant="outline"
                          onClick={() => download(l.closeout_storage_path, `${l.company_name}-closeout.pdf`)}>
                          <Download className="mr-2 h-3.5 w-3.5" /> Close-out
                        </Button>
                      )}
                      <a href={l.letter_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center justify-center text-xs text-muted-foreground hover:text-foreground">
                        <ExternalLink className="mr-1 h-3 w-3" /> View on FDA.gov
                      </a>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="mt-6 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {total.toLocaleString()} letters · page {page + 1} of {pageCount}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card className={`p-4 ${highlight ? "border-primary" : ""}`}>
      <div className="text-2xl font-semibold">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </Card>
  );
}
