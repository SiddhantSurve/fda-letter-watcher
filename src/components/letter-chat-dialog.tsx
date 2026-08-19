import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/proxy-client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Send } from "lucide-react";
import { toast } from "sonner";

export function LetterChatDialog({
  open,
  onOpenChange,
  letterId,
  company,
  subject,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  letterId: string;
  company: string;
  subject: string | null;
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
          if (data.session?.access_token) {
            headers.Authorization = `Bearer ${data.session.access_token}`;
          }
          return { body: { messages, letterId }, headers };
        },
      }),
    [letterId],
  );

  const { messages, sendMessage, status, setMessages } = useChat({
    id: `letter-${letterId}`,
    transport,
    onError: (e) => toast.error(e.message),
  });

  // Reset chat each time the dialog opens for a fresh, letter-scoped session
  useEffect(() => {
    if (open) {
      setMessages([]);
      setTimeout(() => taRef.current?.focus(), 50);
    }
  }, [open, setMessages]);

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b">
          <DialogTitle className="text-base">{company}</DialogTitle>
          <DialogDescription className="text-xs">
            {subject ?? "Ask anything about this letter."}
          </DialogDescription>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="max-h-[420px] min-h-[200px] overflow-y-auto px-5 py-4 space-y-4"
        >
          {messages.length === 0 ? (
            <div className="text-sm text-muted-foreground space-y-2">
              <p>Try asking:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>What violations are cited in this letter?</li>
                <li>What corrective actions did FDA require?</li>
                <li>Summarize this letter in 3 sentences.</li>
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
            <p className="text-sm text-muted-foreground animate-pulse">Reading the letter…</p>
          )}
        </div>

        <form onSubmit={submit} className="border-t p-3 flex items-end gap-2">
          <Textarea
            ref={taRef}
            rows={1}
            placeholder="Ask about this letter…"
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
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || status === "submitted" || status === "streaming"}
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
