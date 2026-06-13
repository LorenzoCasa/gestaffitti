import { formatDate } from "../../../utils/dateUtils";

export default function OperationsSection({ filteredBookings, aptColor, aptLabel, onToggleCleaning, onToggleCheckin, today }) {
  const todayStr = today || new Date().toISOString().split("T")[0];

  // Prenotazioni ancora attive o future
  const active = filteredBookings.filter(b => b.checkout > todayStr);
  const pendingCheckin = active.filter(b => !b.checkinDone);
  const checkedIn     = active.filter(b => b.checkinDone);

  // Pulizie in attesa post checkout
  const pendingCleaning = filteredBookings.filter(b => !b.cleaning && b.checkout <= todayStr);

  function BookingCard({ b, showCheckin = true, showCleaning = false }) {
    return (
      <div style={{ background: "#120f0a", border: "1px solid #2a2010", borderRadius: "12px", padding: "0.85rem 0.9rem", borderLeft: `3px solid ${aptColor(b.apt)}` }}>
        <div style={{ marginBottom: "0.55rem" }}>
          <div style={{ color: "#e8d5b0", fontWeight: "600", fontSize: "0.88rem" }}>{b.guest}</div>
          <div style={{ color: "#6a5a40", fontSize: "0.72rem" }}>{aptLabel(b.apt)} · {formatDate(b.checkin)} → {formatDate(b.checkout)}</div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {showCheckin && (
            <button
              onClick={() => onToggleCheckin(b.id)}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem", padding: "0.5rem", borderRadius: "8px", border: `1px solid ${b.checkinDone ? "#6ec99a44" : "#2a2010"}`, cursor: "pointer", fontSize: "0.75rem", fontFamily: "Georgia,serif", background: b.checkinDone ? "#1a2a1a" : "#120f0a", color: b.checkinDone ? "#6ec99a" : "#5a4a30" }}>
              {b.checkinDone ? "✅" : "⬜"} Check-in
            </button>
          )}
          {showCleaning && (
            <button
              onClick={() => onToggleCleaning(b.id)}
              style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem", padding: "0.5rem", borderRadius: "8px", border: `1px solid ${b.cleaning ? "#6ec99a44" : "#2a2010"}`, cursor: "pointer", fontSize: "0.75rem", fontFamily: "Georgia,serif", background: b.cleaning ? "#1a2a1a" : "#120f0a", color: b.cleaning ? "#6ec99a" : "#5a4a30" }}>
              {b.cleaning ? "✅" : "⬜"} Pulizie
            </button>
          )}
        </div>
      </div>
    );
  }

  const sectionTitle = { fontFamily: "'Playfair Display',serif", fontSize: "0.82rem", color: "#8a7a60", marginBottom: "0.45rem", marginTop: "0.9rem", letterSpacing: "0.04em", textTransform: "uppercase" };
  const emptyNote = { color: "#4a3a20", fontSize: "0.75rem", fontStyle: "italic", padding: "0.3rem 0" };

  return (
    <div>
      <h2 style={{ fontFamily: "'Playfair Display',serif", color: "#c9a96e", fontSize: "1.2rem", marginBottom: "0.9rem", marginTop: "0.4rem" }}>
        Pulizie & Check-in/out
      </h2>

      {/* Arrivi in attesa */}
      <div style={sectionTitle}>🔑 Arrivi in attesa ({pendingCheckin.length})</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        {pendingCheckin.length === 0
          ? <p style={emptyNote}>Nessun arrivo in attesa.</p>
          : pendingCheckin.map(b => <BookingCard key={b.id} b={b} showCheckin showCleaning={false} />)
        }
      </div>

      {/* Ospiti già entrati */}
      {checkedIn.length > 0 && (
        <>
          <div style={sectionTitle}>🏠 Clienti già entrati ({checkedIn.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {checkedIn.map(b => (
              <BookingCard key={b.id} b={b} showCheckin showCleaning={false} />
            ))}
          </div>
        </>
      )}

      {/* Pulizie in attesa */}
      {pendingCleaning.length > 0 && (
        <>
          <div style={sectionTitle}>🧹 Pulizie post checkout ({pendingCleaning.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {pendingCleaning.map(b => <BookingCard key={b.id} b={b} showCheckin={false} showCleaning />)}
          </div>
        </>
      )}

      {filteredBookings.length === 0 && (
        <p style={{ color: "#5a4a30" }}>Nessuna prenotazione.</p>
      )}
    </div>
  );
}
