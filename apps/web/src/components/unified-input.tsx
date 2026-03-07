"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowUp,
  Loader2,
  X,
  Mic,
  MicOff,
  Sparkles,
  Search,
  BookOpen,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useSpeech } from "@/lib/speech-context";
import type { LogEntry, InputMethod } from "@logger-ai/shared";

interface UnifiedInputProps {
  onLog: (entry: LogEntry) => void;
  onQueryResult: (answer: string, entries: LogEntry[]) => void;
  onClearQuery: () => void;
  hasActiveQuery: boolean;
  onStreamingAnswer?: (text: string) => void;
}

type ProcessingPhase = null | "classifying" | "logging" | "searching";

export function UnifiedInput({
  onLog,
  onQueryResult,
  onClearQuery,
  hasActiveQuery,
  onStreamingAnswer,
}: UnifiedInputProps) {
  const [text, setText] = useState("");
  const [inputMethod, setInputMethod] = useState<InputMethod>("text");
  const [processingPhase, setProcessingPhase] = useState<ProcessingPhase>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const holdingRef = useRef(false);
  const isTouchDevice = useRef(false);
  const [tapRecording, setTapRecording] = useState(false);

  useEffect(() => {
    isTouchDevice.current = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  }, []);

  const {
    isListening,
    isTranscribing,
    transcript,
    isSupported,
    error: speechError,
    startListening,
    stopListening,
    resetTranscript,
    clearError: clearSpeechError,
  } = useSpeech();

  useEffect(() => {
    if (transcript) {
      setText(transcript);
      setInputMethod("voice");
    }
  }, [transcript]);

  const isProcessing = processingPhase !== null;

  const handleSubmit = useCallback(async () => {
    const finalText = text.trim();
    if (!finalText || isProcessing) return;

    if (isListening) stopListening();

    setError(null);
    setProcessingPhase("classifying");

    try {
      const res = await api("/api/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput: finalText, inputMethod }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      if (data.type === "query_stream") {
        setProcessingPhase("searching");
        let answer = "";

        const streamRes = await api("/api/query/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: finalText }),
        });

        if (!streamRes.ok || !streamRes.body) {
          throw new Error("Failed to start streaming");
        }

        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.type === "delta") {
                answer += evt.text;
                onStreamingAnswer?.(answer);
                onQueryResult(answer, []);
              } else if (evt.type === "done") {
                onQueryResult(answer, []);
              } else if (evt.type === "error") {
                throw new Error(evt.message);
              }
            } catch { /* ignore parse errors in SSE */ }
          }
        }
      } else if (data.type === "query") {
        setProcessingPhase("searching");
        onQueryResult(data.answer, data.entries || []);
      } else {
        setProcessingPhase("logging");
        onLog(data.entry);
      }

      setText("");
      resetTranscript();
      setInputMethod("text");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong";
      setError(msg);
    } finally {
      setProcessingPhase(null);
    }
  }, [
    text,
    isProcessing,
    isListening,
    stopListening,
    inputMethod,
    onLog,
    onQueryResult,
    onStreamingAnswer,
    resetTranscript,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isTouchDevice.current) return;
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      holdingRef.current = true;
      startListening();
    },
    [startListening]
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

  const handleMicTap = useCallback(() => {
    if (!isTouchDevice.current) return;
    if (isListening) {
      stopListening();
      setTapRecording(false);
    } else {
      startListening();
      setTapRecording(true);
    }
  }, [isListening, startListening, stopListening]);

  const activeError = error || speechError;
  const clearActiveError = error
    ? () => setError(null)
    : clearSpeechError;

  const canSubmit = text.trim().length > 0 && !isProcessing && !isTranscribing;

  const shellClass = cn(
    "input-shell border border-border bg-card overflow-hidden",
    isFocused && !isListening && !isProcessing && "input-shell--focused",
    isProcessing && "input-shell--processing",
    isListening && "input-shell--recording"
  );

  const phaseConfig = {
    classifying: { icon: Loader2, label: "Thinking...", spin: true },
    logging: { icon: BookOpen, label: "Logging entry...", spin: false },
    searching: { icon: Search, label: "Searching logs...", spin: false },
  };

  const phase = processingPhase ? phaseConfig[processingPhase] : null;

  const recordingLabel = isTouchDevice.current && tapRecording
    ? "Recording — tap to stop"
    : "Recording — release to stop";

  return (
    <div className="space-y-2">
      <div className={shellClass}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setInputMethod("text");
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={
            isListening
              ? "Listening..."
              : isTranscribing
                ? "Transcribing..."
                : "Log a thought, or ask anything..."
          }
          disabled={isProcessing || isTranscribing}
          rows={3}
          className={cn(
            "w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[15px] leading-relaxed",
            "placeholder:text-muted-foreground/40 outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60",
            "field-sizing-content"
          )}
        />

        {(isListening || isTranscribing || phase) && (
          <div className="px-4 pb-1">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                isListening && "bg-red-500/15 text-red-400",
                isTranscribing && "bg-amber-500/15 text-amber-400",
                phase && "bg-primary/10 text-primary"
              )}
            >
              {isListening && (
                <>
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                  </span>
                  {recordingLabel}
                </>
              )}
              {isTranscribing && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Transcribing audio...
                </>
              )}
              {phase && (
                <>
                  <phase.icon
                    className={cn("h-3 w-3", phase.spin && "animate-spin")}
                  />
                  {phase.label}
                </>
              )}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between px-3 py-2.5 border-t border-border/40">
          <div className="flex items-center gap-1 text-xs text-muted-foreground/40">
            {hasActiveQuery && !isProcessing ? (
              <button
                onClick={onClearQuery}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
                  "text-xs font-medium text-primary/80 hover:text-primary",
                  "bg-primary/8 hover:bg-primary/15 transition-colors"
                )}
              >
                <X className="h-3 w-3" />
                Clear results
              </button>
            ) : (
              <span className="select-none pl-1 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" />
                AI auto-detects log vs. search
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isSupported ? (
              <button
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onClick={handleMicTap}
                onContextMenu={(e) => e.preventDefault()}
                disabled={isProcessing || isTranscribing}
                title={isTouchDevice.current ? "Tap to record" : "Hold to record"}
                className={cn(
                  "relative h-9 w-9 rounded-full flex items-center justify-center",
                  "select-none touch-none transition-all duration-200",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                  isListening
                    ? "bg-red-500 text-white scale-110 shadow-lg shadow-red-500/40"
                    : "text-muted-foreground/60 hover:text-foreground hover:bg-accent/80"
                )}
              >
                <Mic className={cn("h-[18px] w-[18px]", isListening && "scale-110")} />
                {isListening && <span className="recording-ripple" />}
              </button>
            ) : (
              <button
                disabled
                title="Voice input not supported"
                className="h-9 w-9 rounded-full flex items-center justify-center opacity-30 cursor-not-allowed"
              >
                <MicOff className="h-[18px] w-[18px] text-muted-foreground" />
              </button>
            )}

            <div className="h-5 w-px bg-border/50" />

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              title="Send"
              className={cn(
                "h-9 w-9 rounded-full flex items-center justify-center",
                "transition-all duration-200",
                canSubmit
                  ? "bg-primary text-primary-foreground shadow-md hover:shadow-lg hover:scale-105 active:scale-95"
                  : "bg-muted/60 text-muted-foreground/30 cursor-not-allowed"
              )}
            >
              {isProcessing ? (
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
              ) : (
                <ArrowUp className="h-[18px] w-[18px]" />
              )}
            </button>
          </div>
        </div>
      </div>

      {activeError && (
        <div className="flex items-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 px-3 py-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive flex-1">{activeError}</p>
          <button
            onClick={clearActiveError}
            className="text-destructive/50 hover:text-destructive transition-colors shrink-0 rounded-full hover:bg-destructive/10 p-0.5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
