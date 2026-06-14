import { useState } from "react";
import { PLATFORMS, COMMISSIONS } from "../../../constants";
import { formatDate, nightCount } from "../../../utils/dateUtils";
import Modal from "../../shared/Modal";
import Field, { iS, btnP } from "../../shared/Field";
import DateRangePicker from "../../shared/DateRangePicker";

export default function BookingsSection({ filteredBookings, realApts, aptColor, aptLabel, today, onAddBooking, onUpdateBooking, onDeleteBooking, onToggleDeposit }) {
  const emptyBooking = { apt: realApts[0]?.id || "apt1", guest: "", email: "", phone: "", checkin: "", checkout: "", price: "", deposit: "", depositPaid: false, platform: "Airbnb", notes: "", cleaning: false, checkinDone: false };
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [bForm, setBForm] = useState(emptyBooking);
  const [tab, setTab] = useState("arrivo");

  const commPct = COMMISSIONS[bForm.platform] || 0;
  const commAmt = bForm.price ? Math.round(Number(bForm.price) * commPct / 100) : 0;
  const nettoRicevuto = bForm.price ? Math.round(Number(bForm.price) * (1 - commPct / 100)) : 0;

  // "Arrivati" = checkinDone manuale OPPURE data check-in già passata
  // "In arrivo" = check-in oggi o futuro, e non ancora marcato entrato
  const isArrived = (b) => b.checkinDone || b.checkin < today;
  const inArrivo = filteredBookings.filter(b => !isArrived(b));
  const arrivati = filteredBookings
    .filter(b => isArrived(b))
    .sort((a, b) => a.checkin > b.checkin ? -1 : 1); // più recente prima

  const displayed = tab === "arrivo" ? inArrivo : arrivati;

  function openAdd() {
    if (realApts.length === 0) { alert("Nessun appartamento configurato. Aggiungine uno in Impostazioni."); return; }
    setBForm(emptyBooking); setEditId(null); setShowModal(true);
  }
  function openEdit(b) { setBForm({ ...b }); setEditId(b.id); setShowModal(true); }
  function closeModal() { setShowModal(false); setEditId(null); }

  async function saveBooking() {
    if (!bForm.guest || !bForm.checkin || !bForm.checkout) return;
    const rawDep = bForm.deposit;
    const deposit = (rawDep === "" || rawDep === null || rawDep === undefined)
      ? 0
      : (Number.isFinite(Number(rawDep)) ? Number(rawDep) : 0);
    const data = { ...bForm, price: Number(bForm.price), deposit };
    const result = editId
      ? await onUpdateBooking(editId, data)
      : await onAddBooking(data);
    if (result && !result.ok) {
      alert("Errore salvataggio: " + result.error.message);
      return;
    }
    closeModal();
    setBForm(emptyBooking);
  }

  const tabBtn = (id, label, count) => {
    const active = tab === id;
    return (
      <button
        key={id}
        onClick={() => setTab(id)}
        style={{
          background: active ? "#2a2010" : "#120f0a",
          border: active ? "1px solid #c9a96e55" : "1px solid #2a2010",
          borderRadius: "20px", padding: "0.3rem 0.85rem",
          color: active ? "#c9a96e" : "#5a4a30",
          fontSize: "0.7rem", fontFamily: "'Playfair Display',serif",
          cursor: "pointer", whiteSpace: "nowrap",
        }}>
        {label}
        {count > 0 && (
          <span style={{ marginLeft: "0.35rem", background: active ? "#c9a96e22" : "#1a1a1a", borderRadius: "10px", padding: "0 0.35rem", fontSize: "0.6rem" }}>
            {count}
          </span>
        )}
      </button>
    );
  };

  return (
    <>
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.75rem"}}>
          <h2 style={{fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"1.2rem",margin:0}}>Prenotazioni</h2>
          <button onClick={openAdd} style={btnP}>+ Nuova</button>
        </div>

        {/* Tab In arrivo / Arrivati */}
        <div style={{display:"flex",gap:"0.3rem",marginBottom:"0.9rem"}}>
          {tabBtn("arrivo",  "In arrivo",  inArrivo.length)}
          {tabBtn("arrivati","Arrivati",   arrivati.length)}
        </div>

        <div style={{display:"flex",flexDirection:"column",gap:"0.6rem"}}>
          {displayed.length === 0 && (
            <p style={{color:"#5a4a30",fontSize:"0.8rem"}}>
              {tab === "arrivo" ? "Nessun cliente in arrivo." : "Nessun accesso registrato."}
            </p>
          )}
          {displayed.map(b => {
            const nights = nightCount(b.checkin, b.checkout);
            const isActive = b.checkin <= today && b.checkout > today;
            const isPast = b.checkout <= today;
            return (
              <div key={b.id} style={{background:"#120f0a",border:"1px solid #2a2010",borderRadius:"12px",padding:"0.85rem 0.9rem",borderLeft:`3px solid ${aptColor(b.apt)}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"0.5rem"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:"0.45rem",marginBottom:"0.2rem",flexWrap:"wrap"}}>
                      <span style={{color:"#e8d5b0",fontWeight:"600",fontSize:"0.92rem"}}>{b.guest}</span>
                      {b.checkinDone && (
                        <span style={{background:"#1a2a1a",color:"#6ec99a",fontSize:"0.58rem",padding:"0.1rem 0.4rem",borderRadius:"20px",border:"1px solid #6ec99a44"}}>✓ Entrato</span>
                      )}
                      {!b.checkinDone && b.checkin < today && (
                        <span style={{background:"#2a1a08",color:"#c9906e",fontSize:"0.58rem",padding:"0.1rem 0.4rem",borderRadius:"20px",border:"1px solid #c9906e44"}}>⚠ Check-in passato</span>
                      )}
                      {!b.checkinDone && isActive && b.checkin >= today && (
                        <span style={{background:"#6ea0c922",color:"#6ea0c9",fontSize:"0.58rem",padding:"0.1rem 0.4rem",borderRadius:"20px",border:"1px solid #6ea0c944"}}>In corso</span>
                      )}
                    </div>
                    <div style={{color:"#6a5a40",fontSize:"0.72rem",marginBottom:"0.18rem"}}>📅 {formatDate(b.checkin)} → {formatDate(b.checkout)} · {nights}n</div>
                    <div style={{color:"#6a5a40",fontSize:"0.72rem",marginBottom:"0.3rem"}}>🏠 {aptLabel(b.apt)} · 📲 {b.platform}</div>
                    <div style={{display:"flex",alignItems:"center",gap:"0.35rem",flexWrap:"wrap"}}>
                      <span style={{fontSize:"0.7rem",color:b.depositPaid?"#6ec99a":"#c9a96e",background:b.depositPaid?"#1a2a1a":"#2a2010",padding:"0.12rem 0.45rem",borderRadius:"5px",border:`1px solid ${b.depositPaid?"#6ec99a33":"#c9a96e33"}`}}>{b.depositPaid?"✓":"○"} Caparra €{b.deposit||0}</span>
                      {!b.depositPaid&&<button onClick={()=>onToggleDeposit(b.id)} style={{background:"none",border:"none",color:"#6ec99a",cursor:"pointer",fontSize:"0.68rem",textDecoration:"underline",padding:0}}>Segna ricevuta</button>}
                    </div>
                    {b.notes&&<div style={{color:"#8a7a60",fontSize:"0.7rem",fontStyle:"italic",marginTop:"0.28rem"}}>📝 {b.notes}</div>}
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{color:"#c9a96e",fontSize:"1.05rem",fontFamily:"'Playfair Display',serif",fontWeight:"700"}}>€{b.price}</div>
                    <div style={{color:"#5a4a30",fontSize:"0.62rem",marginBottom:"0.35rem"}}>€{nights?Math.round(b.price/nights):0}/n</div>
                    <div style={{display:"flex",gap:"0.3rem"}}>
                      <button onClick={()=>openEdit(b)} style={{background:"#2a2010",border:"1px solid #3a3020",borderRadius:"6px",padding:"0.25rem 0.45rem",color:"#c9a96e",cursor:"pointer",fontSize:"0.68rem"}}>✏️</button>
                      <button onClick={()=>onDeleteBooking(b.id)} style={{background:"#2a1010",border:"1px solid #3a1010",borderRadius:"6px",padding:"0.25rem 0.45rem",color:"#c96e6e",cursor:"pointer",fontSize:"0.68rem"}}>🗑</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showModal&&(
        <Modal title={editId?"Modifica Prenotazione":"Nuova Prenotazione"} onClose={closeModal}>
          <Field label="Appartamento"><select value={bForm.apt} onChange={e=>setBForm({...bForm,apt:e.target.value})} style={iS}>{realApts.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>
          <Field label="Nome Ospite"><input value={bForm.guest} onChange={e=>setBForm({...bForm,guest:e.target.value})} style={iS} placeholder="Nome Cognome"/></Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.65rem"}}>
            <Field label="Email"><input value={bForm.email} onChange={e=>setBForm({...bForm,email:e.target.value})} style={iS} placeholder="email@..." type="email"/></Field>
            <Field label="Telefono"><input value={bForm.phone} onChange={e=>setBForm({...bForm,phone:e.target.value})} style={iS} placeholder="3xx-xxx" type="tel"/></Field>
          </div>
          <DateRangePicker
            checkin={bForm.checkin}
            checkout={bForm.checkout}
            onChange={(ci, co) => setBForm({...bForm, checkin: ci, checkout: co})}
          />
          <Field label="Piattaforma"><select value={bForm.platform} onChange={e=>setBForm({...bForm,platform:e.target.value})} style={iS}>{PLATFORMS.map(p=><option key={p}>{p}</option>)}</select></Field>
          <Field label="Totale €">
            <input type="number" value={bForm.price} onChange={e=>setBForm({...bForm,price:e.target.value})} style={iS} placeholder="0"/>
            {bForm.price&&Number(bForm.price)>0&&(
              <div style={{marginTop:"0.4rem",padding:"0.5rem 0.7rem",background:"#0d0a07",borderRadius:"7px",border:"1px solid #2a2010"}}>
                {commPct>0?(
                  <>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.72rem",color:"#8a7a60",marginBottom:"0.2rem"}}>
                      <span>Commissione {bForm.platform} ({commPct}%)</span>
                      <span style={{color:"#c96e6e"}}>−€{commAmt}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.75rem",color:"#c9c0a8",fontWeight:"600"}}>
                      <span>Netto ricevuto</span>
                      <span style={{color:"#6ec99a"}}>€{nettoRicevuto}</span>
                    </div>
                  </>
                ):(
                  <div style={{fontSize:"0.72rem",color:"#6a5a40"}}>Nessuna commissione · Netto: €{Number(bForm.price)}</div>
                )}
              </div>
            )}
          </Field>
          <Field label="Caparra €"><input type="number" value={bForm.deposit} onChange={e=>setBForm({...bForm,deposit:e.target.value})} style={iS} placeholder="0"/></Field>
          <div style={{display:"flex",alignItems:"center",gap:"0.65rem",marginBottom:"0.9rem",padding:"0.55rem 0.8rem",background:"#0d0a07",borderRadius:"8px",border:"1px solid #2a2010",cursor:"pointer"}} onClick={()=>setBForm({...bForm,depositPaid:!bForm.depositPaid})}>
            <span style={{fontSize:"1rem"}}>{bForm.depositPaid?"✅":"⬜"}</span>
            <span style={{color:"#8a7a60",fontSize:"0.8rem",fontFamily:"'Playfair Display',serif"}}>Caparra già ricevuta</span>
          </div>
          <Field label="Note"><input value={bForm.notes} onChange={e=>setBForm({...bForm,notes:e.target.value})} style={iS} placeholder="Note..."/></Field>
          <div style={{display:"flex",gap:"0.65rem",marginTop:"0.2rem"}}>
            <button onClick={closeModal} style={{...btnP,flex:1,background:"#2a2010",color:"#8a7a60"}}>Annulla</button>
            <button onClick={saveBooking} style={{...btnP,flex:1}}>Salva</button>
          </div>
        </Modal>
      )}
    </>
  );
}
