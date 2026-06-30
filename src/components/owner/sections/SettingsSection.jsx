import { useState } from "react";
import { supabase } from "../../../supabaseClient";
import { COLOR_PALETTE } from "../../../constants";
import Modal from "../../shared/Modal";
import Field, { iS, btnP } from "../../shared/Field";

export default function SettingsSection({ user, realApts, bookings, onAddApartment, onUpdateApartment, onDeleteApartment, categories }) {
  const [aptModal, setAptModal] = useState(null);
  const [pwModal, setPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ newPw: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  async function handleChangePw() {
    if (!pwForm.newPw || !pwForm.confirm) { setPwError("Compila entrambi i campi"); return; }
    if (pwForm.newPw.length < 8) { setPwError("La password deve essere di almeno 8 caratteri"); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwError("Le password non coincidono"); return; }
    setPwLoading(true);
    setPwError("");
    const { error } = await supabase.auth.updateUser({ password: pwForm.newPw });
    setPwLoading(false);
    if (error) {
      setPwError("Errore: " + error.message);
    } else {
      setPwSuccess(true);
      setTimeout(() => { setPwModal(false); setPwSuccess(false); setPwForm({ newPw: "", confirm: "" }); }, 1800);
    }
  }

  function openPwModal() { setPwForm({ newPw: "", confirm: "" }); setPwError(""); setPwSuccess(false); setPwModal(true); }
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

        <div style={{marginTop:"1rem",background:"#120f0a",border:"1px solid #2a2010",borderRadius:"12px",padding:"0.9rem"}}>
          <h3 style={{margin:"0 0 0.8rem",fontFamily:"'Playfair Display',serif",color:"#e8d5b0",fontSize:"0.95rem"}}>🏷 Tipologie di spesa</h3>
          {categories.length===0&&<p style={{color:"#5a4a30",fontSize:"0.82rem",margin:0}}>Nessuna categoria caricata.</p>}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"0.35rem 0.5rem",marginBottom:"0.5rem",padding:"0.3rem 0",borderBottom:"1px solid #1a1510"}}>
            {["Nome","Tipo","Scope","P/L"].map(h=>(
              <span key={h} style={{fontSize:"0.6rem",color:"#4a3a20",textTransform:"uppercase",letterSpacing:"0.07em",fontWeight:"700"}}>{h}</span>
            ))}
          </div>
          {categories.map((c,i)=>(
            <div key={c.id??c.name} style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"0.35rem 0.5rem",padding:"0.45rem 0",borderTop:i>0?"1px solid #1a1510":"none",alignItems:"center"}}>
              <span style={{color:"#e8d5b0",fontSize:"0.8rem",fontWeight:"500"}}>{c.name}</span>
              <span style={{fontSize:"0.72rem",color:"#8a7a60"}}>{c.type??<span style={{color:"#3a3020"}}>—</span>}</span>
              <span style={{fontSize:"0.72rem",color:"#8a7a60"}}>{c.scope??<span style={{color:"#3a3020"}}>—</span>}</span>
              <span style={{fontSize:"0.72rem",color:c.affects_profit===true?"#6ec99a":c.affects_profit===false?"#c96e6e":"#3a3020"}}>{c.affects_profit===true?"Sì":c.affects_profit===false?"No":"—"}</span>
            </div>
          ))}
          <div style={{marginTop:"0.6rem",padding:"0.45rem 0.6rem",background:"#0d0a07",borderRadius:"7px",border:"1px solid #2a2010"}}>
            <span style={{fontSize:"0.65rem",color:"#4a3a20"}}>Fonte: </span>
            <span style={{fontSize:"0.65rem",color:categories[0]?.id!==null?"#6ec99a":"#c9a96e"}}>{categories[0]?.id!==null?"Supabase ✓":"Fallback locale ⚠"}</span>
            <span style={{fontSize:"0.65rem",color:"#4a3a20"}}> · {categories.length} categorie</span>
          </div>
        </div>
        <div style={{marginTop:"1rem",background:"#120f0a",border:"1px solid #2a2010",borderRadius:"12px",padding:"0.9rem"}}>
          <h3 style={{margin:"0 0 0.8rem",fontFamily:"'Playfair Display',serif",color:"#e8d5b0",fontSize:"0.95rem"}}>🔐 Sicurezza</h3>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:"0.8rem",color:"#8a7a60"}}>Account</div>
              <div style={{fontSize:"0.85rem",color:"#e8d5b0",marginTop:"0.1rem"}}>{user?.email}</div>
            </div>
            <button onClick={openPwModal} style={btnP}>Cambia password</button>
          </div>
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

      {pwModal&&(
        <Modal title="Cambia password" onClose={()=>setPwModal(false)}>
          {pwSuccess ? (
            <div style={{textAlign:"center",padding:"0.5rem 0"}}>
              <div style={{fontSize:"1.8rem",marginBottom:"0.5rem"}}>✅</div>
              <div style={{color:"#6ec99a",fontFamily:"'Playfair Display',serif",fontSize:"0.95rem"}}>Password aggiornata</div>
            </div>
          ) : (
            <>
              <Field label="Nuova password">
                <div style={{position:"relative"}}>
                  <input type={showPw?"text":"password"} value={pwForm.newPw} onChange={e=>{ setPwForm(f=>({...f,newPw:e.target.value})); setPwError(""); }} style={{...iS,padding:"0.75rem 2.8rem 0.75rem 1rem"}}/>
                  <button onClick={()=>setShowPw(s=>!s)} style={{position:"absolute",right:"0.8rem",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#6a5a40",cursor:"pointer",fontSize:"1rem",lineHeight:1}}>{showPw?"🙈":"👁"}</button>
                </div>
              </Field>
              <Field label="Conferma password">
                <input type={showPw?"text":"password"} value={pwForm.confirm} onChange={e=>{ setPwForm(f=>({...f,confirm:e.target.value})); setPwError(""); }} style={iS}/>
              </Field>
              {pwError&&<div style={{background:"rgba(201,110,110,0.12)",border:"1px solid #c96e6e44",borderRadius:"8px",padding:"0.55rem 0.8rem",color:"#c96e6e",fontSize:"0.78rem",textAlign:"center",marginBottom:"0.5rem"}}>{pwError}</div>}
              <div style={{display:"flex",gap:"0.65rem",marginTop:"0.5rem"}}>
                <button onClick={()=>setPwModal(false)} style={{...btnP,flex:1,background:"#2a2010",color:"#8a7a60"}}>Annulla</button>
                <button onClick={handleChangePw} disabled={pwLoading} style={{...btnP,flex:1,opacity:pwLoading?0.7:1,cursor:pwLoading?"not-allowed":"pointer"}}>{pwLoading?"Salvataggio…":"Salva"}</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
