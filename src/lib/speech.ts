"use client";

import { useState, useCallback, useRef } from "react";

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeRef = useRef({ mimeType: "audio/webm", ext: "webm" });
  const recordStartRef = useRef(0);

  const startListening = useCallback(async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      return;
    }

    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const candidates = [
        { mimeType: "audio/webm;codecs=opus", ext: "webm" },
        { mimeType: "audio/webm", ext: "webm" },
        { mimeType: "audio/ogg;codecs=opus", ext: "ogg" },
        { mimeType: "audio/mp4", ext: "m4a" },
        { mimeType: "audio/wav", ext: "wav" },
      ];

      const picked = candidates.find((c) => MediaRecorder.isTypeSupported(c.mimeType))
        ?? { mimeType: "", ext: "webm" };

      mimeRef.current = picked;

      const mediaRecorder = new MediaRecorder(stream, picked.mimeType ? { mimeType: picked.mimeType } : undefined);

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const { mimeType, ext } = mimeRef.current;
        const blobType = mimeType || "audio/webm";
        const audioBlob = new Blob(chunksRef.current, { type: blobType });
        chunksRef.current = [];

        const durationMs = Date.now() - recordStartRef.current;
        if (audioBlob.size < 1000 || durationMs < 500) {
          setIsListening(false);
          return;
        }

        setIsTranscribing(true);
        try {
          const formData = new FormData();
          formData.append(
            "audio",
            new File([audioBlob], `recording.${ext}`, { type: blobType })
          );

          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Transcription failed");
          }

          const data = await res.json();
          if (data.text?.trim()) {
            setTranscript((prev) =>
              prev ? `${prev} ${data.text.trim()}` : data.text.trim()
            );
          }
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to transcribe audio. Please try again."
          );
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      recordStartRef.current = Date.now();
      mediaRecorder.start(1000);
      setIsListening(true);
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access was denied. Please allow microphone permissions in your browser settings."
          : err instanceof DOMException && err.name === "NotFoundError"
            ? "No microphone was found. Please connect a microphone and try again."
            : "Could not access microphone. Please check your browser settings.";
      setError(msg);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript("");
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isListening,
    isTranscribing,
    transcript,
    isSupported: true,
    error,
    startListening,
    stopListening,
    resetTranscript,
    clearError,
  };
}
