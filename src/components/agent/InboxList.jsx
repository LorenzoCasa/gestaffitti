import InboxCard from "./InboxCard";

export default function InboxList({ inbox, onLoad }) {
  const newCount = inbox.filter(i => i.status === "new").length;

  return (
    <div style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem" }}>
        <h3 style={{ fontFamily: "'Playfair Display',serif", color: "#c9a96e", fontSize: "0.9rem", margin: 0 }}>
          📬 Richieste ricevute
        </h3>
        {newCount > 0 && (
          <span style={{ background: "#c9a96e", color: "#0a0806", borderRadius: "20px", padding: "0.1rem 0.55rem", fontSize: "0.65rem", fontWeight: "700" }}>
            {newCount} {newCount === 1 ? "nuova" : "nuove"}
          </span>
        )}
      </div>

      {inbox.length === 0 ? (
        <div style={{ background: "rgba(201,169,110,0.05)", border: "1px solid #2a2010", borderRadius: "12px", padding: "0.9rem 1rem" }}>
          <div style={{ color: "#5a4a30", fontSize: "0.78rem", textAlign: "center" }}>
            Nessuna richiesta ricevuta
          </div>
        </div>
      ) : (
        inbox.map(item => (
          <InboxCard key={item.id} item={item} onLoad={onLoad} />
        ))
      )}
    </div>
  );
}
