// Same-origin Supabase client.
//
// Some corporate firewalls/proxies block or fail to categorize requests going
// straight to the backend's *.supabase.co host. Routing every browser call
// through `/api/sb/*` on our own domain keeps all traffic same-origin.
//
// The storage key is pinned to the default project key so any other client
// instance (e.g. the generated one used by auth middleware) shares the session.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const DIRECT_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || process.env.SUPABASE_URL;
const PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  process.env.SUPABASE_PUBLISHABLE_KEY;

function projectRef(url: string | undefined) {
  if (!url) return "default";
  try {
    return new URL(url).hostname.split(".")[0];
  } catch {
    return "default";
  }
}

function createProxyClient() {
  if (!DIRECT_URL || !PUBLISHABLE_KEY) {
    throw new Error("Missing backend environment variables.");
  }

  // Browser: same-origin proxy. Server (SSR): talk to the backend directly.
  const baseUrl =
    typeof window !== "undefined" ? `${window.location.origin}/api/sb` : DIRECT_URL;

  return createClient<Database>(baseUrl, PUBLISHABLE_KEY, {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      storageKey: `sb-${projectRef(DIRECT_URL)}-auth-token`,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

let _client: ReturnType<typeof createProxyClient> | undefined;

export const supabase = new Proxy({} as ReturnType<typeof createProxyClient>, {
  get(_, prop, receiver) {
    if (!_client) _client = createProxyClient();
    return Reflect.get(_client, prop, receiver);
  },
});
