import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import {
  APT_ALL, COLOR_PALETTE, PLATFORMS, COMMISSIONS,
  CATEGORIES, FIXED_CATS, MGMT_CATS, PAYMENT_TYPES,
  MONTHS, MONTHS_LONG,
} from "./constants";
import { formatDate, nightCount, getPeriodBounds, getPeriodLabel } from "./utils/dateUtils";
import { expInPeriod, fmtEur } from "./utils/financeUtils";
import { dbToBooking, bookingToDb } from "./utils/bookingUtils";
import LoadingScreen from "./components/LoadingScreen";
import LoginScreen from "./components/LoginScreen";
import Modal from "./components/shared/Modal";
import Field, { iS, btnP } from "./components/shared/Field";
import DayPopup from "./components/shared/DayPopup";

// ────────────────────────────────────────────
//  CLEANER VIEW
// ────────────────────────────────────────────
function CleanerView({ bookings, onToggleCleaning, onLogout, apartments }) {
  const aptColor = (id) => apartments.find(a=>a.id===id)?.color||"#c9a96e";
  const aptLabel = (id) => apartments.find(a=>a.id===id)?.label||id;
  const today = new Date().toISOString().split("T")[0];
  const tomorrow = new Date(Date.now()+86400000).toISOString().split("T")[0];
  const in3days = new Date(Date.now()+86400000*3).toISOString().split("T")[0];
  const [aptFilter, setAptFilter] = useState("all");
  const relevant = bookings.filter(b=>aptFilter==="all"||b.apt===aptFilter).sort((a,b)=>a.checkout>b.checkout?1:-1);
  const urgenti = relevant.filter(b=>!b.cleaning&&b.checkout<=today);
  const prossimi = relevant.filter(b=>!b.cleaning&&b.checkout>today&&b.checkout<=in3days);
  const futuri = relevant.filter(b=>!b.cleaning&&b.checkout>in3days);
  const completati = relevant.filter(b=>b.cleaning);

  function Section({title,items,color,icon,emptyMsg}) {
    if(items.length===0&&emptyMsg===false) return null;
    return (
      <div style={{marginBottom:"1.2rem"}}>
        <div style={{display:"flex",alignItems:"center",gap:"0.5rem",marginBottom:"0.6rem"}}>
          <span style={{fontSize:"1rem"}}>{icon}</span>
          <h3 style={{margin:0,fontFamily:"'Playfair Display',serif",color,fontSize:"0.9rem"}}>{title}</h3>
          <span style={{background:`${color}22`,color,fontSize:"0.65rem",padding:"0.1rem 0.4rem",borderRadius:"10px",border:`1px solid ${color}44`}}>{items.length}</span>
        </div>
        {items.length===0?(emptyMsg?<p style={{color:"#4a3a20",fontSize:"0.8rem",margin:"0 0 0 1.5rem",fontStyle:"italic"}}>{emptyMsg}</p>:null):items.map(b=>(
          <div key={b.id} style={{background:"#120f0a",border:`1px solid ${b.cleaning?"#2a3a2a":"#2a2010"}`,borderRadius:"12px",padding:"0.9rem 1rem",marginBottom:"0.5rem",borderLeft:`3px solid ${aptColor(b.apt)}`}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"0.5rem"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:"0.4rem",marginBottom:"0.3rem"}}>
                  <span style={{background:`${aptColor(b.apt)}22`,color:aptColor(b.apt),fontSize:"0.65rem",padding:"0.12rem 0.45rem",borderRadius:"6px",border:`1px solid ${aptColor(b.apt)}44`,fontWeight:"600"}}>🏠 {aptLabel(b.apt)}</span>
                  {b.checkout===today&&<span style={{background:"#c96e6e22",color:"#c96e6e",fontSize:"0.62rem",padding:"0.1rem 0.35rem",borderRadius:"6px",border:"1px solid #c96e6e44"}}>OGGI</span>}
                  {b.checkout===tomorrow&&<span style={{background:"#c9a96e22",color:"#c9a96e",fontSize:"0.62rem",padding:"0.1rem 0.35rem",borderRadius:"6px",border:"1px solid #c9a96e44"}}>DOMANI</span>}
                </div>
                <div style={{color:"#e8d5b0",fontSize:"0.88rem",fontWeight:"600",marginBottom:"0.15rem"}}>Check-out: {formatDate(b.checkout)}</div>
                <div style={{color:"#5a4a30",fontSize:"0.7rem",marginTop:"0.1rem"}}>{nightCount(b.checkin,b.checkout)} notti di soggiorno</div>
              </div>
              <button onClick={()=>onToggleCleaning(b.id)} style={{flexShrink:0,display:"flex",flexDirection:"column",alignItems:"center",gap:"0.2rem",padding:"0.7rem 0.8rem",borderRadius:"10px",border:`1px solid ${b.cleaning?"#6ec99a55":"#3a3020"}`,cursor:"pointer",fontFamily:"Georgia,serif",fontSize:"0.65rem",background:b.cleaning?"#1a2a1a":"#1a1612",color:b.cleaning?"#6ec99a":"#8a7a60",minWidth:"60px"}}>
                <span style={{fontSize:"1.4rem"}}>{b.cleaning?"✅":"⬜"}</span>
                <span>{b.cleaning?"Fatto":"Da fare"}</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{minHeight:"100vh",background:"#0a0806",fontFamily:"Georgia,serif",color:"#e8d5b0"}}>
      <header style={{borderBottom:"1px solid #2a2010",padding:"0.75rem 1rem",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(15,12,8,0.97)",position:"sticky",top:0,zIndex:100}}>
        <div style={{display:"flex",alignItems:"center",gap:"0.6rem"}}>
          <span style={{fontSize:"1.3rem"}}>🧹</span>
          <div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:"1rem",color:"#6e9ec9",letterSpacing:"0.04em"}}>Pulizie</div>
            <div style={{fontSize:"0.58rem",color:"#6a5a40",letterSpacing:"0.1em",textTransform:"uppercase"}}>Vista addetta</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"0.6rem"}}>
          <div style={{display:"flex",gap:"0.22rem",background:"#120f0a",borderRadius:"9px",padding:"0.2rem",border:"1px solid #2a2010"}}>
            {apartments.map(a=>(
              <button key={a.id} onClick={()=>setAptFilter(a.id)} style={{padding:"0.28rem 0.5rem",borderRadius:"6px",border:"none",cursor:"pointer",fontSize:"0.65rem",fontFamily:"'Playfair Display',serif",background:aptFilter===a.id?a.color:"transparent",color:aptFilter===a.id?"#0a0806":"#8a7a60",fontWeight:aptFilter===a.id?"700":"400"}}>{a.label}</button>
            ))}
          </div>
          <button onClick={onLogout} style={{background:"#2a2010",border:"1px solid #3a3020",borderRadius:"8px",padding:"0.4rem 0.7rem",color:"#8a7a60",cursor:"pointer",fontSize:"0.72rem",fontFamily:"Georgia,serif"}}>Esci</button>
        </div>
      </header>
      <main style={{padding:"1rem",maxWidth:"600px",margin:"0 auto",paddingBottom:"2rem"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"0.5rem",marginBottom:"1.2rem",marginTop:"0.5rem"}}>
          {[{label:"Da fare",val:urgenti.length+prossimi.length+futuri.length,color:"#c96e6e"},{label:"Urgenti",val:urgenti.length,color:"#c9a96e"},{label:"Completati",val:completati.length,color:"#6ec99a"}].map(k=>(
            <div key={k.label} style={{background:"#120f0a",border:"1px solid #2a2010",borderRadius:"10px",padding:"0.7rem",textAlign:"center"}}>
              <div style={{fontSize:"1.4rem",fontWeight:"700",color:k.color,fontFamily:"'Playfair Display',serif"}}>{k.val}</div>
              <div style={{fontSize:"0.6rem",color:"#6a5a40",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:"0.1rem"}}>{k.label}</div>
            </div>
          ))}
        </div>
        <Section title="Urgenti — pulizie in ritardo" items={urgenti} color="#c96e6e" icon="🚨" emptyMsg="Nessuna pulizia in ritardo 👍"/>
        <Section title="Prossimi 3 giorni" items={prossimi} color="#c9a96e" icon="⚡" emptyMsg="Nessun cambio imminente"/>
        <Section title="Prossimamente" items={futuri} color="#6a5a40" icon="📅" emptyMsg={false}/>
        <Section title="Completati" items={completati} color="#6ec99a" icon="✅" emptyMsg="Nessuna pulizia completata"/>
      </main>
    </div>
  );
}

// ────────────────────────────────────────────
//  OWNER VIEW
// ────────────────────────────────────────────
function OwnerView({user,bookings,expenses,onAddBooking,onUpdateBooking,onDeleteBooking,onToggleCleaning,onToggleCheckin,onToggleDeposit,onAddExpense,onUpdateExpense,onDeleteExpense,onToggleExpensePaid,onLogout,apartments,onAddApartment,onUpdateApartment,onDeleteApartment}) {
  const aptColor=(id)=>apartments.find(a=>a.id===id)?.color||"#c9a96e";
  const aptLabel=(id)=>apartments.find(a=>a.id===id)?.label||id;
  const realApts=apartments.filter(a=>a.id!=="all");

  const [activeFilter,setActiveFilter]=useState("all");
  const [section,setSection]=useState("dashboard");
  const [modal,setModal]=useState(null);
  const [editItem,setEditItem]=useState(null);
  const [dayPopup,setDayPopup]=useState(null);
  const [aptModal,setAptModal]=useState(null);
  const [aptForm,setAptForm]=useState({id:"",label:"",color:COLOR_PALETTE[0]});

  // Finances tab state
  const now=new Date();
  const [finTab,setFinTab]=useState("mensile");
  const [finMonth,setFinMonth]=useState(now.getMonth());
  const [finQuarter,setFinQuarter]=useState(Math.floor(now.getMonth()/3));
  const [finYear,setFinYear]=useState(now.getFullYear());

  const [calYear,setCalYear]=useState(now.getFullYear());
  const [calMonth,setCalMonth]=useState(now.getMonth());
  function prevMonth(){if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);}
  function nextMonth(){if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);}

  function prevPeriod(){
    if(finTab==="mensile"){if(finMonth===0){setFinMonth(11);setFinYear(y=>y-1);}else setFinMonth(m=>m-1);}
    else if(finTab==="trimestrale"){if(finQuarter===0){setFinQuarter(3);setFinYear(y=>y-1);}else setFinQuarter(q=>q-1);}
    else setFinYear(y=>y-1);
  }
  function nextPeriod(){
    if(finTab==="mensile"){if(finMonth===11){setFinMonth(0);setFinYear(y=>y+1);}else setFinMonth(m=>m+1);}
    else if(finTab==="trimestrale"){if(finQuarter===3){setFinQuarter(0);setFinYear(y=>y+1);}else setFinQuarter(q=>q+1);}
    else setFinYear(y=>y+1);
  }

  const emptyBooking={apt:realApts[0]?.id||"apt1",guest:"",email:"",phone:"",checkin:"",checkout:"",price:"",deposit:"",depositPaid:false,platform:"Airbnb",notes:"",cleaning:false,checkinDone:false};
  const emptyExpense={apt:realApts[0]?.id||"apt1",date:"",category:CATEGORIES[0],notes:"",amount:"",paymentType:"Una tantum",paid:false};
  const [bForm,setBForm]=useState(emptyBooking);
  const [eForm,setEForm]=useState(emptyExpense);

  const filtered=(arr)=>activeFilter==="all"?arr:arr.filter(x=>x.apt===activeFilter);
  const filteredBookings=filtered(bookings).sort((a,b)=>a.checkin>b.checkin?1:-1);
  const filteredExpenses=filtered(expenses).sort((a,b)=>a.date>b.date?-1:1);

  const totalRevenue=filtered(bookings).reduce((s,b)=>s+Number(b.price),0);
  const totalExpAmt=filtered(expenses).reduce((s,e)=>s+Number(e.amount),0);
  const netProfit=totalRevenue-totalExpAmt;
  const pendingDeposits=filtered(bookings).filter(b=>!b.depositPaid);

  const today=new Date().toISOString().split("T")[0];
  const upcoming=filtered(bookings).filter(b=>b.checkin>=today).sort((a,b)=>a.checkin>b.checkin?1:-1).slice(0,3);
  const pendingCleaning=filtered(bookings).filter(b=>!b.cleaning&&b.checkout<=today);
  const pendingCheckin=filtered(bookings).filter(b=>!b.checkinDone&&b.checkin>=today&&b.checkin<=new Date(Date.now()+86400000*3).toISOString().split("T")[0]);

  // Finance period calculations
  const [periodStart,periodEnd]=getPeriodBounds(finTab,finMonth,finQuarter,finYear);
  const periodBookings=filtered(bookings).filter(b=>b.checkin>=periodStart&&b.checkin<=periodEnd);
  const grossRevenue=periodBookings.reduce((s,b)=>s+Number(b.price),0);
  const totalCommissions=periodBookings.reduce((s,b)=>s+Number(b.price)*(COMMISSIONS[b.platform]||0)/100,0);
  const netRevenue=grossRevenue-totalCommissions;
  const periodExpenses=filtered(expenses).filter(e=>e.date>=periodStart&&e.date<=periodEnd);
  const fixedExps=periodExpenses.filter(e=>FIXED_CATS.includes(e.category));
  const mgmtExps=periodExpenses.filter(e=>MGMT_CATS.includes(e.category));
  const fixedTotal=fixedExps.reduce((s,e)=>s+Number(e.amount),0);
  const mgmtTotal=mgmtExps.reduce((s,e)=>s+Number(e.amount),0);
  const totalPeriodExp=fixedTotal+mgmtTotal;
  const paidPeriodExp=periodExpenses.filter(e=>e.paid).reduce((s,e)=>s+Number(e.amount),0);
  const unpaidPeriodExp=periodExpenses.filter(e=>!e.paid).reduce((s,e)=>s+Number(e.amount),0);
  const nettoReale=netRevenue-paidPeriodExp;
  const nettoPrevisto=netRevenue-totalPeriodExp;
  const fixedByCategory=FIXED_CATS.map(cat=>({cat,amt:fixedExps.filter(e=>e.category===cat).reduce((s,e)=>s+Number(e.amount),0)})).filter(x=>x.amt>0);
  const mgmtByCategory=MGMT_CATS.map(cat=>({cat,amt:mgmtExps.filter(e=>e.category===cat).reduce((s,e)=>s+Number(e.amount),0)})).filter(x=>x.amt>0);

  // Commission info for booking form
  const commPct=COMMISSIONS[bForm.platform]||0;
  const commAmt=bForm.price?Math.round(Number(bForm.price)*commPct/100):0;
  const nettoRicevuto=bForm.price?Math.round(Number(bForm.price)*(1-commPct/100)):0;

  async function saveBooking(){
    if(!bForm.guest||!bForm.checkin||!bForm.checkout) return;
    const data={...bForm,price:Number(bForm.price),deposit:Number(bForm.deposit)||0};
    if(editItem) await onUpdateBooking(editItem,data);
    else await onAddBooking(data);
    setModal(null);setEditItem(null);setBForm(emptyBooking);
  }
  async function saveExpense(){
    console.log("[saveExpense] eForm:", eForm);
    if(!eForm.date){alert("Inserisci la data");return;}
    if(!eForm.amount||Number(eForm.amount)<=0){alert("Inserisci un importo valido");return;}
    if(editItem) await onUpdateExpense(editItem,eForm);
    else await onAddExpense(eForm);
    setModal(null);setEditItem(null);setEForm(emptyExpense);
  }
  const openEditB=(b)=>{setBForm({...b});setEditItem(b.id);setModal("booking");};
  const openEditE=(e)=>{setEForm({...e,paymentType:"Una tantum",notes:e.notes||""});setEditItem(e.id);setModal("expense");};

  function openAddApt(){setAptForm({id:`apt_${Date.now()}`,label:"",color:COLOR_PALETTE[0]});setAptModal("add");}
  function openEditApt(apt){setAptForm({...apt});setAptModal("edit");}
  function saveApt(){
    if(!aptForm.label.trim()) return;
    if(aptModal==="add") onAddApartment({...aptForm,label:aptForm.label.trim()});
    else onUpdateApartment({...aptForm,label:aptForm.label.trim()});
    setAptModal(null);
  }
  function deleteApt(id){
    if(bookings.some(b=>b.apt===id)){alert("Impossibile eliminare: ci sono prenotazioni associate.");return;}
    onDeleteApartment(id);
  }

  const daysInMonth=new Date(calYear,calMonth+1,0).getDate();
  const firstDay=((new Date(calYear,calMonth,1).getDay())+6)%7;
  function getBookingsForDay(day){const d=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;return filtered(bookings).filter(b=>b.checkin<=d&&b.checkout>d);}
  function openDayPopup(day){const d=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;setDayPopup({dateStr:d,bookings:filtered(bookings).filter(b=>b.checkin<=d&&b.checkout>d)});}
  function getDayRole(b,day){const d=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;if(b.checkin===d)return"checkin";if(b.checkout===d)return"checkout";return"stay";}

  const byMonth=Array.from({length:12},(_,i)=>{
    const m=String(i+1).padStart(2,"0");
    const rev=filtered(bookings).filter(b=>b.checkin.startsWith(`${calYear}-${m}`)).reduce((s,b)=>s+Number(b.price),0);
    const exp=filtered(expenses).filter(e=>e.date.startsWith(`${calYear}-${m}`)).reduce((s,e)=>s+Number(e.amount),0);
    return{month:MONTHS[i],rev,exp};
  });
  const maxBar=Math.max(...byMonth.map(d=>Math.max(d.rev,d.exp)),1);

  const rowStyle=(pad=true)=>({display:"flex",justifyContent:"space-between",alignItems:"center",padding:pad?"0.3rem 0":"0",borderBottom:"1px solid #1a1510"});
  const labelStyle=(sub)=>({color:sub?"#6a5a40":"#c9c0a8",fontSize:sub?"0.72rem":"0.82rem",paddingLeft:sub?"0.9rem":"0"});
  const amtStyle=(color)=>({color:color||"#e8d5b0",fontFamily:"'Playfair Display',serif",fontSize:"0.82rem",fontWeight:"600"});

  return (
    <div style={{minHeight:"100vh",background:"#0a0806",fontFamily:"Georgia,serif",color:"#e8d5b0"}}>
      <header style={{borderBottom:"1px solid #2a2010",padding:"0.75rem 1rem",display:"flex",alignItems:"center",justifyContent:"space-between",background:"rgba(15,12,8,0.97)",position:"sticky",top:0,zIndex:200}}>
        <div style={{display:"flex",alignItems:"center",gap:"0.6rem"}}>
          <span style={{fontSize:"1.3rem"}}>🏠</span>
          <div>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:"1.05rem",color:"#c9a96e",letterSpacing:"0.04em",lineHeight:1.1}}>GestAffitti</div>
            <div style={{display:"flex",alignItems:"center",gap:"0.35rem"}}>
              <span style={{fontSize:"0.55rem",color:"#6a5a40",letterSpacing:"0.1em",textTransform:"uppercase"}}>Proprietario</span>
              <span style={{fontSize:"0.7rem"}}>👑</span>
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:"0.4rem"}}>
          <div style={{display:"flex",gap:"0.22rem",background:"#120f0a",borderRadius:"9px",padding:"0.2rem",border:"1px solid #2a2010"}}>
            {apartments.map(a=>(
              <button key={a.id} onClick={()=>setActiveFilter(a.id)} style={{padding:"0.3rem 0.55rem",borderRadius:"6px",border:"none",cursor:"pointer",fontSize:"0.65rem",fontFamily:"'Playfair Display',serif",background:activeFilter===a.id?a.color:"transparent",color:activeFilter===a.id?"#0a0806":"#8a7a60",fontWeight:activeFilter===a.id?"700":"400"}}>{a.label}</button>
            ))}
          </div>
          <button onClick={onLogout} style={{background:"#2a2010",border:"1px solid #3a3020",borderRadius:"8px",padding:"0.38rem 0.6rem",color:"#8a7a60",cursor:"pointer",fontSize:"0.7rem",whiteSpace:"nowrap"}}>Esci</button>
        </div>
      </header>

      <nav style={{display:"flex",borderBottom:"1px solid #2a2010",background:"#0d0a07",overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none"}}>
        {[{id:"dashboard",icon:"📊",label:"Home"},{id:"bookings",icon:"📅",label:"Prenot."},{id:"calendar",icon:"🗓",label:"Cal."},{id:"finances",icon:"💰",label:"Finanze"},{id:"guests",icon:"👤",label:"Ospiti"},{id:"operations",icon:"🧹",label:"Operaz."},{id:"settings",icon:"⚙️",label:"Impost."}].map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)} style={{padding:"0.65rem 0.85rem",border:"none",background:"none",cursor:"pointer",color:section===s.id?"#c9a96e":"#5a4a30",borderBottom:section===s.id?"2px solid #c9a96e":"2px solid transparent",fontFamily:"'Playfair Display',serif",fontSize:"0.7rem",whiteSpace:"nowrap",display:"flex",flexDirection:"column",alignItems:"center",gap:"0.15rem",flexShrink:0}}>
            <span style={{fontSize:"0.9rem"}}>{s.icon}</span><span>{s.label}</span>
          </button>
        ))}
      </nav>

      <main style={{padding:"0.9rem",maxWidth:"900px",margin:"0 auto",paddingBottom:"2.5rem"}}>

        {/* Banner nessun appartamento */}
        {realApts.length===0&&(
          <div style={{background:"rgba(201,169,110,0.08)",border:"1px solid #c9a96e44",borderRadius:"10px",padding:"0.9rem 1rem",marginBottom:"1rem",display:"flex",alignItems:"center",gap:"0.7rem"}}>
            <span style={{fontSize:"1.2rem"}}>🏠</span>
            <div>
              <div style={{color:"#c9a96e",fontWeight:"600",fontSize:"0.85rem",marginBottom:"0.1rem"}}>Nessun appartamento configurato</div>
              <div style={{color:"#6a5a40",fontSize:"0.72rem"}}>Vai in <strong style={{color:"#c9a96e"}}>Impostazioni</strong> per aggiungere il primo appartamento.</div>
            </div>
          </div>
        )}

        {/* DASHBOARD */}
        {section==="dashboard"&&(
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"1.2rem",marginBottom:"0.9rem",marginTop:"0.4rem"}}>{activeFilter!=="all"?aptLabel(activeFilter):"Panoramica Generale"}</h2>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"0.6rem",marginBottom:"1rem"}}>
              {[{label:"Entrate",value:`€${totalRevenue.toLocaleString("it")}`,icon:"💶",color:"#6ec99a"},{label:"Spese",value:`€${totalExpAmt.toLocaleString("it")}`,icon:"📤",color:"#c96e6e"},{label:"Utile Netto",value:`€${netProfit.toLocaleString("it")}`,icon:"📈",color:netProfit>=0?"#c9a96e":"#c96e6e"},{label:"Prenotazioni",value:filtered(bookings).length,icon:"🔑",color:"#9e6ec9"}].map(k=>(
                <div key={k.label} style={{background:"#120f0a",border:"1px solid #2a2010",borderRadius:"12px",padding:"0.9rem",textAlign:"center"}}>
                  <div style={{fontSize:"1.3rem",marginBottom:"0.25rem"}}>{k.icon}</div>
                  <div style={{fontSize:"1.2rem",fontWeight:"700",color:k.color,fontFamily:"'Playfair Display',serif"}}>{k.value}</div>
                  <div style={{fontSize:"0.62rem",color:"#6a5a40",letterSpacing:"0.06em",textTransform:"uppercase",marginTop:"0.2rem"}}>{k.label}</div>
                </div>
              ))}
            </div>
            {pendingDeposits.length>0&&(
              <div style={{background:"rgba(201,169,110,0.08)",border:"1px solid #c9a96e44",borderRadius:"10px",padding:"0.8rem",marginBottom:"0.9rem"}}>
                <div style={{color:"#c9a96e",fontSize:"0.8rem",fontWeight:"600",marginBottom:"0.5rem"}}>💳 Caparre in attesa ({pendingDeposits.length})</div>
                {pendingDeposits.map(b=>(
                  <div key={b.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.3rem 0",borderTop:"1px solid #2a2010"}}>
                    <span style={{color:"#e8d5b0",fontSize:"0.8rem"}}>{b.guest}</span>
                    <div style={{display:"flex",alignItems:"center",gap:"0.5rem"}}>
                      <span style={{color:"#c9a96e",fontSize:"0.8rem"}}>€{b.deposit}</span>
                      <button onClick={()=>onToggleDeposit(b.id)} style={{background:"#2a2010",border:"1px solid #3a3020",borderRadius:"6px",padding:"0.2rem 0.45rem",color:"#6ec99a",cursor:"pointer",fontSize:"0.68rem"}}>✓ Ricevuta</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(pendingCleaning.length>0||pendingCheckin.length>0)&&(
              <div style={{display:"flex",flexDirection:"column",gap:"0.45rem",marginBottom:"0.9rem"}}>
                {pendingCleaning.length>0&&<div style={{background:"rgba(201,110,110,0.1)",border:"1px solid #c96e6e44",borderRadius:"10px",padding:"0.7rem 0.8rem",display:"flex",alignItems:"center",gap:"0.6rem"}}><span>🧹</span><span style={{color:"#c96e6e",fontSize:"0.78rem"}}><b>{pendingCleaning.length}</b> pulizie post check-out in attesa</span></div>}
                {pendingCheckin.length>0&&<div style={{background:"rgba(110,160,201,0.1)",border:"1px solid #6ea0c944",borderRadius:"10px",padding:"0.7rem 0.8rem",display:"flex",alignItems:"center",gap:"0.6rem"}}><span>🔑</span><span style={{color:"#6ea0c9",fontSize:"0.78rem"}}><b>{pendingCheckin.length} check-in</b> nei prossimi 3 giorni</span></div>}
              </div>
            )}
            <div style={{background:"#120f0a",border:"1px solid #2a2010",borderRadius:"12px",padding:"0.9rem",marginBottom:"0.9rem"}}>
              <h3 style={{margin:"0 0 0.7rem",fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"0.9rem"}}>Prossimi Arrivi</h3>
              {upcoming.length===0?<p style={{color:"#5a4a30",fontSize:"0.8rem",margin:0}}>Nessun arrivo imminente</p>:upcoming.map(b=>(
                <div key={b.id} style={{display:"flex",alignItems:"center",gap:"0.7rem",padding:"0.5rem 0",borderBottom:"1px solid #1e1a12"}}>
                  <div style={{width:"7px",height:"7px",borderRadius:"50%",background:aptColor(b.apt),flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:"#e8d5b0",fontSize:"0.85rem",fontWeight:"500",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.guest}</div>
                    <div style={{color:"#6a5a40",fontSize:"0.7rem"}}>{aptLabel(b.apt)} · {b.platform}</div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0}}>
                    <div style={{color:"#c9a96e",fontSize:"0.8rem"}}>{formatDate(b.checkin)}</div>
                    <div style={{color:"#5a4a30",fontSize:"0.65rem"}}>{nightCount(b.checkin,b.checkout)}n · €{b.price}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{background:"#120f0a",border:"1px solid #2a2010",borderRadius:"12px",padding:"0.9rem"}}>
              <h3 style={{margin:"0 0 0.7rem",fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"0.9rem"}}>Entrate vs Spese {calYear}</h3>
              <div style={{display:"flex",alignItems:"flex-end",gap:"3px",height:"80px"}}>
                {byMonth.map((d,i)=>(
                  <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",height:"100%",justifyContent:"flex-end"}}>
                    <div style={{width:"100%",display:"flex",gap:"1px",alignItems:"flex-end",height:"68px"}}>
                      <div style={{flex:1,background:"#6ec99a",borderRadius:"2px 2px 0 0",height:`${(d.rev/maxBar)*100}%`,minHeight:d.rev?"2px":"0",opacity:0.85}}/>
                      <div style={{flex:1,background:"#c96e6e",borderRadius:"2px 2px 0 0",height:`${(d.exp/maxBar)*100}%`,minHeight:d.exp?"2px":"0",opacity:0.85}}/>
                    </div>
                    <div style={{fontSize:"0.52rem",color:"#4a3a20",marginTop:"2px"}}>{d.month}</div>
                  </div>
                ))}
              </div>
              <div style={{display:"flex",gap:"0.9rem",marginTop:"0.45rem"}}>
                <span style={{fontSize:"0.68rem",color:"#6ec99a"}}>■ Entrate</span>
                <span style={{fontSize:"0.68rem",color:"#c96e6e"}}>■ Spese</span>
              </div>
            </div>
          </div>
        )}

        {/* PRENOTAZIONI */}
        {section==="bookings"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.9rem"}}>
              <h2 style={{fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"1.2rem",margin:0}}>Prenotazioni</h2>
              <button onClick={()=>{if(realApts.length===0){alert("Nessun appartamento configurato. Aggiungine uno in Impostazioni.");return;}setBForm(emptyBooking);setEditItem(null);setModal("booking");}} style={btnP}>+ Nuova</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:"0.6rem"}}>
              {filteredBookings.length===0&&<p style={{color:"#5a4a30"}}>Nessuna prenotazione.</p>}
              {filteredBookings.map(b=>{
                const nights=nightCount(b.checkin,b.checkout);
                const isActive=b.checkin<=today&&b.checkout>today;
                const isPast=b.checkout<=today;
                return(
                  <div key={b.id} style={{background:"#120f0a",border:"1px solid #2a2010",borderRadius:"12px",padding:"0.85rem 0.9rem",borderLeft:`3px solid ${aptColor(b.apt)}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"0.5rem"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:"flex",alignItems:"center",gap:"0.45rem",marginBottom:"0.2rem",flexWrap:"wrap"}}>
                          <span style={{color:"#e8d5b0",fontWeight:"600",fontSize:"0.92rem"}}>{b.guest}</span>
                          {isActive&&<span style={{background:"#6ec99a22",color:"#6ec99a",fontSize:"0.58rem",padding:"0.1rem 0.4rem",borderRadius:"20px",border:"1px solid #6ec99a44"}}>In corso</span>}
                          {isPast&&<span style={{background:"#3a3020",color:"#6a5a40",fontSize:"0.58rem",padding:"0.1rem 0.4rem",borderRadius:"20px"}}>Conclusa</span>}
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
                          <button onClick={()=>openEditB(b)} style={{background:"#2a2010",border:"1px solid #3a3020",borderRadius:"6px",padding:"0.25rem 0.45rem",color:"#c9a96e",cursor:"pointer",fontSize:"0.68rem"}}>✏️</button>
                          <button onClick={()=>onDeleteBooking(b.id)} style={{background:"#2a1010",border:"1px solid #3a1010",borderRadius:"6px",padding:"0.25rem 0.45rem",color:"#c96e6e",cursor:"pointer",fontSize:"0.68rem"}}>🗑</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CALENDARIO */}
        {section==="calendar"&&(
          <div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.9rem"}}>
              <button onClick={prevMonth} style={{background:"#1a1612",border:"1px solid #3a3020",borderRadius:"10px",padding:"0.45rem 1rem",color:"#c9a96e",cursor:"pointer",fontSize:"1.1rem",lineHeight:1,fontWeight:"bold"}}>‹</button>
              <h2 style={{fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"1.15rem",margin:0}}>{MONTHS_LONG[calMonth]} {calYear}</h2>
              <button onClick={nextMonth} style={{background:"#1a1612",border:"1px solid #3a3020",borderRadius:"10px",padding:"0.45rem 1rem",color:"#c9a96e",cursor:"pointer",fontSize:"1.1rem",lineHeight:1,fontWeight:"bold"}}>›</button>
            </div>
            <div style={{background:"#120f0a",border:"1px solid #2a2010",borderRadius:"14px",padding:"0.7rem"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"2px",marginBottom:"3px"}}>
                {["L","M","M","G","V","S","D"].map((d,i)=>(
                  <div key={i} style={{textAlign:"center",color:i===6?"#5a4832":"#4a3a20",fontSize:"0.65rem",padding:"0.2rem 0",fontWeight:"700"}}>{d}</div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"2px"}}>
                {Array.from({length:firstDay}).map((_,i)=><div key={"e"+i} style={{minHeight:"50px"}}/>)}
                {Array.from({length:daysInMonth},(_,i)=>i+1).map(day=>{
                  const dateStr=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                  const bs=getBookingsForDay(day);
                  const isToday=dateStr===today;
                  const isSun=((firstDay+day-1)%7)===6;
                  return(
                    <div key={day} onClick={()=>openDayPopup(day)} style={{background:isToday?"#231d0f":"#0d0a07",border:`1px solid ${isToday?"#c9a96e55":"#181410"}`,borderRadius:"7px",padding:"0.28rem 0.2rem",minHeight:"50px",cursor:"pointer"}}>
                      <div style={{fontSize:"0.7rem",fontWeight:isToday?"700":"400",color:isToday?"#c9a96e":isSun?"#4e3d28":"#4a3a20",textAlign:"center",marginBottom:"3px"}}>{day}</div>
                      {bs.slice(0,2).map(b=>(
                        <div key={b.id} style={{background:aptColor(b.apt),borderRadius:getDayRole(b,day)==="checkin"?"3px 0 0 3px":getDayRole(b,day)==="checkout"?"0 3px 3px 0":"0",height:"5px",marginBottom:"2px",width:"100%",opacity:0.9}}/>
                      ))}
                      {bs.length>2&&<div style={{fontSize:"0.5rem",color:"#c9a96e",textAlign:"center"}}>+{bs.length-2}</div>}
                      {bs.length===1&&<div style={{fontSize:"0.55rem",color:aptColor(bs[0].apt),textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",padding:"0 1px",marginTop:"1px"}}>{bs[0].guest.split(" ")[0]}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{display:"flex",gap:"1.2rem",marginTop:"0.7rem",flexWrap:"wrap"}}>
              {realApts.map(a=>(
                <span key={a.id} style={{fontSize:"0.72rem",color:a.color,display:"flex",alignItems:"center",gap:"0.35rem"}}>
                  <span style={{width:"14px",height:"5px",borderRadius:"2px",background:a.color,display:"inline-block"}}/>{a.label}
                </span>
              ))}
              <span style={{fontSize:"0.65rem",color:"#4a3a20",marginLeft:"auto"}}>Tocca per dettagli</span>
            </div>
            {(()=>{
              const mStr=`${calYear}-${String(calMonth+1).padStart(2,"0")}`;
              const mb=filtered(bookings).filter(b=>b.checkin.startsWith(mStr)||b.checkout.startsWith(mStr)||(b.checkin<`${mStr}-01`&&b.checkout>`${mStr}-31`)).sort((a,b)=>a.checkin>b.checkin?1:-1);
              if(!mb.length) return null;
              return(
                <div style={{marginTop:"0.9rem"}}>
                  <h3 style={{fontFamily:"'Playfair Display',serif",color:"#8a7a60",fontSize:"0.88rem",marginBottom:"0.55rem"}}>Prenotazioni del mese</h3>
                  {mb.map(b=>(
                    <div key={b.id} style={{display:"flex",alignItems:"center",gap:"0.6rem",padding:"0.55rem 0.7rem",background:"#120f0a",borderRadius:"10px",marginBottom:"0.35rem",borderLeft:`3px solid ${aptColor(b.apt)}`}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:"#e8d5b0",fontSize:"0.83rem",fontWeight:"500",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.guest}</div>
                        <div style={{color:"#6a5a40",fontSize:"0.68rem"}}>{formatDate(b.checkin)} → {formatDate(b.checkout)} · {aptLabel(b.apt)}</div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{color:"#c9a96e",fontSize:"0.83rem"}}>€{b.price}</div>
                        <div style={{color:b.depositPaid?"#6ec99a":"#c9a96e",fontSize:"0.62rem"}}>{b.depositPaid?"✓":"○"} €{b.deposit||0}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* FINANZE */}
        {section==="finances"&&(
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

              {/* Fixed expenses */}
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

              {/* Management expenses */}
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

              {/* Total expenses */}
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.4rem 0",marginTop:"0.15rem",borderTop:"1px solid #3a3020"}}>
                <span style={{color:"#c9c0a8",fontSize:"0.85rem",fontWeight:"600",fontFamily:"'Playfair Display',serif"}}>Totale spese</span>
                <span style={{color:"#c96e6e",fontSize:"0.95rem",fontWeight:"700",fontFamily:"'Playfair Display',serif"}}>€{fmtEur(totalPeriodExp)}</span>
              </div>
            </div>

            {/* NETTO REALE / PREVISTO */}
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

            {/* Registro Spese */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.6rem"}}>
              <h3 style={{margin:0,fontFamily:"'Playfair Display',serif",color:"#8a7a60",fontSize:"0.88rem"}}>Registro Spese</h3>
              <button onClick={()=>{if(realApts.length===0){alert("Nessun appartamento configurato. Aggiungine uno in Impostazioni.");return;}setEForm(emptyExpense);setEditItem(null);setModal("expense");}} style={btnP}>+ Spesa</button>
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
                    <button onClick={()=>openEditE(e)} style={{background:"#2a2010",border:"1px solid #3a3020",borderRadius:"6px",padding:"0.22rem 0.4rem",color:"#c9a96e",cursor:"pointer",fontSize:"0.65rem"}}>✏️</button>
                    <button onClick={()=>onDeleteExpense(e.id)} style={{background:"#2a1010",border:"1px solid #3a1010",borderRadius:"6px",padding:"0.22rem 0.4rem",color:"#c96e6e",cursor:"pointer",fontSize:"0.65rem"}}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OSPITI */}
        {section==="guests"&&(
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"1.2rem",marginBottom:"0.9rem",marginTop:"0.4rem"}}>Anagrafica Ospiti</h2>
            <div style={{display:"flex",flexDirection:"column",gap:"0.6rem"}}>
              {filteredBookings.map(b=>(
                <div key={b.id} style={{background:"#120f0a",border:"1px solid #2a2010",borderRadius:"12px",padding:"0.9rem",borderTop:`2px solid ${aptColor(b.apt)}`}}>
                  <div style={{display:"flex",alignItems:"center",gap:"0.65rem",marginBottom:"0.6rem"}}>
                    <div style={{width:"32px",height:"32px",borderRadius:"50%",background:`${aptColor(b.apt)}22`,border:`1px solid ${aptColor(b.apt)}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.95rem",flexShrink:0}}>👤</div>
                    <div style={{minWidth:0}}>
                      <div style={{color:"#e8d5b0",fontWeight:"600",fontSize:"0.92rem",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.guest}</div>
                      <div style={{color:aptColor(b.apt),fontSize:"0.68rem"}}>{aptLabel(b.apt)} · {b.platform}</div>
                    </div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.25rem 0.5rem"}}>
                    {b.email&&<div style={{color:"#6a5a40",fontSize:"0.72rem"}}>✉️ {b.email}</div>}
                    {b.phone&&<div style={{color:"#6a5a40",fontSize:"0.72rem"}}>📞 {b.phone}</div>}
                    <div style={{color:"#6a5a40",fontSize:"0.72rem"}}>📅 {formatDate(b.checkin)} → {formatDate(b.checkout)}</div>
                    <div style={{color:"#6a5a40",fontSize:"0.72rem"}}>💶 €{b.price} · {nightCount(b.checkin,b.checkout)}n</div>
                    <div style={{color:b.depositPaid?"#6ec99a":"#c9a96e",fontSize:"0.7rem"}}>{b.depositPaid?"✓":"○"} Caparra €{b.deposit||0}</div>
                  </div>
                  {b.notes&&<div style={{color:"#8a7a60",fontSize:"0.7rem",fontStyle:"italic",marginTop:"0.45rem",padding:"0.35rem 0.5rem",background:"#0d0a07",borderRadius:"6px"}}>📝 {b.notes}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OPERAZIONI */}
        {section==="operations"&&(
          <div>
            <h2 style={{fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"1.2rem",marginBottom:"0.9rem",marginTop:"0.4rem"}}>Pulizie & Check-in/out</h2>
            <div style={{display:"flex",flexDirection:"column",gap:"0.6rem"}}>
              {filteredBookings.length===0&&<p style={{color:"#5a4a30"}}>Nessuna prenotazione.</p>}
              {filteredBookings.map(b=>(
                <div key={b.id} style={{background:"#120f0a",border:"1px solid #2a2010",borderRadius:"12px",padding:"0.85rem 0.9rem",borderLeft:`3px solid ${aptColor(b.apt)}`}}>
                  <div style={{marginBottom:"0.55rem"}}>
                    <div style={{color:"#e8d5b0",fontWeight:"600",fontSize:"0.88rem"}}>{b.guest}</div>
                    <div style={{color:"#6a5a40",fontSize:"0.72rem"}}>{aptLabel(b.apt)} · {formatDate(b.checkin)} → {formatDate(b.checkout)}</div>
                  </div>
                  <div style={{display:"flex",gap:"0.5rem"}}>
                    <button onClick={()=>onToggleCheckin(b.id)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:"0.35rem",padding:"0.5rem",borderRadius:"8px",border:`1px solid ${b.checkinDone?"#6ec99a44":"#2a2010"}`,cursor:"pointer",fontSize:"0.75rem",fontFamily:"Georgia,serif",background:b.checkinDone?"#1a2a1a":"#120f0a",color:b.checkinDone?"#6ec99a":"#5a4a30"}}>
                      {b.checkinDone?"✅":"⬜"} Check-in
                    </button>
                    <button onClick={()=>onToggleCleaning(b.id)} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:"0.35rem",padding:"0.5rem",borderRadius:"8px",border:`1px solid ${b.cleaning?"#6ec99a44":"#2a2010"}`,cursor:"pointer",fontSize:"0.75rem",fontFamily:"Georgia,serif",background:b.cleaning?"#1a2a1a":"#120f0a",color:b.cleaning?"#6ec99a":"#5a4a30"}}>
                      {b.cleaning?"✅":"⬜"} Pulizie
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* IMPOSTAZIONI */}
        {section==="settings"&&(
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
        )}
      </main>

      {/* Modal Prenotazione */}
      {modal==="booking"&&(
        <Modal title={editItem?"Modifica Prenotazione":"Nuova Prenotazione"} onClose={()=>{setModal(null);setEditItem(null);}}>
          <Field label="Appartamento"><select value={bForm.apt} onChange={e=>setBForm({...bForm,apt:e.target.value})} style={iS}>{realApts.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>
          <Field label="Nome Ospite"><input value={bForm.guest} onChange={e=>setBForm({...bForm,guest:e.target.value})} style={iS} placeholder="Nome Cognome"/></Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.65rem"}}>
            <Field label="Email"><input value={bForm.email} onChange={e=>setBForm({...bForm,email:e.target.value})} style={iS} placeholder="email@..." type="email"/></Field>
            <Field label="Telefono"><input value={bForm.phone} onChange={e=>setBForm({...bForm,phone:e.target.value})} style={iS} placeholder="3xx-xxx" type="tel"/></Field>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.65rem"}}>
            <Field label="Check-in"><input type="date" value={bForm.checkin} onChange={e=>setBForm({...bForm,checkin:e.target.value})} style={iS}/></Field>
            <Field label="Check-out"><input type="date" value={bForm.checkout} onChange={e=>setBForm({...bForm,checkout:e.target.value})} style={iS}/></Field>
          </div>
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
            <button onClick={()=>{setModal(null);setEditItem(null);}} style={{...btnP,flex:1,background:"#2a2010",color:"#8a7a60"}}>Annulla</button>
            <button onClick={saveBooking} style={{...btnP,flex:1}}>Salva</button>
          </div>
        </Modal>
      )}

      {/* Modal Spesa */}
      {modal==="expense"&&(
        <Modal title={editItem?"Modifica Spesa":"Nuova Spesa"} onClose={()=>{setModal(null);setEditItem(null);}}>
          <Field label="Appartamento"><select value={eForm.apt} onChange={e=>setEForm({...eForm,apt:e.target.value})} style={iS}>{realApts.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.65rem"}}>
            <Field label="Categoria"><select value={eForm.category} onChange={e=>setEForm({...eForm,category:e.target.value})} style={iS}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></Field>
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
          {editItem&&(
            <div style={{display:"flex",alignItems:"center",gap:"0.65rem",marginBottom:"0.9rem",padding:"0.55rem 0.8rem",background:"#0d0a07",borderRadius:"8px",border:"1px solid #2a2010",cursor:"pointer"}} onClick={()=>setEForm({...eForm,paid:!eForm.paid})}>
              <span style={{fontSize:"1rem"}}>{eForm.paid?"✅":"⬜"}</span>
              <span style={{color:"#8a7a60",fontSize:"0.8rem",fontFamily:"'Playfair Display',serif"}}>Spesa già pagata</span>
            </div>
          )}
          <div style={{display:"flex",gap:"0.65rem",marginTop:"0.2rem"}}>
            <button onClick={()=>{setModal(null);setEditItem(null);}} style={{...btnP,flex:1,background:"#2a2010",color:"#8a7a60"}}>Annulla</button>
            <button onClick={saveExpense} style={{...btnP,flex:1}}>Salva{eForm.paymentType!=="Una tantum"&&!editItem?" (crea rate)":""}</button>
          </div>
        </Modal>
      )}

      {/* Modal Appartamento */}
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

      {dayPopup&&<DayPopup dayBookings={dayPopup.bookings} dateStr={dayPopup.dateStr} onClose={()=>setDayPopup(null)} aptColor={aptColor} aptLabel={aptLabel}/>}
    </div>
  );
}

// ────────────────────────────────────────────
//  ROOT
// ────────────────────────────────────────────
export default function App() {
  const [user,setUser]=useState(null);
  const [profileError,setProfileError]=useState(false);
  const [aptLoadError,setAptLoadError]=useState(false);
  const [bookings,setBookings]=useState([]);
  const [expenses,setExpenses]=useState([]);
  const [apartments,setApartments]=useState([]);
  const [loading,setLoading]=useState(true);

  async function handleSession(session){
    setProfileError(false);
    console.log("[handleSession] uid:", session.user.id, "email:", session.user.email);
    const{data:profile,error}=await supabase.from("profiles").select("role").eq("id",session.user.id).single();
    console.log("[handleSession] profile:", profile, "error:", error);
    if(error||!profile){
      console.error("[auth] Profilo non trovato per",session.user.id,error?.message);
      setProfileError(true);setLoading(false);return;
    }
    setUser({id:session.user.id,email:session.user.email,role:profile.role});
    const[{data:bData},{data:eData},{data:aptData,error:aptErr}]=await Promise.all([
      supabase.from("bookings").select("*").order("checkin"),
      supabase.from("expenses").select("*").order("date",{ascending:false}),
      supabase.from("apartments").select("*").eq("active",true).order("label"),
    ]);
    if(bData) setBookings(bData.map(dbToBooking));
    if(eData) setExpenses(eData);
    if(aptErr){
      console.error("[apartments] Errore caricamento:",aptErr.message);
      setAptLoadError(true);
    } else {
      setAptLoadError(false);
      setApartments(aptData?.length?[APT_ALL,...aptData]:[APT_ALL]);
    }
    setLoading(false);
  }

  useEffect(()=>{
    // Usiamo SOLO onAuthStateChange perché garantisce che il JWT sia già applicato
    // al client prima di scattare (a differenza di getSession che può precedere
    // la propagazione interna del token necessaria per le query RLS).
    const{data:{subscription}}=supabase.auth.onAuthStateChange(async(event,session)=>{
      console.log("[auth] evento:", event, "user:", session?.user?.email||"none");
      if(event==="INITIAL_SESSION"){
        if(session) await handleSession(session);
        else setLoading(false);
      } else if(event==="SIGNED_IN"&&session){
        setLoading(true);
        await handleSession(session);
      } else if(event==="SIGNED_OUT"){
        setUser(null);setProfileError(false);setAptLoadError(false);setBookings([]);setExpenses([]);setApartments([]);
      }
    });
    return()=>subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const expensesWithMeta=expenses.map(e=>({...e,paid:e.paid||false,notes:e.notes||"",rate_group:e.rate_group||null}));

  const addApartment=async(apt)=>{
    const{data,error}=await supabase.from("apartments").insert({id:apt.id,label:apt.label,color:apt.color,active:true}).select().single();
    if(error){alert("Errore salvataggio appartamento: "+error.message);return;}
    if(data) setApartments(prev=>[...prev,data]);
  };
  const updateApartment=async(apt)=>{
    const{error}=await supabase.from("apartments").update({label:apt.label,color:apt.color}).eq("id",apt.id);
    if(!error) setApartments(prev=>prev.map(a=>a.id===apt.id?apt:a));
  };
  const deleteApartment=async(id)=>{
    // Soft-delete: imposta active=false invece di eliminare, per preservare lo storico
    const{error}=await supabase.from("apartments").update({active:false}).eq("id",id);
    if(!error) setApartments(prev=>prev.filter(a=>a.id!==id));
  };

  const addBooking=async(formData)=>{
    const row=bookingToDb(formData);
    const{data,error}=await supabase.from("bookings").insert(row).select().single();
    if(!error&&data) setBookings(bs=>[...bs,dbToBooking(data)]);
  };
  const updateBooking=async(id,formData)=>{
    const row=bookingToDb(formData);
    const{error}=await supabase.from("bookings").update(row).eq("id",id);
    if(!error) setBookings(bs=>bs.map(b=>b.id===id?{...formData,id,price:Number(formData.price),deposit:Number(formData.deposit)||0}:b));
  };
  const deleteBooking=async(id)=>{
    await supabase.from("bookings").delete().eq("id",id);
    setBookings(bs=>bs.filter(b=>b.id!==id));
  };
  const toggleCleaning=async(id)=>{
    const b=bookings.find(x=>x.id===id);const newVal=!b.cleaning;
    setBookings(bs=>bs.map(x=>x.id===id?{...x,cleaning:newVal}:x));
    await supabase.from("bookings").update({cleaning:newVal}).eq("id",id);
  };
  const toggleCheckin=async(id)=>{
    const b=bookings.find(x=>x.id===id);const newVal=!b.checkinDone;
    setBookings(bs=>bs.map(x=>x.id===id?{...x,checkinDone:newVal}:x));
    await supabase.from("bookings").update({checkin_done:newVal}).eq("id",id);
  };
  const toggleDeposit=async(id)=>{
    const b=bookings.find(x=>x.id===id);const newVal=!b.depositPaid;
    setBookings(bs=>bs.map(x=>x.id===id?{...x,depositPaid:newVal}:x));
    await supabase.from("bookings").update({deposit_paid:newVal}).eq("id",id);
  };
  const buildExpRow=(apt,date,category,notes,amount,rateGroup=null)=>({
    apt,date,category,description:category,notes:notes||"",amount:Number(amount),paid:false,
    ...(rateGroup?{rate_group:rateGroup}:{}),
  });
  const addExpense=async(formData)=>{
    const{paymentType,id:_id,...rest}=formData;
    const year=rest.date?rest.date.split("-")[0]:String(new Date().getFullYear());
    let rows=[];
    if(paymentType==="Rata IMU (2 rate)"){
      const rg=`imu_${Date.now()}`;const half=Math.round(Number(rest.amount)/2*100)/100;
      rows=[buildExpRow(rest.apt,`${year}-06-16`,rest.category,rest.notes,half,rg),
            buildExpRow(rest.apt,`${year}-11-30`,rest.category,rest.notes,half,rg)];
    }else if(paymentType==="Rata Condominio (5 rate)"){
      const rg=`cond_${Date.now()}`;const fifth=Math.round(Number(rest.amount)/5*100)/100;
      ["02","04","06","09","11"].forEach(m=>rows.push(buildExpRow(rest.apt,`${year}-${m}-15`,rest.category,rest.notes,fifth,rg)));
    }else if(paymentType==="Mensile"){
      const rg=`mens_${Date.now()}`;
      Array.from({length:12},(_,i)=>rows.push(buildExpRow(rest.apt,`${year}-${String(i+1).padStart(2,"0")}-01`,rest.category,rest.notes,rest.amount,rg)));
    }else{
      rows=[buildExpRow(rest.apt,rest.date,rest.category,rest.notes,rest.amount)];
    }
    console.log("[addExpense] rows:", rows);
    const newExp=[];
    for(const row of rows){
      const{data,error}=await supabase.from("expenses").insert(row).select().single();
      if(error){console.error("[addExpense] Errore:",error);alert("Errore: "+error.message);return;}
      if(data) newExp.push(data);
    }
    setExpenses(es=>[...es,...newExp]);
  };
  const updateExpense=async(id,formData)=>{
    const{paymentType,id:_id,...rest}=formData;
    const row={apt:rest.apt,date:rest.date,category:rest.category,description:rest.category,notes:rest.notes||"",amount:Number(rest.amount),paid:rest.paid||false};
    console.log("[updateExpense] id:",id,"row:",row);
    const{error}=await supabase.from("expenses").update(row).eq("id",id);
    if(error){console.error("[updateExpense] Errore:",error);alert("Errore: "+error.message);return;}
    setExpenses(es=>es.map(e=>e.id===id?{...row,id}:e));
  };
  const toggleExpensePaid=async(id)=>{
    const e=expenses.find(x=>x.id===id);if(!e)return;
    const newVal=!(e.paid||false);
    setExpenses(es=>es.map(x=>x.id===id?{...x,paid:newVal}:x));
    await supabase.from("expenses").update({paid:newVal}).eq("id",id);
  };
  const deleteExpense=async(id)=>{
    await supabase.from("expenses").delete().eq("id",id);
    setExpenses(es=>es.filter(e=>e.id!==id));
  };

  const handleLogout=async()=>{await supabase.auth.signOut();};

  if(loading) return <LoadingScreen/>;
  if(!user) return <LoginScreen profileError={profileError}/>;
  if(aptLoadError) return (
    <div style={{minHeight:"100vh",background:"#0a0806",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"2rem",fontFamily:"Georgia,serif",textAlign:"center"}}>
      <div style={{fontSize:"2.5rem",marginBottom:"1rem"}}>⚠️</div>
      <div style={{fontFamily:"'Playfair Display',serif",color:"#c96e6e",fontSize:"1.1rem",marginBottom:"0.5rem"}}>Errore caricamento appartamenti</div>
      <div style={{color:"#6a5a40",fontSize:"0.8rem",marginBottom:"1.5rem"}}>Impossibile leggere la tabella apartments da Supabase.<br/>Verifica la connessione e le policy RLS.</div>
      <button onClick={handleLogout} style={{background:"#2a1010",border:"1px solid #c96e6e44",borderRadius:"10px",padding:"0.65rem 1.5rem",color:"#c96e6e",cursor:"pointer",fontFamily:"'Playfair Display',serif",fontSize:"0.9rem"}}>Esci e riprova</button>
    </div>
  );
  if(user.role==="cleaner") return <CleanerView bookings={bookings} onToggleCleaning={toggleCleaning} onLogout={handleLogout} apartments={apartments}/>;

  return (
    <OwnerView
      user={user} bookings={bookings} expenses={expensesWithMeta}
      onAddBooking={addBooking} onUpdateBooking={updateBooking} onDeleteBooking={deleteBooking}
      onToggleCleaning={toggleCleaning} onToggleCheckin={toggleCheckin} onToggleDeposit={toggleDeposit}
      onAddExpense={addExpense} onUpdateExpense={updateExpense} onDeleteExpense={deleteExpense} onToggleExpensePaid={toggleExpensePaid}
      onLogout={handleLogout}
      apartments={apartments} onAddApartment={addApartment} onUpdateApartment={updateApartment} onDeleteApartment={deleteApartment}
    />
  );
}
