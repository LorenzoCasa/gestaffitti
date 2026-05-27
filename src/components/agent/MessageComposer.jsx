import { useState, useEffect } from "react";
import { AGENT_SOURCES } from "../../constants";
import Field, { iS, btnP } from "../shared/Field";

export default function MessageComposer({ apartments, onAnalyze, loading, initialValues }) {
  const [form, setForm] = useState({
    rawText:      "",
    source:       "subito",
    aptId:        apartments[0]?.id || "",
    checkin:      "",
    checkout:     "",
    guests:       2,
    offeredPrice: "",
  });

  useEffect(() => {
    if (!initialValues) return;
    setForm(f => ({
      ...f,
      rawText: initialValues.raw_text ?? f.rawText,
      source:  initialValues.source   ?? f.source,
    }));
  }, [initialValues]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function handleAnalyze() {
    if (!form.aptId || !form.checkin || !form.checkout) {
      alert("Seleziona appartamento, check-in e check-out prima di analizzare.");
      return;
    }
    onAnalyze({
      ...form,
      guests:       Number(form.guests) || 2,
      offeredPrice: form.offeredPrice !== "" ? Number(form.offeredPrice) : null,
    });
  }

  return (
    <div style={{ background: "#120f0a", border: "1px solid #2a2010", borderRadius: "14px", padding: "1rem" }}>
      <h3 style={{ fontFamily: "'Playfair Display',serif", color: "#c9a96e", fontSize: "0.95rem", margin: "0 0 0.9rem" }}>
        📨 Nuova Richiesta
      </h3>

      <Field label="Testo messaggio ricevuto">
        <textarea
          value={form.rawText}
          onChange={e => set("rawText", e.target.value)}
          style={{ ...iS, minHeight: "90px", resize: "vertical" }}
          placeholder="Incolla qui il messaggio ricevuto da Subito, email, WhatsApp…"
        />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
        <Field label="Fonte">
          <select value={form.source} onChange={e => set("source", e.target.value)} style={iS}>
            {AGENT_SOURCES.map(s => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Appartamento">
          <select value={form.aptId} onChange={e => set("aptId", e.target.value)} style={iS}>
            {apartments.map(a => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
        <Field label="Check-in">
          <input type="date" value={form.checkin} onChange={e => set("checkin", e.target.value)} style={iS} />
        </Field>
        <Field label="Check-out">
          <input type="date" value={form.checkout} onChange={e => set("checkout", e.target.value)} style={iS} />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem" }}>
        <Field label="N° Ospiti">
          <input
            type="number" min="1" max="20"
            value={form.guests}
            onChange={e => set("guests", e.target.value)}
            style={iS}
          />
        </Field>
        <Field label="Prezzo offerto (opt.)">
          <input
            type="number" min="0"
            value={form.offeredPrice}
            onChange={e => set("offeredPrice", e.target.value)}
            style={iS}
            placeholder="€ — lascia vuoto se non offerto"
          />
        </Field>
      </div>

      <button
        onClick={handleAnalyze}
        disabled={loading || apartments.length === 0}
        style={{ ...btnP, width: "100%", marginTop: "0.2rem", opacity: loading ? 0.6 : 1 }}
      >
        {loading ? "Analisi in corso…" : "🔍 Analizza"}
      </button>
    </div>
  );
}
