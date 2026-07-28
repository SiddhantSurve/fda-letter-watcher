import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/unsubscribe")({
  component: UnsubscribePage,
  validateSearch: (s: Record<string, unknown>) => ({ token: (s.token as string) ?? "" }),
  head: () => ({
    meta: [
      { title: "Unsubscribe · FDA Insights" },
      { name: "description", content: "Unsubscribe from FDA Insights letter notifications." },
    ],
  }),
});

function UnsubscribePage() {
  const { token } = Route.useSearch();
  const [state, setState] = useState<"loading" | "valid" | "already" | "invalid" | "done" | "error">(
    "loading",
  );
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) setState("valid");
        else if (d.reason === "already_unsubscribed") setState("already");
        else setState("invalid");
      })
      .catch(() => setState("error"));
  }, [token]);

  const confirm = async () => {
    setSubmitting(true);
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await r.json();
      if (d.success || d.reason === "already_unsubscribed") setState("done");
      else setState("error");
    } catch {
      setState("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full rounded-lg border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-primary">FDA Insights</h1>
        <p className="mt-1 text-xs text-muted-foreground">Letter notification preferences</p>

        <div className="mt-6">
          {state === "loading" && <p className="text-sm text-muted-foreground">Checking your link…</p>}
          {state === "valid" && (
            <>
              <h2 className="text-lg font-semibold">Unsubscribe from notifications?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                You will stop receiving emails when new FDA Warning Letters or Untitled Letters are posted.
              </p>
              <button
                onClick={confirm}
                disabled={submitting}
                className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting ? "Unsubscribing…" : "Confirm unsubscribe"}
              </button>
            </>
          )}
          {state === "already" && (
            <p className="text-sm text-muted-foreground">You are already unsubscribed.</p>
          )}
          {state === "done" && (
            <>
              <h2 className="text-lg font-semibold">You're unsubscribed</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                You won't receive further notification emails. You can re-enable them anytime from your account settings.
              </p>
            </>
          )}
          {state === "invalid" && (
            <p className="text-sm text-destructive">This unsubscribe link is invalid or has expired.</p>
          )}
          {state === "error" && (
            <p className="text-sm text-destructive">Something went wrong. Please try again later.</p>
          )}
        </div>
      </div>
    </div>
  );
}
