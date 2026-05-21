import { useState } from "react";
import { CATEGORIES, FIXED_CATS, MGMT_CATS, PAYMENT_TYPES, COMMISSIONS } from "../../../constants";
import { getPeriodBounds, getPeriodLabel, formatDate } from "../../../utils/dateUtils";
import { fmtEur } from "../../../utils/financeUtils";
import Modal from "../../shared/Modal";
import Field, { iS, btnP } from "../../shared/Field";

export default function FinancesSection({ filteredExpenses, filteredBookings, realApts, aptColor, aptLabel, onAddExpense, onUpdateExpense, onDeleteExpense, onToggleExpensePaid, categories }) {
  const now = new Date();
  const [finTab, setFinTab] = useState("mensile");
  const [finMonth, setFinMonth] = useState(now.getMonth());
  const [finQuarter, setFinQuarter] = useState(Math.floor(now.getMonth() / 3));
  const [finYear, setFinYear] = useState(now.getFullYear());

  const [showTax, setShowTax] = useState(() => localStorage.getItem("gestaffitti_showTax") === "true");
  function toggleTax() { setShowTax(v => { const next = !v; localStorage.setItem("gestaffitti_showTax", String(next)); return next; }); }

  const activeCatNames = (() => { const names = categories.filter(c => c.active).map(c => c.name); return names.length > 0 ? names : CATEGORIES; })();
  const emptyExpense = { apt: realApts[0]?.id || "apt1", date: "", category: activeCatNames[0], notes: "", amount: "", paymentType: "Una tantum", paid: false };
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [eForm, setEForm] = useState(emptyExpense);

  function prevPeriod() {
    if (finTab === "mensile") { if (finMonth === 0) { setFinMonth(11); setFinYear(y => y - 1); } else setFinMonth(m => m - 1); }
    else if (finTab === "trimestrale") { if (finQuarter === 0) { setFinQuarter(3); setFinYear(y => y - 1); } else setFinQuarter(q => q - 1); }
    else setFinYear(y => y - 1);
  }
  function nextPeriod() {
    if (finTab === "mensile") { if (finMonth === 11) { setFinMonth(0); setFinYear(y => y + 1); } else setFinMonth(m => m + 1); }
    else if (finTab === "trimestrale") { if (finQuarter === 3) { setFinQuarter(0); setFinYear(y => y + 1); } else setFinQuarter(q => q + 1); }
    else setFinYear(y => y + 1);
  }

  function openEdit(e) { setEForm({ ...e, paymentType: "Una tantum", notes: e.notes || "" }); setEditId(e.id); setShowModal(true); }
  function closeModal() { setShowModal(false); setEditId(null); }

  async function saveExpense() {
    console.log("[saveExpense] eForm:", eForm);
    if (!eForm.date) { alert("Inserisci la data"); return; }
    if (!eForm.amount || Number(eForm.amount) <= 0) { alert("Inserisci un importo valido"); return; }
    if (editId) await onUpdateExpense(editId, eForm);
    else await onAddExpense(eForm);
    closeModal(); setEForm(emptyExpense);
  }

  // Period calculations
  const [periodStart, periodEnd] = getPeriodBounds(finTab, finMonth, finQuarter, finYear);
  const periodBookings = filteredBookings.filter(b => b.checkin >= periodStart && b.checkin <= periodEnd);
  const grossRevenue = periodBookings.reduce((s, b) => s + Number(b.price), 0);
  const totalCommissions = periodBookings.reduce((s, b) => s + Number(b.price) * (COMMISSIONS[b.platform] || 0) / 100, 0);
  const netRevenue = grossRevenue - totalCommissions;
  const periodExpenses = filteredExpenses.filter(e => e.date >= periodStart && e.date <= periodEnd);
  const fixedExps = periodExpenses.filter(e => FIXED_CATS.includes(e.category));
  const mgmtExps = periodExpenses.filter(e => MGMT_CATS.includes(e.category));
  const fixedTotal = fixedExps.reduce((s, e) => s + Number(e.amount), 0);
  const mgmtTotal = mgmtExps.reduce((s, e) => s + Number(e.amount), 0);
  const totalPeriodExp = fixedTotal + mgmtTotal;
  const paidPeriodExp = periodExpenses.filter(e => e.paid).reduce((s, e) => s + Number(e.amount), 0);
  const unpaidPeriodExp = periodExpenses.filter(e => !e.paid).reduce((s, e) => s + Number(e.amount), 0);
  const nettoReale = netRevenue - paidPeriodExp;
  const nettoPrevisto = netRevenue - totalPeriodExp;
  const fixedByCategory = FIXED_CATS.map(cat => ({ cat, amt: fixedExps.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount), 0) })).filter(x => x.amt > 0);
  const mgmtByCategory = MGMT_CATS.map(cat => ({ cat, amt: mgmtExps.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount), 0) })).filter(x => x.amt > 0);

  const rowStyle = (pad = true) => ({ display: "flex", justifyContent: "space-between", alignItems: "center", padding: pad ? "0.3rem 0" : "0", borderBottom: "1px solid #1a1510" });
  const labelStyle = (sub) => ({ color: sub ? "#6a5a40" : "#c9c0a8", fontSize: sub ? "0.72rem" : "0.82rem", paddingLeft: sub ? "0.9rem" : "0" });
  const amtStyle = (color) => ({ color: color || "#e8d5b0", fontFamily: "'Playfair Display',serif", fontSize: "0.82rem", fontWeight: "600" });

  return (
    <>
      <div>
        <h2 style={{fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"1.2rem",marginBottom:"0.9rem",marginTop:"0.4rem"}}>Finanze</h2>

        {/* Tab selector */}
        <div style={{display:"flex",gap:"0.25rem",marginBottom:"0.9rem",background:"#120f0a",borderRadius:"10px",padding:"0.22rem",border:"1px solid #2a2010"}}>
          {["mensile","trimestrale","annuale"].map(t=>(
            <button key={t} onClick={()=>setFinTab(t)} style={{flex:1,padding:"0.42rem 0.3rem",borderRadius:"7px",border:"none",cursor:"pointer",background:finTab===t?"#c9a96e":"transparent",color:finTab===t?"#0a0806":"#6a5a40",fontFamily:"'Playfair Display',serif",fontSize:"0.72rem",fontWeight:finTab===t?"700":"400",textTransform:"capitalize"}}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>

        {/* Period navigation */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.9rem"}}>
          <button onClick={prevPeriod} style={{background:"#1a1612",border:"1px solid #3a3020",borderRadius:"10px",padding:"0.42rem 0.9rem",color:"#c9a96e",cursor:"pointer",fontSize:"1.1rem",lineHeight:1,fontWeight:"bold"}}>‹</button>
          <span style={{fontFamily:"'Playfair Display',serif",color:"#e8d5b0",fontSize:"1rem"}}>{getPeriodLabel(finTab,finMonth,finQuarter,finYear)}</span>
          <button onClick={nextPeriod} style={{background:"#1a1612",border:"1px solid #3a3020",borderRadius:"10px",padding:"0.42rem 0.9rem",color:"#c9a96e",cursor:"pointer",fontSize:"1.1rem",lineHeight:1,fontWeight:"bold"}}>›</button>
        </div>

        {/* Revenue card */}
        <div style={{background:"#120f0a",border:"1px solid #2a2010",borderRadius:"12px",padding:"0.9rem",marginBottom:"0.6rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:"0.4rem",marginBottom:"0.65rem"}}>
            <span style={{fontSize:"0.9rem"}}>💶</span>
            <h3 style={{margin:0,fontFamily:"'Playfair Display',serif",color:"#e8d5b0",fontSize:"0.88rem"}}>Entrate</h3>
            <span style={{fontSize:"0.62rem",color:"#4a3a20",marginLeft:"auto"}}>{periodBookings.length} prenotaz.</span>
          </div>
          <div style={rowStyle()}>
            <span style={labelStyle(false)}>Entrate lorde</span>
            <span style={amtStyle("#6ec99a")}>€{fmtEur(grossRevenue)}</span>
          </div>
          {totalCommissions>0&&(
            <div style={rowStyle()}>
              <span style={labelStyle(false)}>Commissioni piattaforme</span>
              <span style={amtStyle("#c96e6e")}>−€{fmtEur(totalCommissions)}</span>
            </div>
          )}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.4rem 0",marginTop:"0.15rem",borderTop:"1px solid #3a3020"}}>
            <span style={{color:"#c9c0a8",fontSize:"0.85rem",fontWeight:"600",fontFamily:"'Playfair Display',serif"}}>Entrate nette</span>
            <span style={{color:"#6ec99a",fontSize:"0.95rem",fontWeight:"700",fontFamily:"'Playfair Display',serif"}}>€{fmtEur(netRevenue)}</span>
          </div>
        </div>

        {/* Expenses card */}
        <div style={{background:"#120f0a",border:"1px solid #2a2010",borderRadius:"12px",padding:"0.9rem",marginBottom:"0.6rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:"0.4rem",marginBottom:"0.65rem"}}>
            <span style={{fontSize:"0.9rem"}}>📤</span>
            <h3 style={{margin:0,fontFamily:"'Playfair Display',serif",color:"#e8d5b0",fontSize:"0.88rem"}}>Spese</h3>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.3rem 0",borderBottom:"1px solid #2a2010"}}>
            <span style={{color:"#c9c0a8",fontSize:"0.8rem",fontWeight:"600"}}>🏛 Spese fisse</span>
            <span style={{color:"#c96e6e",fontFamily:"'Playfair Display',serif",fontSize:"0.82rem",fontWeight:"600"}}>€{fmtEur(fixedTotal)}</span>
          </div>
          {fixedByCategory.map(({cat,amt})=>(
            <div key={cat} style={rowStyle()}>
              <span style={labelStyle(true)}>{cat}</span>
              <span style={amtStyle("#8a7a60")}>€{fmtEur(amt)}</span>
            </div>
          ))}
          {fixedByCategory.length===0&&<div style={{color:"#4a3a20",fontSize:"0.72rem",paddingLeft:"0.9rem",padding:"0.2rem 0 0.2rem 0.9rem",fontStyle:"italic"}}>Nessuna</div>}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.3rem 0",borderBottom:"1px solid #2a2010",marginTop:"0.4rem"}}>
            <span style={{color:"#c9c0a8",fontSize:"0.8rem",fontWeight:"600"}}>🔧 Spese gestione</span>
            <span style={{color:"#c96e6e",fontFamily:"'Playfair Display',serif",fontSize:"0.82rem",fontWeight:"600"}}>€{fmtEur(mgmtTotal)}</span>
          </div>
          {mgmtByCategory.map(({cat,amt})=>(
            <div key={cat} style={rowStyle()}>
              <span style={labelStyle(true)}>{cat}</span>
              <span style={amtStyle("#8a7a60")}>€{fmtEur(amt)}</span>
            </div>
          ))}
          {mgmtByCategory.length===0&&<div style={{color:"#4a3a20",fontSize:"0.72rem",padding:"0.2rem 0 0.2rem 0.9rem",fontStyle:"italic"}}>Nessuna</div>}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.4rem 0",marginTop:"0.15rem",borderTop:"1px solid #3a3020"}}>
            <span style={{color:"#c9c0a8",fontSize:"0.85rem",fontWeight:"600",fontFamily:"'Playfair Display',serif"}}>Totale spese</span>
            <span style={{color:"#c96e6e",fontSize:"0.95rem",fontWeight:"700",fontFamily:"'Playfair Display',serif"}}>€{fmtEur(totalPeriodExp)}</span>
          </div>
        </div>

        {/* Netto reale / previsto */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.5rem",marginBottom:"0.6rem"}}>
          <div style={{background:nettoReale>=0?"rgba(110,201,154,0.06)":"rgba(201,110,110,0.06)",border:`1px solid ${nettoReale>=0?"#6ec99a33":"#c96e6e33"}`,borderRadius:"12px",padding:"0.85rem",textAlign:"center"}}>
            <div style={{fontSize:"0.6rem",color:"#6a5a40",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:"0.25rem"}}>Netto Reale</div>
            <div style={{fontSize:"1.3rem",fontWeight:"700",color:nettoReale>=0?"#6ec99a":"#c96e6e",fontFamily:"'Playfair Display',serif"}}>
              {nettoReale>=0?"":"−"}€{fmtEur(Math.abs(nettoReale))}
            </div>
            <div style={{fontSize:"0.58rem",color:"#4a3a20",marginTop:"0.15rem"}}>solo spese pagate</div>
          </div>
          <div style={{background:nettoPrevisto>=0?"rgba(110,201,154,0.04)":"rgba(201,110,110,0.04)",border:`1px solid ${nettoPrevisto>=0?"#6ec99a22":"#c96e6e22"}`,borderRadius:"12px",padding:"0.85rem",textAlign:"center"}}>
            <div style={{fontSize:"0.6rem",color:"#6a5a40",letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:"0.25rem"}}>Netto Previsto</div>
            <div style={{fontSize:"1.3rem",fontWeight:"700",color:nettoPrevisto>=0?"#6ec99a":"#c96e6e",fontFamily:"'Playfair Display',serif"}}>
              {nettoPrevisto>=0?"":"−"}€{fmtEur(Math.abs(nettoPrevisto))}
            </div>
            <div style={{fontSize:"0.58rem",color:"#4a3a20",marginTop:"0.15rem"}}>tutte le spese</div>
          </div>
        </div>
        {(paidPeriodExp>0||unpaidPeriodExp>0)&&(
          <div style={{background:"#120f0a",border:"1px solid #2a2010",borderRadius:"10px",padding:"0.65rem 0.85rem",marginBottom:"0.9rem",display:"flex",gap:"1.2rem",justifyContent:"center"}}>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:"0.6rem",color:"#6a5a40",marginBottom:"0.1rem"}}>Pagate</div>
              <div style={{fontSize:"0.88rem",color:"#6ec99a",fontWeight:"600",fontFamily:"'Playfair Display',serif"}}>€{fmtEur(paidPeriodExp)}</div>
            </div>
            <div style={{width:"1px",background:"#2a2010"}}/>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:"0.6rem",color:"#6a5a40",marginBottom:"0.1rem"}}>Da pagare</div>
              <div style={{fontSize:"0.88rem",color:"#c9a96e",fontWeight:"600",fontFamily:"'Playfair Display',serif"}}>€{fmtEur(unpaidPeriodExp)}</div>
            </div>
          </div>
        )}

        {/* Toggle simulazione tasse */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.6rem",padding:"0.55rem 0.8rem",background:"#120f0a",border:"1px solid #2a2010",borderRadius:"10px",cursor:"pointer"}} onClick={toggleTax}>
          <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
            <span style={{fontSize:"0.9rem"}}>🧾</span>
            <span style={{fontFamily:"'Playfair Display',serif",color:"#8a7a60",fontSize:"0.8rem"}}>Simulazione tasse</span>
          </div>
          <div style={{width:"36px",height:"20px",borderRadius:"10px",background:showTax?"#c9a96e":"#2a2010",border:`1px solid ${showTax?"#c9a96e":"#3a3020"}`,position:"relative",transition:"background 0.2s",flexShrink:0}}>
            <div style={{width:"14px",height:"14px",borderRadius:"50%",background:showTax?"#0a0806":"#5a4a30",position:"absolute",top:"2px",left:showTax?"19px":"3px",transition:"left 0.2s"}}/>
          </div>
        </div>

        {/* Card placeholder simulazione tasse */}
        {showTax&&(
          <div style={{background:"rgba(201,169,110,0.05)",border:"1px solid #c9a96e33",borderRadius:"12px",padding:"1rem",marginBottom:"0.9rem"}}>
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.6rem"}}>
              <span style={{fontSize:"1.1rem"}}>🧾</span>
              <h3 style={{margin:0,fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"0.95rem"}}>Simulazione fiscale in arrivo</h3>
            </div>
            <p style={{color:"#6a5a40",fontSize:"0.75rem",margin:"0 0 0.7rem",lineHeight:1.5}}>Cedolare secca, calcolo IRPEF e stima annuale disponibili nella prossima versione.</p>
            <div style={{background:"#0d0a07",border:"1px solid #2a2010",borderRadius:"8px",padding:"0.6rem 0.75rem"}}>
              <p style={{color:"#4a3a20",fontSize:"0.65rem",margin:0,lineHeight:1.6,fontStyle:"italic"}}>⚠ Questa simulazione è uno strumento gestionale personale. Non sostituisce una consulenza fiscale professionale né una dichiarazione ufficiale.</p>
            </div>
          </div>
        )}

        {/* Registro Spese */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.6rem"}}>
          <h3 style={{margin:0,fontFamily:"'Playfair Display',serif",color:"#8a7a60",fontSize:"0.88rem"}}>Registro Spese</h3>
          <button onClick={()=>{if(realApts.length===0){alert("Nessun appartamento configurato. Aggiungine uno in Impostazioni.");return;}setEForm(emptyExpense);setEditId(null);setShowModal(true);}} style={btnP}>+ Spesa</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:"0.45rem"}}>
          {filteredExpenses.length===0&&<p style={{color:"#5a4a30",fontSize:"0.82rem"}}>Nessuna spesa.</p>}
          {filteredExpenses.map(e=>(
            <div key={e.id} style={{background:"#120f0a",border:`1px solid ${e.paid?"#2a3a20":"#2a2010"}`,borderRadius:"10px",padding:"0.75rem 0.85rem",display:"flex",alignItems:"center",gap:"0.7rem"}}>
              <div style={{width:"6px",height:"6px",borderRadius:"50%",background:aptColor(e.apt),flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:"0.4rem",flexWrap:"wrap"}}>
                  <span style={{color:"#e8d5b0",fontSize:"0.82rem",fontWeight:"500"}}>{e.category}</span>
                  {e.rate_group&&<span style={{fontSize:"0.6rem",color:"#6a5a40",background:"#1a1510",padding:"0.1rem 0.3rem",borderRadius:"3px",border:"1px solid #2a2010"}}>rata</span>}
                  <span onClick={()=>onToggleExpensePaid(e.id)} style={{fontSize:"0.62rem",padding:"0.1rem 0.4rem",borderRadius:"4px",border:`1px solid ${e.paid?"#6ec99a44":"#c9a96e44"}`,background:e.paid?"#1a2a1a":"#2a1a0a",color:e.paid?"#6ec99a":"#c9a96e",cursor:"pointer",marginLeft:"auto",userSelect:"none",flexShrink:0}}>
                    {e.paid?"✓ Pagata":"⏳ Da pagare"}
                  </span>
                </div>
                <div style={{color:"#6a5a40",fontSize:"0.67rem",marginTop:"0.1rem"}}>{aptLabel(e.apt)} · {formatDate(e.date)}{e.notes?` · ${e.notes}`:""}</div>
              </div>
              <div style={{color:"#c96e6e",fontFamily:"'Playfair Display',serif",fontSize:"0.95rem",fontWeight:"700",flexShrink:0}}>−€{e.amount}</div>
              <div style={{display:"flex",gap:"0.28rem",flexShrink:0}}>
                <button onClick={()=>openEdit(e)} style={{background:"#2a2010",border:"1px solid #3a3020",borderRadius:"6px",padding:"0.22rem 0.4rem",color:"#c9a96e",cursor:"pointer",fontSize:"0.65rem"}}>✏️</button>
                <button onClick={()=>onDeleteExpense(e.id)} style={{background:"#2a1010",border:"1px solid #3a1010",borderRadius:"6px",padding:"0.22rem 0.4rem",color:"#c96e6e",cursor:"pointer",fontSize:"0.65rem"}}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal Spesa */}
      {showModal&&(
        <Modal title={editId?"Modifica Spesa":"Nuova Spesa"} onClose={closeModal}>
          <Field label="Appartamento"><select value={eForm.apt} onChange={e=>setEForm({...eForm,apt:e.target.value})} style={iS}>{realApts.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.65rem"}}>
            <Field label="Categoria"><select value={eForm.category} onChange={e=>setEForm({...eForm,category:e.target.value})} style={iS}>
              {activeCatNames.map(c=><option key={c} value={c}>{c}</option>)}
              {!activeCatNames.includes(eForm.category)&&eForm.category&&<option value={eForm.category}>{eForm.category} (non attiva)</option>}
            </select></Field>
            <Field label="Data riferimento"><input type="date" value={eForm.date} onChange={e=>setEForm({...eForm,date:e.target.value})} style={iS}/></Field>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.65rem"}}>
            <Field label={eForm.paymentType==="Una tantum"?"Importo €":"Importo totale €"}><input type="number" value={eForm.amount} onChange={e=>setEForm({...eForm,amount:e.target.value})} style={iS} placeholder="0"/></Field>
            <Field label="Tipo pagamento"><select value={eForm.paymentType} onChange={e=>setEForm({...eForm,paymentType:e.target.value})} style={iS}>{PAYMENT_TYPES.map(r=><option key={r}>{r}</option>)}</select></Field>
          </div>
          {eForm.paymentType!=="Una tantum"&&Number(eForm.amount)>0&&(
            <div style={{padding:"0.45rem 0.7rem",background:"#0d0a07",borderRadius:"7px",border:"1px solid #2a2010",marginBottom:"0.5rem",fontSize:"0.72rem",color:"#8a7a60"}}>
              {eForm.paymentType==="Rata IMU (2 rate)"&&<>Crea 2 rate da <span style={{color:"#c9a96e"}}>€{Math.round(Number(eForm.amount)/2*100)/100}</span> · Scadenze: 16 Giu e 30 Nov</>}
              {eForm.paymentType==="Rata Condominio (5 rate)"&&<>Crea 5 rate da <span style={{color:"#c9a96e"}}>€{Math.round(Number(eForm.amount)/5*100)/100}</span> · Feb, Apr, Giu, Set, Nov</>}
              {eForm.paymentType==="Mensile"&&<>Crea 12 pagamenti da <span style={{color:"#c9a96e"}}>€{Number(eForm.amount)}</span> · Uno per ogni mese dell'anno</>}
            </div>
          )}
          <Field label="Note (opzionale)"><input value={eForm.notes} onChange={e=>setEForm({...eForm,notes:e.target.value})} style={iS} placeholder="Note aggiuntive..."/></Field>
          {editId&&(
            <div style={{display:"flex",alignItems:"center",gap:"0.65rem",marginBottom:"0.9rem",padding:"0.55rem 0.8rem",background:"#0d0a07",borderRadius:"8px",border:"1px solid #2a2010",cursor:"pointer"}} onClick={()=>setEForm({...eForm,paid:!eForm.paid})}>
              <span style={{fontSize:"1rem"}}>{eForm.paid?"✅":"⬜"}</span>
              <span style={{color:"#8a7a60",fontSize:"0.8rem",fontFamily:"'Playfair Display',serif"}}>Spesa già pagata</span>
            </div>
          )}
          <div style={{display:"flex",gap:"0.65rem",marginTop:"0.2rem"}}>
            <button onClick={closeModal} style={{...btnP,flex:1,background:"#2a2010",color:"#8a7a60"}}>Annulla</button>
            <button onClick={saveExpense} style={{...btnP,flex:1}}>Salva{eForm.paymentType!=="Una tantum"&&!editId?" (crea rate)":""}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
