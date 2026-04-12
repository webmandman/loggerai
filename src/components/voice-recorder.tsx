"use client";

import { useCallback, useRef } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceRecorderProps {
  isListening: boolean;
  isTranscribing: boolean;
  isSupported: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function VoiceRecorder({
  isListening,
  isTranscribing,
  isSupported,
  onStart,
  onStop,
}: VoiceRecorderProps) {
  const holdingRef = useRef(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      holdingRef.current = true;
      onStart();
    },
    [onStart]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (holdingRef.current) {
        holdingRef.current = false;
        onStop();
      }
    },
    [onStop]
  );

  // Cancel if pointer leaves the window entirely
  const handlePointerCancel = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      if (holdingRef.current) {
        holdingRef.current = false;
        onStop();
      }
    },
    [onStop]
  );

  if (!isSupported) {
    return (
      <button
        disabled
        title="Voice input not supported in this browser"
        className="h-10 w-10 rounded-lg border border-input bg-background flex items-center justify-center opacity-50 cursor-not-allowed"
      >
        <MicOff className="h-4 w-4 text-muted-foreground" />
      </button>
    );
  }

  if (isTranscribing) {
    return (
      <button
        disabled
        title="Transcribing..."
        className="h-10 w-10 rounded-lg border border-input bg-background flex items-center justify-center"
      >
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </button>
    );
  }

  return (
    <button
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      title="Hold to record"
      className={cn(
        "relative h-10 w-10 rounded-lg flex items-center justify-center",
        "select-none touch-none cursor-grab active:cursor-grabbing",
        "transition-all duration-150",
        isListening
          ? "bg-red-500 text-white scale-125 shadow-lg shadow-red-500/30 ring-4 ring-red-500/20"
          : "border border-input bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      <Mic
        className={cn(
          "h-4 w-4 transition-transform",
          isListening && "scale-110"
        )}
      />
      {isListening && (
        <>
          <span className="absolute inset-0 rounded-lg bg-red-500 animate-ping opacity-30" />
          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-400 animate-ping" />
        </>
      )}
    </button>
  );
}
