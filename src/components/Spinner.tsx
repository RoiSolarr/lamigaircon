"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Full screen loading screen, the same look as the page loading screen
// (src/app/loading.tsx). It covers everything, so nothing can be clicked
// while a page opens or a save is running.
export function LoadingScreen() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="loading-screen fixed inset-0 z-[1000] grid cursor-wait place-items-center"
    >
      <div className="flex flex-col items-center gap-4 text-steel">
        <svg aria-hidden width="44" height="44" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="animate-[spin_2.4s_linear_infinite] text-ink">
          <path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13" />
          <path d="M12 5.5l4 3 4-3M12 26.5l4-3 4 3" />
        </svg>
        <p className="font-bold">Loading…</p>
      </div>
    </div>
  );
}

// Shows the loading screen for the whole site (customer and admin):
//  * when a search form opens its results,
//  * when a link to another page is clicked, until that page shows, and
//  * while any server action runs (Save, Mark done, Delete, Add day off...).
// Lives in the root layout, inside <Suspense> because it reads the address.
export function GlobalLoading() {
  const path = usePathname();
  const search = useSearchParams().toString();
  const [navigating, setNavigating] = useState(false);
  const [actions, setActions] = useState(0);
  const [lastUrl, setLastUrl] = useState(`${path}?${search}`);

  // The new page is showing: stop the link loading screen.
  if (`${path}?${search}` !== lastUrl) {
    setLastUrl(`${path}?${search}`);
    setNavigating(false);
  }

  const current = useRef(`${path}?${search}`);
  useEffect(() => {
    current.current = `${path}?${search}`;
  }, [path, search]);

  // Link clicks to another page of this site.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !a.href || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      // Same page (or only a #section on it): nothing to load.
      const sp = url.searchParams.toString();
      if (`${url.pathname}?${sp}` === current.current) return;
      setNavigating(true);
    };
    // Plain search forms (GET) load a new page too.
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (!e.defaultPrevented && form.method === "get" && form.target !== "_blank") setNavigating(true);
    };
    const onBack = () => setNavigating(false);
    // Capture phase on window, so it runs before Next's <Link> handles the click.
    window.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit);
    window.addEventListener("popstate", onBack);
    return () => {
      window.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit);
      window.removeEventListener("popstate", onBack);
    };
  }, []);

  // Server actions are POSTs with a "next-action" header. Count the running ones.
  useEffect(() => {
    const original = window.fetch;
    const done = () => requestAnimationFrame(() => requestAnimationFrame(() => setActions((n) => Math.max(0, n - 1))));
    window.fetch = async (input, init) => {
      const isAction = init?.method === "POST" && new Headers(init.headers).has("next-action");
      if (!isAction) return original(input, init);
      setActions((n) => n + 1);
      try {
        const res = await original(input, init);
        // Wait for the whole answer (it carries the updated page), then hide.
        res.clone().arrayBuffer().then(done, done);
        return res;
      } catch (err) {
        done();
        throw err;
      }
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  // Never stay stuck: give up after 20 seconds.
  useEffect(() => {
    if (!navigating) return;
    const t = setTimeout(() => setNavigating(false), 20_000);
    return () => clearTimeout(t);
  }, [navigating]);

  return navigating || actions > 0 ? <LoadingScreen /> : null;
}
