import { useState, useRef, useEffect } from "react";

export function useSpeechRecognition({ onResult, onEnd, lang = "it-IT" } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript,  setTranscript]  = useState("");
  const [error,       setError]       = useState(null);
  const recRef = useRef(null);

  const supported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  function startListening() {
    if (!supported || isListening) return;
    setError(null);
    setTranscript("");
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const rec = new SR();
    recRef.current = rec;
    rec.lang             = lang;
    rec.interimResults   = false;
    rec.maxAlternatives  = 1;
    rec.continuous       = false;
    rec.onstart  = () => setIsListening(true);
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript.trim();
      setTranscript(text);
      onResult?.(text);
    };
    rec.onerror = (e) => {
      setIsListening(false);
      const msgs = {
        "not-allowed":   "Permesso microfono negato",
        "no-speech":     "Nessuna voce rilevata — riprova",
        "audio-capture": "Microfono non disponibile",
        "network":       "Errore di rete durante il riconoscimento",
      };
      setError(msgs[e.error] ?? `Errore microfono: ${e.error}`);
    };
    rec.onend = () => { setIsListening(false); onEnd?.(); };
    try { rec.start(); } catch { setError("Impossibile avviare il microfono"); }
  }

  function stopListening() {
    recRef.current?.stop();
    setIsListening(false);
  }

  useEffect(() => () => recRef.current?.abort(), []);

  return { isListening, transcript, error, supported, startListening, stopListening };
}
