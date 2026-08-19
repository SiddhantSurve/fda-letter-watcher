// Same-origin bearer attacher.
//
// The generated attacher imports the direct *.supabase.co client, whose
// getSession() can trigger a token refresh straight to that host — blocked by
// some corporate firewalls. This one goes through the /api/sb proxy client.
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/proxy-client";

export const attachSupabaseAuthProxy = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let token: string | undefined;
    try {
      const { data } = await supabase.auth.getSession();
      token = data.session?.access_token;
    } catch {
      token = undefined;
    }
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
