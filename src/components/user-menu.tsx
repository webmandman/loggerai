"use client";

import { useSession, signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function UserMenu() {
  const { data: session } = useSession();
  if (!session?.user) return null;

  return (
    <div className="flex items-center gap-2">
      {session.user.image && (
        <img
          src={session.user.image}
          alt=""
          className="h-7 w-7 rounded-full"
          referrerPolicy="no-referrer"
        />
      )}
      <span className="text-sm text-muted-foreground hidden sm:inline">
        {session.user.name?.split(" ")[0]}
      </span>
      <button
        onClick={() => signOut({ callbackUrl: "/signin" })}
        className="text-muted-foreground hover:text-foreground transition-colors"
        title="Sign out"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}
