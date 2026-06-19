import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { listLetters, getDownloadUrl, triggerScan } from "@/lib/letters.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Download, FileText, RefreshCw, ExternalLink, Search } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FDA Warning Letter Tracker" },
      { name: "description", content: "Automatically archives FDA warning letters, response letters, and close-out letters as they are posted." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const router = useRouter();
  const list = useServerFn(listLetters);
  const scan = useServerFn(triggerScan);
  const getUrl = useServerFn(getDownloadUrl);
  const [q, setQ] = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["letters"],
    queryFn: () => list(),
  });

  const scanMut = useMutation({
    mutationFn: () => scan(),
    onSuccess: (r) => {
      toast.success(`Scan complete — ${r.new_ingested} new letter(s) archived`);
      refetch();
    },
    onError: (e: Error) => toast.error(`Scan failed: ${e.message}`),
  });

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
    } catch (e) {
      toast.error("Download failed");
    }
  };

  const letters = (data?.letters ?? []).filter((l) => {
    if (!q) return true;
    const hay = `${l.company_name} ${l.subject} ${l.issuing_office}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  const stats = {
    total: data?.letters.length ?? 0,
    withResponse: data?.letters.filter((l) => l.response_storage_path).length ?? 0,
    withCloseout: data?.letters.filter((l) => l.closeout_storage_path).length ?? 0,
  };

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      <header className="border-b">
        <div className="mx-auto max-w-7xl px-6 py-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">FDA Warning Letter Tracker</h1>
              <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
                Auto-archives every warning letter from the FDA, along with the corresponding response and close-out letters when available. Scans automatically every Monday.
              </p>
            </div>
            <Button onClick={() => scanMut.mutate()} disabled={scanMut.isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${scanMut.isPending ? "animate-spin" : ""}`} />
              {scanMut.isPending ? "Scanning…" : "Scan now"}
            </Button>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-4">
            <StatCard label="Letters archived" value={stats.total} />
            <StatCard label="With response letter" value={stats.withResponse} />
            <StatCard label="With close-out letter" value={stats.withCloseout} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by company, subject, or office…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : letters.length === 0 ? (
          <Card className="p-12 text-center">
            <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 font-semibold">No letters yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Click <strong>Scan now</strong> to fetch the current FDA warning letters.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {letters.map((l) => (
              <Card key={l.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Posted {l.posted_date}</span>
                      <span>·</span>
                      <span>Issued {l.issue_date}</span>
                    </div>
                    <h3 className="mt-1 font-semibold text-base">{l.company_name}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{l.subject}</p>
                    <p className="text-xs text-muted-foreground mt-1">{l.issuing_office}</p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {l.response_storage_path && <Badge variant="secondary">Response letter</Badge>}
                      {l.closeout_storage_path && <Badge variant="secondary">Close-out letter</Badge>}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => download(l.letter_storage_path, `${l.company_name}-warning-letter.html`)}
                      disabled={!l.letter_storage_path}
                    >
                      <Download className="mr-2 h-3.5 w-3.5" /> Letter
                    </Button>
                    {l.response_storage_path && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => download(l.response_storage_path, `${l.company_name}-response.pdf`)}
                      >
                        <Download className="mr-2 h-3.5 w-3.5" /> Response
                      </Button>
                    )}
                    {l.closeout_storage_path && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => download(l.closeout_storage_path, `${l.company_name}-closeout.pdf`)}
                      >
                        <Download className="mr-2 h-3.5 w-3.5" /> Close-out
                      </Button>
                    )}
                    <a
                      href={l.letter_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="mr-1 h-3 w-3" /> View on FDA.gov
                    </a>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </Card>
  );
}
