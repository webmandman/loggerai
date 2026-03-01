"use client";

import { createContext, useContext } from "react";
import { useSpeechRecognition } from "@/lib/speech";

type SpeechContextValue = ReturnType<typeof useSpeechRecognition>;

const SpeechContext = createContext<SpeechContextValue | null>(null);

export function SpeechProvider({ children }: { children: React.ReactNode }) {
  const speech = useSpeechRecognition();
  return (
    <SpeechContext.Provider value={speech}>{children}</SpeechContext.Provider>
  );
}

export function useSpeech(): SpeechContextValue {
  const ctx = useContext(SpeechContext);
  if (!ctx) throw new Error("useSpeech must be used within SpeechProvider");
  return ctx;
}
