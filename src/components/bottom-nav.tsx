"use client";

import { useCallback, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { List, BarChart3, Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSpeech } from "@/lib/speech-context";

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { isListening, audioLevel, startListening, stopListening } = useSpeech();
  const holdingRef = useRef(false);
  const isTouchDevice = useRef(false);

  useEffect(() => {
    isTouchDevice.current = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isTouchDevice.current) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      holdingRef.current = true;
      if (pathname !== "/") router.push("/");
      startListening();
    },
    [startListening, pathname, router]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (isTouchDevice.current) return;
      e.preventDefault();
      if (holdingRef.current) {
        holdingRef.current = false;
        stopListening();
      }
    },
    [stopListening]
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (isTouchDevice.current) return;
      e.preventDefault();
      if (holdingRef.current) {
        holdingRef.current = false;
        stopListening();
      }
    },
    [stopListening]
  );

  const handleTap = useCallback(() => {
    if (!isTouchDevice.current) return;
    if (pathname !== "/") router.push("/");
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening, pathname, router]);

  const isFeed = pathname === "/feed";
  const isInsights = pathname === "/insights";

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 border-t bg-background/80 backdrop-blur-md">
      <div className="mx-auto max-w-2xl flex items-end justify-around px-6 h-16">
        <Link
          href="/feed"
          className={cn(
            "flex flex-col items-center gap-0.5 py-2 px-3 transition-colors",
            isFeed ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <List className="h-5 w-5" />
          <span className="text-[10px] font-medium">Feed</span>
        </Link>

        <button
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onClick={handleTap}
          onContextMenu={(e) => e.preventDefault()}
          className={cn(
            "relative -top-4 flex items-center justify-center",
            "h-14 w-14 rounded-full",
            "select-none touch-none transition-all duration-200",
            isListening
              ? "bg-red-500 text-white shadow-lg shadow-red-500/40 scale-110"
              : "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:scale-105 active:scale-95"
          )}
          aria-label="Hold to record"
        >
          <Mic className={cn("h-6 w-6 relative z-10", isListening && "scale-110")} />
          {isListening && (
            <>
              <span
                className="volume-ring"
                style={{
                  transform: `scale(${1 + audioLevel * 0.6})`,
                  opacity: 0.5 + audioLevel * 0.3,
                }}
              />
              <span
                className="volume-ring"
                style={{
                  transform: `scale(${1 + audioLevel * 1.0})`,
                  opacity: 0.3 + audioLevel * 0.2,
                }}
              />
              <span
                className="volume-ring"
                style={{
                  transform: `scale(${1 + audioLevel * 1.5})`,
                  opacity: 0.15 + audioLevel * 0.15,
                }}
              />
            </>
          )}
        </button>

        <Link
          href="/insights"
          className={cn(
            "flex flex-col items-center gap-0.5 py-2 px-3 transition-colors",
            isInsights ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <BarChart3 className="h-5 w-5" />
          <span className="text-[10px] font-medium">Insights</span>
        </Link>
      </div>
    </nav>
  );
}
