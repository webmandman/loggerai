"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { LogOut, Sun, Moon } from "lucide-react";

export function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    setDark(stored ? stored === "dark" : true);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  if (!session?.user || !mounted) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="h-8 w-8 rounded-full overflow-hidden hover:ring-2 hover:ring-primary/50 transition-all"
      >
        {session.user.image ? (
          <img
            src={session.user.image}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="h-full w-full bg-muted flex items-center justify-center text-xs font-medium">
            {session.user.name?.charAt(0) || "?"}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-56 rounded-lg border bg-popover shadow-lg overflow-hidden">
          <div className="px-4 py-3 border-b">
            <p className="text-sm font-medium truncate">{session.user.name}</p>
            <p className="text-xs text-muted-foreground truncate">
              {session.user.email}
            </p>
          </div>

          <div className="p-1">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
            >
              {dark ? (
                <Sun className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Moon className="h-4 w-4 text-muted-foreground" />
              )}
              {dark ? "Light mode" : "Dark mode"}
            </button>

            <button
              onClick={() => signOut({ callbackUrl: "/signin" })}
              className="w-full flex items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
