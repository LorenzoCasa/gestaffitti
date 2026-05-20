import { useState } from "react";
import { COLOR_PALETTE } from "../../../constants";
import Modal from "../../shared/Modal";
import Field, { iS, btnP } from "../../shared/Field";

export default function SettingsSection({ realApts, bookings, onAddApartment, onUpdateApartment, onDeleteApartment }) {
  const [aptModal, setAptModal] = useState(null);
  const [aptForm, setAptForm] = useState({ id: "", label: "", color: COLOR_PALETTE[0] });

  function openAddApt() { setAptForm({ id: `apt_${Date.now()}`, label: "", color: COLOR_PALETTE[0] }); setAptModal("add"); }
  function openEditApt(apt) { setAptForm({ ...apt }); setAptModal("edit"); }
  function saveApt() {
    if (!aptForm.label.trim()) return;
    if (aptModal === "add") onAddApartment({ ...aptForm, label: aptForm.label.trim() });
    else onUpdateApartment({ ...aptForm, label: aptForm.label.trim() });
    setAptModal(null);
  }
  function deleteApt(id) {
    if (bookings.some(b => b.apt === id)) { alert("Impossibile eliminare: ci sono prenotazioni associate."); return; }
    onDeleteApartment(id);
  }

  return (
    <>
      <div>
        <h2 style={{fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"1.2rem",marginBottom:"0.9rem",marginTop:"0.4rem"}}>Impostazioni</h2>
        <div style={{background:"#120f0a",border:"1px solid #2a2010",borderRadius:"12px",padding:"0.9rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.8rem"}}>
            <h3 style={{margin:0,fontFamily:"'Playfair Display',serif",color:"#e8d5b0",fontSize:"0.95rem"}}>🏠 Appartamenti</h3>
            <button onClick={openAddApt} style={btnP}>+ Nuovo</button>
          </div>
          {realApts.length===0&&<p style={{color:"#5a4a30",fontSize:"0.82rem",margin:0}}>Nessun appartamento configurato. Aggiungine uno con il pulsante + Nuovo.</p>}
          {realApts.map((apt,i)=>(
            <div key={apt.id} style={{display:"flex",alignItems:"center",gap:"0.7rem",padding:"0.65rem 0",borderTop:i>0?"1px solid #1a1510":"none"}}>
              <div style={{width:"22px",height:"22px",borderRadius:"6px",background:apt.color,flexShrink:0,border:"1px solid rgba(255,255,255,0.1)"}}/>
              <span style={{flex:1,color:"#e8d5b0",fontSize:"0.88rem"}}>{apt.label}</span>
              <span style={{fontSize:"0.62rem",color:"#4a3a20",background:"#0d0a07",padding:"0.1rem 0.45rem",borderRadius:"4px",border:"1px solid #2a2010"}}>{bookings.filter(b=>b.apt===apt.id).length} prenot.</span>
              <button onClick={()=>openEditApt(apt)} style={{background:"#2a2010",border:"1px solid #3a3020",borderRadius:"6px",padding:"0.25rem 0.5rem",color:"#c9a96e",cursor:"pointer",fontSize:"0.68rem"}}>✏️</button>
              <button onClick={()=>deleteApt(apt.id)} style={{background:"#2a1010",border:"1px solid #3a1010",borderRadius:"6px",padding:"0.25rem 0.5rem",color:"#c96e6e",cursor:"pointer",fontSize:"0.68rem"}}>🗑</button>
            </div>
          ))}
        </div>
      </div>

      {aptModal&&(
        <Modal title={aptModal==="add"?"Nuovo Appartamento":"Modifica Appartamento"} onClose={()=>setAptModal(null)}>
          <Field label="Nome"><input value={aptForm.label} onChange={e=>setAptForm({...aptForm,label:e.target.value})} style={iS} placeholder="Es. 🌊 App. Mare"/></Field>
          <Field label="Colore">
            <div style={{display:"flex",flexWrap:"wrap",gap:"0.5rem",marginTop:"0.2rem"}}>
              {COLOR_PALETTE.map(color=>(
                <div key={color} onClick={()=>setAptForm({...aptForm,color})} style={{width:"32px",height:"32px",borderRadius:"8px",background:color,cursor:"pointer",border:aptForm.color===color?"2px solid #e8d5b0":"2px solid transparent",boxShadow:aptForm.color===color?"0 0 0 1px rgba(255,255,255,0.25)":"none"}}/>
              ))}
            </div>
          </Field>
          <div style={{display:"flex",gap:"0.65rem",marginTop:"0.5rem"}}>
            <button onClick={()=>setAptModal(null)} style={{...btnP,flex:1,background:"#2a2010",color:"#8a7a60"}}>Annulla</button>
            <button onClick={saveApt} style={{...btnP,flex:1}}>Salva</button>
          </div>
        </Modal>
      )}
    </>
  );
}
