"use client";

import Link from "next/link";
import { BookOpen } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { BottomNav } from "@/components/bottom-nav";
import { SpeechProvider } from "@/lib/speech-context";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SpeechProvider>
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
          <div className="mx-auto max-w-2xl px-4 py-3">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <BookOpen className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold tracking-tight">Logger.ai</h1>
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-2xl px-4 pb-24">
          {children}
        </main>

        <BottomNav />
      </div>
    </SpeechProvider>
  );
}
