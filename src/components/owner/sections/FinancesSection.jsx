import { useState } from "react";
import { CATEGORIES, PAYMENT_TYPES } from "../../../constants";
import { getPeriodBounds, getPeriodLabel, formatDate } from "../../../utils/dateUtils";
import { fmtEur, calcOperationalMetrics, calcFiscalMetrics, calcFinalMetrics } from "../../../utils/financeUtils";
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
  const [taxMode, setTaxMode] = useState(() => localStorage.getItem("gestaffitti_taxMode") || "21");
  const [customRate, setCustomRate] = useState(() => localStorage.getItem("gestaffitti_customRate") || "");
  function changeTaxMode(m) { setTaxMode(m); localStorage.setItem("gestaffitti_taxMode", m); }
  function changeCustomRate(v) { setCustomRate(v); localStorage.setItem("gestaffitti_customRate", v); }
  const [taxOverrides, setTaxOverrides] = useState(() => { try { return JSON.parse(localStorage.getItem("gestaffitti_taxOverrides") || "{}"); } catch { return {}; } });
  function toggleTaxOverride(id, defaultIncluded) {
    setTaxOverrides(prev => {
      const current = id in prev ? prev[id] : defaultIncluded;
      const next = { ...prev, [id]: !current };
      localStorage.setItem("gestaffitti_taxOverrides", JSON.stringify(next));
      return next;
    });
  }

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

  // ── Period filters ────────────────────────────────────────────────────────
  const [periodStart, periodEnd] = getPeriodBounds(finTab, finMonth, finQuarter, finYear);
  const periodBookings = filteredBookings.filter(b => b.checkin >= periodStart && b.checkin <= periodEnd);
  const periodExpenses = filteredExpenses.filter(e => e.date >= periodStart && e.date <= periodEnd);

  // ── Financial engine ──────────────────────────────────────────────────────
  const operational = calcOperationalMetrics(periodBookings, periodExpenses, categories);
  const fiscal      = calcFiscalMetrics(periodBookings, periodExpenses, { taxMode, customRate, taxOverrides }, categories);
  const final       = calcFinalMetrics(operational, fiscal, showTax);

  // ── UI aliases ────────────────────────────────────────────────────────────
  const grossRevenue     = operational.grossRevenue;
  const totalCommissions = operational.platformCommissions;
  const netRevenue       = operational.netRevenue;
  const fixedByCategory  = operational.fixedByCategory;
  const mgmtByCategory   = operational.variableByCategory;
  const taxIncludedRev   = fiscal.taxableRevenue;
  const taxExcludedRev   = fiscal.excludedRevenue;
  const effectiveRate    = fiscal.effectiveRate;
  const estimatedTax     = fiscal.estimatedTax;

  // ── Cash-flow metrics (all period expenses, incl. fiscal) ─────────────────
  const paidPeriodExp   = periodExpenses.filter(e => e.paid).reduce((s, e) => s + Number(e.amount), 0);
  const unpaidPeriodExp = periodExpenses.filter(e => !e.paid).reduce((s, e) => s + Number(e.amount), 0);

  // ── Tax UI helper ─────────────────────────────────────────────────────────
  const TAX_INCLUDED_PLATFORMS = ["Airbnb", "Booking"];
  const isBookingIncluded = (b) => b.id in taxOverrides ? taxOverrides[b.id] : TAX_INCLUDED_PLATFORMS.includes(b.platform);

  // ── Style helpers ─────────────────────────────────────────────────────────
  const row  = (border = true) => ({ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"0.28rem 0", ...(border ? { borderBottom:"1px solid #1a1510" } : {}) });
  const lbl  = (sub) => ({ color: sub ? "#6a5a40" : "#c9c0a8", fontSize: sub ? "0.72rem" : "0.8rem", paddingLeft: sub ? "0.85rem" : "0" });
  const amt  = (color) => ({ color: color || "#e8d5b0", fontFamily:"'Playfair Display',serif", fontSize:"0.8rem", fontWeight:"600" });
  const secH = { fontSize:"0.57rem", color:"#4a3a20", textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:"700", marginBottom:"0.22rem" };
  const card = { background:"#120f0a", border:"1px solid #2a2010", borderRadius:"12px", padding:"0.9rem", marginBottom:"0.6rem" };
  const subCard = { background:"#0d0a07", border:"1px solid #2a2010", borderRadius:"9px", padding:"0.6rem 0.75rem", marginBottom:"0.5rem" };

  return (
    <>
      <div>
        <h2 style={{fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"1.2rem",marginBottom:"0.9rem",marginTop:"0.4rem"}}>Finanze</h2>

        {/* ── Tab selector ─────────────────────────────────────────────── */}
        <div style={{display:"flex",gap:"0.25rem",marginBottom:"0.9rem",background:"#120f0a",borderRadius:"10px",padding:"0.22rem",border:"1px solid #2a2010"}}>
          {["mensile","trimestrale","annuale"].map(t=>(
            <button key={t} onClick={()=>setFinTab(t)} style={{flex:1,padding:"0.42rem 0.3rem",borderRadius:"7px",border:"none",cursor:"pointer",background:finTab===t?"#c9a96e":"transparent",color:finTab===t?"#0a0806":"#6a5a40",fontFamily:"'Playfair Display',serif",fontSize:"0.72rem",fontWeight:finTab===t?"700":"400",textTransform:"capitalize"}}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Period navigation ─────────────────────────────────────────── */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.9rem"}}>
          <button onClick={prevPeriod} style={{background:"#1a1612",border:"1px solid #3a3020",borderRadius:"10px",padding:"0.42rem 0.9rem",color:"#c9a96e",cursor:"pointer",fontSize:"1.1rem",lineHeight:1,fontWeight:"bold"}}>‹</button>
          <span style={{fontFamily:"'Playfair Display',serif",color:"#e8d5b0",fontSize:"1rem"}}>{getPeriodLabel(finTab,finMonth,finQuarter,finYear)}</span>
          <button onClick={nextPeriod} style={{background:"#1a1612",border:"1px solid #3a3020",borderRadius:"10px",padding:"0.42rem 0.9rem",color:"#c9a96e",cursor:"pointer",fontSize:"1.1rem",lineHeight:1,fontWeight:"bold"}}>›</button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            BLOCCO A — Conto Economico Operativo
        ══════════════════════════════════════════════════════════════════ */}
        <div style={card}>
          <div style={{display:"flex",alignItems:"center",gap:"0.4rem",marginBottom:"0.75rem"}}>
            <span style={{fontSize:"0.9rem"}}>💶</span>
            <h3 style={{margin:0,fontFamily:"'Playfair Display',serif",color:"#e8d5b0",fontSize:"0.88rem"}}>Conto Economico Operativo</h3>
            <span style={{fontSize:"0.62rem",color:"#4a3a20",marginLeft:"auto"}}>{periodBookings.length} prenotaz.</span>
          </div>

          {/* RICAVI */}
          <div style={{marginBottom:"0.55rem"}}>
            <div style={secH}>Ricavi</div>
            <div style={row()}>
              <span style={lbl(false)}>Incassi lordi</span>
              <span style={amt("#6ec99a")}>+€{fmtEur(grossRevenue)}</span>
            </div>
            {totalCommissions>0&&(
              <div style={row()}>
                <span style={lbl(true)}>Commissioni piattaforme</span>
                <span style={amt("#c96e6e")}>−€{fmtEur(totalCommissions)}</span>
              </div>
            )}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.3rem 0",borderBottom:"1px solid #2a2010"}}>
              <span style={{color:"#c9c0a8",fontSize:"0.8rem",fontWeight:"600"}}>Ricavi netti</span>
              <span style={{color:"#6ec99a",fontFamily:"'Playfair Display',serif",fontSize:"0.84rem",fontWeight:"700"}}>€{fmtEur(netRevenue)}</span>
            </div>
          </div>

          {/* COSTI VARIABILI */}
          <div style={{marginBottom:"0.55rem",marginTop:"0.45rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.22rem"}}>
              <div style={secH}>Costi Variabili</div>
              <span style={{fontSize:"0.7rem",color:"#c96e6e",fontFamily:"'Playfair Display',serif",fontWeight:"600"}}>−€{fmtEur(operational.variableTotal)}</span>
            </div>
            {mgmtByCategory.map(({cat,amt:a})=>(
              <div key={cat} style={row()}>
                <span style={lbl(true)}>{cat}</span>
                <span style={amt("#8a7a60")}>€{fmtEur(a)}</span>
              </div>
            ))}
            {mgmtByCategory.length===0&&<div style={{color:"#3a3020",fontSize:"0.67rem",padding:"0.12rem 0 0.12rem 0.85rem",fontStyle:"italic"}}>Nessuna nel periodo</div>}
          </div>

          {/* COSTI FISSI STRUTTURALI */}
          <div style={{marginBottom:"0.65rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.22rem"}}>
              <div style={secH}>Costi Fissi Strutturali</div>
              <span style={{fontSize:"0.7rem",color:"#c96e6e",fontFamily:"'Playfair Display',serif",fontWeight:"600"}}>−€{fmtEur(operational.fixedTotal)}</span>
            </div>
            {fixedByCategory.map(({cat,amt:a})=>(
              <div key={cat} style={row()}>
                <span style={lbl(true)}>{cat}</span>
                <span style={amt("#8a7a60")}>€{fmtEur(a)}</span>
              </div>
            ))}
            {fixedByCategory.length===0&&<div style={{color:"#3a3020",fontSize:"0.67rem",padding:"0.12rem 0 0.12rem 0.85rem",fontStyle:"italic"}}>Nessuna nel periodo</div>}
          </div>

          {/* MARGINE OPERATIVO */}
          <div style={{background:operational.operationalMargin>=0?"rgba(110,201,154,0.07)":"rgba(201,110,110,0.07)",border:`1px solid ${operational.operationalMargin>=0?"#6ec99a30":"#c96e6e30"}`,borderRadius:"8px",padding:"0.6rem 0.75rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:"0.57rem",color:"#6a5a40",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"0.06rem"}}>Margine Operativo</div>
              {netRevenue>0&&(
                <div style={{fontSize:"0.6rem",fontWeight:"600",color:operational.operationalMarginPct>=40?"#6ec99a":operational.operationalMarginPct>=20?"#c9a96e":"#c96e6e"}}>
                  {operational.operationalMarginPct}% sui ricavi netti
                </div>
              )}
            </div>
            <div style={{fontSize:"1.15rem",fontWeight:"700",fontFamily:"'Playfair Display',serif",color:operational.operationalMargin>=0?"#6ec99a":"#c96e6e"}}>
              {operational.operationalMargin>=0?"":"−"}€{fmtEur(Math.abs(operational.operationalMargin))}
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            BLOCCO B — Simulazione Fiscale (toggle collapsible)
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.6rem",padding:"0.55rem 0.8rem",background:"#120f0a",border:"1px solid #2a2010",borderRadius:"10px",cursor:"pointer"}} onClick={toggleTax}>
          <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
            <span style={{fontSize:"0.9rem"}}>🧾</span>
            <span style={{fontFamily:"'Playfair Display',serif",color:"#8a7a60",fontSize:"0.8rem"}}>Simulazione tasse</span>
          </div>
          <div style={{width:"36px",height:"20px",borderRadius:"10px",background:showTax?"#c9a96e":"#2a2010",border:`1px solid ${showTax?"#c9a96e":"#3a3020"}`,position:"relative",transition:"background 0.2s",flexShrink:0}}>
            <div style={{width:"14px",height:"14px",borderRadius:"50%",background:showTax?"#0a0806":"#5a4a30",position:"absolute",top:"2px",left:showTax?"19px":"3px",transition:"left 0.2s"}}/>
          </div>
        </div>

        {showTax&&(
          <div style={{background:"rgba(201,169,110,0.05)",border:"1px solid #c9a96e33",borderRadius:"12px",padding:"1rem",marginBottom:"0.9rem"}}>
            <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.8rem"}}>
              <span style={{fontSize:"1.1rem"}}>🧾</span>
              <h3 style={{margin:0,fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"0.95rem"}}>Simulazione fiscale</h3>
            </div>

            {/* Selettore aliquota — invariato */}
            <div style={{marginBottom:"0.7rem"}}>
              <div style={{fontSize:"0.65rem",color:"#6a5a40",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:"0.35rem"}}>Aliquota cedolare secca</div>
              <div style={{display:"flex",gap:"0.25rem",background:"#0d0a07",borderRadius:"8px",padding:"0.2rem",border:"1px solid #2a2010",marginBottom:taxMode==="custom"?"0.45rem":"0"}}>
                {["21","26","custom"].map(m=>(
                  <button key={m} onClick={()=>changeTaxMode(m)} style={{flex:1,padding:"0.38rem 0.3rem",borderRadius:"6px",border:"none",cursor:"pointer",background:taxMode===m?"#c9a96e":"transparent",color:taxMode===m?"#0a0806":"#6a5a40",fontFamily:"'Playfair Display',serif",fontSize:"0.72rem",fontWeight:taxMode===m?"700":"400"}}>
                    {m==="custom"?"Personalizzata":m+"%"}
                  </button>
                ))}
              </div>
              {taxMode==="custom"&&(
                <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                  <input type="number" min="0" max="100" step="0.1" value={customRate} onChange={e=>changeCustomRate(e.target.value)} style={{...iS,flex:1}} placeholder="Es. 23"/>
                  <span style={{color:"#6a5a40",fontSize:"0.8rem",flexShrink:0}}>%</span>
                </div>
              )}
            </div>

            {/* Lista prenotazioni con override — invariata */}
            <div style={{marginBottom:"0.7rem"}}>
              <div style={{fontSize:"0.65rem",color:"#6a5a40",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:"0.35rem"}}>Prenotazioni nel periodo</div>
              {periodBookings.length===0&&<div style={{fontSize:"0.72rem",color:"#4a3a20",fontStyle:"italic"}}>Nessuna prenotazione nel periodo.</div>}
              <div style={{display:"flex",flexDirection:"column",gap:"0.3rem"}}>
                {periodBookings.map(b=>{
                  const included=isBookingIncluded(b);
                  const overridden=b.id in taxOverrides;
                  const platformDefault=TAX_INCLUDED_PLATFORMS.includes(b.platform);
                  return(
                    <div key={b.id} style={{display:"flex",alignItems:"center",gap:"0.5rem",padding:"0.45rem 0.6rem",background:"#0d0a07",borderRadius:"7px",border:`1px solid ${included?"#c9a96e33":"#1a1510"}`}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:"#e8d5b0",fontSize:"0.78rem",fontWeight:"500",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.guest}</div>
                        <div style={{color:"#6a5a40",fontSize:"0.65rem"}}>{b.platform} · €{b.price}</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:"0.35rem",flexShrink:0}}>
                        {overridden&&<span style={{fontSize:"0.55rem",color:"#8a7a60",background:"#1a1510",padding:"0.08rem 0.3rem",borderRadius:"3px",border:"1px solid #2a2010"}}>modif.</span>}
                        <span style={{fontSize:"0.65rem",color:included?"#c9a96e":"#4a3a20",fontWeight:"600",minWidth:"44px",textAlign:"right"}}>{included?"Incluso":"Escluso"}</span>
                        <div onClick={()=>toggleTaxOverride(b.id,platformDefault)} style={{width:"32px",height:"18px",borderRadius:"9px",background:included?"#c9a96e22":"#1a1510",border:`1px solid ${included?"#c9a96e55":"#2a2010"}`,position:"relative",cursor:"pointer",flexShrink:0}}>
                          <div style={{width:"12px",height:"12px",borderRadius:"50%",background:included?"#c9a96e":"#3a3020",position:"absolute",top:"2px",left:included?"17px":"3px",transition:"left 0.15s"}}/>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cedolare secca — risultati */}
            <div style={subCard}>
              <div style={{...secH,marginBottom:"0.35rem"}}>Cedolare Secca</div>
              <div style={row()}>
                <span style={lbl(false)}>Incassi totali periodo</span>
                <span style={amt("#e8d5b0")}>€{fmtEur(grossRevenue)}</span>
              </div>
              <div style={row()}>
                <span style={lbl(true)}>di cui soggetti a cedolare</span>
                <span style={amt("#c9a96e")}>€{fmtEur(taxIncludedRev)}</span>
              </div>
              <div style={row()}>
                <span style={lbl(true)}>di cui esclusi</span>
                <span style={amt("#6a5a40")}>€{fmtEur(taxExcludedRev)}</span>
              </div>
              <div style={row()}>
                <span style={lbl(false)}>Imposta stimata ({effectiveRate}%)</span>
                <span style={amt("#c96e6e")}>−€{fmtEur(estimatedTax)}</span>
              </div>
              {fiscal.withheldTax>0&&(
                <div style={row()}>
                  <span style={{...lbl(true),display:"flex",alignItems:"center",gap:"0.3rem"}}>
                    Ritenuta già trattenuta
                    <span style={{fontSize:"0.54rem",color:"#6a5a40",background:"#1a1510",padding:"0.05rem 0.26rem",borderRadius:"3px",border:"1px solid #2a2010"}}>Airbnb</span>
                  </span>
                  <span style={amt("#8a7a60")}>−€{fmtEur(fiscal.withheldTax)}</span>
                </div>
              )}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.35rem 0",marginTop:"0.08rem",borderTop:"1px solid #3a3020"}}>
                <span style={{color:"#c9c0a8",fontSize:"0.8rem",fontWeight:"600",fontFamily:"'Playfair Display',serif"}}>Residuo da versare</span>
                <span style={{color:fiscal.taxDueEstimate>0?"#c96e6e":"#6ec99a",fontSize:"0.9rem",fontWeight:"700",fontFamily:"'Playfair Display',serif"}}>
                  {fiscal.taxDueEstimate>0?"−":""}€{fmtEur(fiscal.taxDueEstimate)}
                </span>
              </div>
            </div>

            {/* Imposte patrimoniali — IMU / TARI */}
            {fiscal.fiscalExpensesTotal>0&&(
              <div style={subCard}>
                <div style={{...secH,marginBottom:"0.35rem"}}>Imposte Patrimoniali</div>
                {fiscal.fiscalExpensesByCategory.map(({cat,amt:a})=>(
                  <div key={cat} style={row()}>
                    <span style={lbl(false)}>{cat}</span>
                    <span style={amt("#c96e6e")}>−€{fmtEur(a)}</span>
                  </div>
                ))}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.35rem 0",marginTop:"0.08rem",borderTop:"1px solid #3a3020"}}>
                  <span style={{color:"#c9c0a8",fontSize:"0.8rem",fontWeight:"600",fontFamily:"'Playfair Display',serif"}}>Totale patrimoniali</span>
                  <span style={{color:"#c96e6e",fontSize:"0.88rem",fontWeight:"700",fontFamily:"'Playfair Display',serif"}}>−€{fmtEur(fiscal.fiscalExpensesTotal)}</span>
                </div>
                <div style={{display:"flex",gap:"1rem",marginTop:"0.22rem",paddingTop:"0.22rem",borderTop:"1px solid #1a1510"}}>
                  {fiscal.fiscalExpensesPaid>0&&<span style={{fontSize:"0.62rem",color:"#6ec99a"}}>✓ Pagate: €{fmtEur(fiscal.fiscalExpensesPaid)}</span>}
                  {fiscal.fiscalExpensesUnpaid>0&&<span style={{fontSize:"0.62rem",color:"#c9a96e"}}>⏳ Da pagare: €{fmtEur(fiscal.fiscalExpensesUnpaid)}</span>}
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div style={{background:"#0d0a07",border:"1px solid #2a2010",borderRadius:"8px",padding:"0.6rem 0.75rem"}}>
              <p style={{color:"#4a3a20",fontSize:"0.65rem",margin:0,lineHeight:1.6,fontStyle:"italic"}}>⚠ Questa simulazione è uno strumento gestionale personale. Non sostituisce una consulenza fiscale professionale né una dichiarazione ufficiale.</p>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            BLOCCO C — Risultato Finale
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{...card,marginBottom:"0.9rem"}}>
          <div style={{display:"flex",alignItems:"center",gap:"0.4rem",marginBottom:"0.75rem"}}>
            <span style={{fontSize:"0.9rem"}}>📊</span>
            <h3 style={{margin:0,fontFamily:"'Playfair Display',serif",color:"#e8d5b0",fontSize:"0.88rem"}}>Risultato Finale</h3>
          </div>

          <div style={row()}>
            <span style={lbl(false)}>Margine operativo</span>
            <span style={amt(operational.operationalMargin>=0?"#6ec99a":"#c96e6e")}>
              {operational.operationalMargin>=0?"":"−"}€{fmtEur(Math.abs(operational.operationalMargin))}
            </span>
          </div>
          {showTax&&fiscal.taxDueEstimate>0&&(
            <div style={row()}>
              <span style={lbl(true)}>Residuo cedolare ({effectiveRate}%)</span>
              <span style={amt("#c96e6e")}>−€{fmtEur(fiscal.taxDueEstimate)}</span>
            </div>
          )}
          {showTax&&final.fiscalCosts>0&&(
            <div style={row()}>
              <span style={lbl(true)}>IMU + TARI</span>
              <span style={amt("#c96e6e")}>−€{fmtEur(final.fiscalCosts)}</span>
            </div>
          )}

          {/* Bottom line */}
          <div style={{background:final.finalNet>=0?"rgba(110,201,154,0.07)":"rgba(201,110,110,0.07)",border:`1px solid ${final.finalNet>=0?"#6ec99a30":"#c96e6e30"}`,borderRadius:"8px",padding:"0.6rem 0.75rem",marginTop:"0.4rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:"0.57rem",color:"#6a5a40",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"0.06rem"}}>
                {showTax?"Utile Netto Stimato":"Margine Operativo"}
              </div>
              <div style={{fontSize:"0.58rem",color:"#4a3a20"}}>
                {showTax?"dopo tasse e costi fiscali":"al lordo di tasse e fiscali"}
              </div>
            </div>
            <div style={{fontSize:"1.2rem",fontWeight:"700",fontFamily:"'Playfair Display',serif",color:final.finalNet>=0?"#6ec99a":"#c96e6e"}}>
              {final.finalNet>=0?"":"−"}€{fmtEur(Math.abs(final.finalNet))}
            </div>
          </div>

          {/* Strip liquidità */}
          {(paidPeriodExp>0||unpaidPeriodExp>0)&&(
            <div style={{display:"flex",gap:"1.2rem",justifyContent:"center",marginTop:"0.65rem",paddingTop:"0.5rem",borderTop:"1px solid #1a1510"}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:"0.57rem",color:"#4a3a20",marginBottom:"0.1rem",textTransform:"uppercase",letterSpacing:"0.07em"}}>Spese Pagate</div>
                <div style={{fontSize:"0.85rem",color:"#6ec99a",fontWeight:"600",fontFamily:"'Playfair Display',serif"}}>€{fmtEur(paidPeriodExp)}</div>
              </div>
              <div style={{width:"1px",background:"#2a2010"}}/>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:"0.57rem",color:"#4a3a20",marginBottom:"0.1rem",textTransform:"uppercase",letterSpacing:"0.07em"}}>Da Pagare</div>
                <div style={{fontSize:"0.85rem",color:"#c9a96e",fontWeight:"600",fontFamily:"'Playfair Display',serif"}}>€{fmtEur(unpaidPeriodExp)}</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Registro Spese — invariato ────────────────────────────────── */}
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

      {/* ── Modal Spesa — invariato ───────────────────────────────────────── */}
      {showModal&&(
        <Modal title={editId?"Modifica Spesa":"Nuova Spesa"} onClose={closeModal}>
          <Field label="Appartamento"><select value={eForm.apt} onChange={e=>setEForm({...eForm,apt:e.target.value})} style={iS}><option value="property">🏛 Immobile / Comune</option>{realApts.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>
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
