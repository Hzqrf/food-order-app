import { useCallback, useEffect, useState } from "react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Adds a <link>/<meta> tag to <head> for as long as the staff screens are open. */
function headTag(tag: "link" | "meta", attrs: Record<string, string>) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  document.head.appendChild(el);
  return () => el.remove();
}

/**
 * Makes the staff screens an installable app. The manifest is added here rather than in index.html,
 * so customers on the shop's own pages are never offered a "Kaunter" app.
 *
 * Returns `install` when the browser offers installing (Chrome, Edge, Android), else null.
 */
export function useStaffApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);

  useEffect(() => {
    const removers = [
      headTag("link", { rel: "manifest", href: "/staff.webmanifest" }),
      headTag("link", { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" }),
      headTag("meta", { name: "apple-mobile-web-app-capable", content: "yes" }),
      headTag("meta", { name: "apple-mobile-web-app-title", content: "Kaunter" }),
    ];
    navigator.serviceWorker?.register("/staff-sw.js", { scope: "/staff" }).catch(() => {});

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPrompt);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      removers.forEach((remove) => remove());
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  }, [prompt]);

  return { install: prompt ? install : null };
}

/** Keeps the tablet's screen on while `active`, so the board stays visible in the kitchen. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then((l) => {
        if (cancelled) l.release();
        else lock = l;
      }).catch(() => {}); // refused (battery saver, no permission): the screen just sleeps as usual
    };
    acquire();
    // The browser drops the lock whenever the tab is hidden; take it again on return.
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", acquire);
      lock?.release();
    };
  }, [active]);
}
