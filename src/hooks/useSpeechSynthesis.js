import { useState } from "react";

export function useSpeechSynthesis({ lang = "it-IT", rate = 0.88, pitch = 1.0 } = {}) {
  const [speaking, setSpeaking] = useState(false);

  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  function speak(text) {
    if (!supported || !text?.trim()) return;
    window.speechSynthesis.cancel();
    const utter    = new SpeechSynthesisUtterance(text.trim());
    utter.lang     = lang;
    utter.rate     = rate;
    utter.pitch    = pitch;
    utter.onstart  = () => setSpeaking(true);
    utter.onend    = () => setSpeaking(false);
    utter.onerror  = () => setSpeaking(false);
    window.speechSynthesis.speak(utter);
  }

  function stop() {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }

  return { speak, stop, speaking, supported };
}
