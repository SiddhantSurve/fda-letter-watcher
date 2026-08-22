import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function isStaleBuildError(error: Error) {
  const msg = error?.message || String(error);
  return (
    /dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Failed to fetch module script/i.test(msg) ||
    /Loading chunk .* failed/i.test(msg) ||
    /reading '?component'?/i.test(msg) ||
    /undefined is not an object \(evaluating '.*\.component'\)/i.test(msg)
  );
}

async function clearBrowserCaches() {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((cacheKey) => caches.delete(cacheKey)));
    }
  } catch {
    // Cache access can be restricted; continue with the recovery navigation.
  }
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const stale = isStaleBuildError(error);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  useEffect(() => {
    if (!stale || typeof window === "undefined") return;
    const key = "fdainsights:root-stale-recovery";
    const lastAttempt = Number(sessionStorage.getItem(key) || 0);
    if (Date.now() - lastAttempt < 5 * 60_000) return;
    sessionStorage.setItem(key, Date.now().toString());
    const timer = window.setTimeout(() => {
      void clearBrowserCaches().then(() => {
        window.location.replace(`/auth?refresh=${Date.now()}`);
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [stale]);


  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {stale ? "Updating to the latest version…" : "This page didn't load"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {stale
            ? "Your browser was holding an outdated copy of the site. We're clearing it and reopening the current version automatically."
            : "Something went wrong on our end. You can try refreshing or head back home."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              if (stale) {
                sessionStorage.removeItem("fdainsights:root-stale-recovery");
                void clearBrowserCaches().then(() => {
                  window.location.replace(`/auth?refresh=${Date.now()}`);
                });
                return;
              }
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {stale ? "Open current version" : "Try again"}
          </button>

          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lovable App" },
      { name: "description", content: "Warning Letter Watcher automatically downloads FDA warning letters and related response/close-out documents from a specified URL." },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Lovable App" },
      { property: "og:description", content: "Warning Letter Watcher automatically downloads FDA warning letters and related response/close-out documents from a specified URL." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Lovable App" },
      { name: "twitter:description", content: "Warning Letter Watcher automatically downloads FDA warning letters and related response/close-out documents from a specified URL." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7a58221e-51f1-4c21-ad63-2a6a14d5465c/id-preview-fc8a8d99--fa9f6bbf-ea8a-4b25-89c7-ab90c04210e2.lovable.app-1781896543183.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/7a58221e-51f1-4c21-ad63-2a6a14d5465c/id-preview-fc8a8d99--fa9f6bbf-ea8a-4b25-89c7-ab90c04210e2.lovable.app-1781896543183.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    const handlePreloadError = (event: Event) => {
      event.preventDefault();
      const key = "fdainsights:preload-recovery";
      const lastAttempt = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - lastAttempt < 5 * 60_000) return;

      sessionStorage.setItem(key, Date.now().toString());
      const recover = async () => {
        try {
          if ("serviceWorker" in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((registration) => registration.unregister()));
          }
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((cacheKey) => caches.delete(cacheKey)));
          }
        } catch {
          // Continue to a clean entry page even if browser cache access is restricted.
        }

        window.location.replace(`/auth?refresh=${Date.now()}`);
      };

      void recover();
    };

    window.addEventListener("vite:preloadError", handlePreloadError);
    return () => window.removeEventListener("vite:preloadError", handlePreloadError);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
