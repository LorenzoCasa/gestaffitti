import { useState } from "react";
import { MONTHS, MONTHS_LONG } from "./constants";
import { formatDate, nightCount } from "./utils/dateUtils";
import LoadingScreen from "./components/LoadingScreen";
import LoginScreen from "./components/LoginScreen";
import CleanerView from "./components/CleanerView";
import DayPopup from "./components/shared/DayPopup";
import OperationsSection from "./components/owner/sections/OperationsSection";
import GuestsSection from "./components/owner/sections/GuestsSection";
import SettingsSection from "./components/owner/sections/SettingsSection";
import BookingsSection from "./components/owner/sections/BookingsSection";
import FinancesSection from "./components/owner/sections/FinancesSection";
import useSupabaseData from "./hooks/useSupabaseData";

// ────────────────────────────────────────────
//  OWNER VIEW
// ────────────────────────────────────────────
function OwnerView({user,bookings,expenses,onAddBooking,onUpdateBooking,onDeleteBooking,onToggleCleaning,onToggleCheckin,onToggleDeposit,onAddExpense,onUpdateExpense,onDeleteExpense,onToggleExpensePaid,onLogout,apartments,onAddApartment,onUpdateApartment,onDeleteApartment,categories}) {
  const now = new Date();
  const aptColor=(id)=>{ if(id==="property") return "#8a7a60"; return apartments.find(a=>a.id===id)?.color||"#c9a96e"; };
  const aptLabel=(id)=>{ if(id==="property") return "Immobile / Comune"; return apartments.find(a=>a.id===id)?.label||id; };
  const realApts=apartments.filter(a=>a.id!=="all");

  const [activeFilter,setActiveFilter]=useState("all");
  const [section,setSection]=useState("dashboard");
  const [dayPopup,setDayPopup]=useState(null);

  const [calYear,setCalYear]=useState(now.getFullYear());
  const [calMonth,setCalMonth]=useState(now.getMonth());
  function prevMonth(){if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);}
  function nextMonth(){if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);}

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
          <BookingsSection
            filteredBookings={filteredBookings}
            realApts={realApts}
            aptColor={aptColor}
            aptLabel={aptLabel}
            today={today}
            onAddBooking={onAddBooking}
            onUpdateBooking={onUpdateBooking}
            onDeleteBooking={onDeleteBooking}
            onToggleDeposit={onToggleDeposit}
          />
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
          <FinancesSection
            filteredExpenses={filteredExpenses}
            filteredBookings={filteredBookings}
            realApts={realApts}
            aptColor={aptColor}
            aptLabel={aptLabel}
            onAddExpense={onAddExpense}
            onUpdateExpense={onUpdateExpense}
            onDeleteExpense={onDeleteExpense}
            onToggleExpensePaid={onToggleExpensePaid}
            categories={categories}
          />
        )}

        {/* OSPITI */}
        {section==="guests"&&(
          <GuestsSection
            filteredBookings={filteredBookings}
            aptColor={aptColor}
            aptLabel={aptLabel}
          />
        )}

        {/* OPERAZIONI */}
        {section==="operations"&&(
          <OperationsSection
            filteredBookings={filteredBookings}
            aptColor={aptColor}
            aptLabel={aptLabel}
            onToggleCleaning={onToggleCleaning}
            onToggleCheckin={onToggleCheckin}
          />
        )}

        {/* IMPOSTAZIONI */}
        {section==="settings"&&(
          <SettingsSection
            realApts={realApts}
            bookings={bookings}
            onAddApartment={onAddApartment}
            onUpdateApartment={onUpdateApartment}
            onDeleteApartment={onDeleteApartment}
            categories={categories}
          />
        )}
      </main>

      {dayPopup&&<DayPopup dayBookings={dayPopup.bookings} dateStr={dayPopup.dateStr} onClose={()=>setDayPopup(null)} aptColor={aptColor} aptLabel={aptLabel}/>}
    </div>
  );
}

// ────────────────────────────────────────────
//  ROOT
// ────────────────────────────────────────────
export default function App() {
  const {
    user, loading, profileError, aptLoadError,
    bookings, expenses, apartments, categories,
    handleLogout,
    addBooking, updateBooking, deleteBooking,
    toggleCleaning, toggleCheckin, toggleDeposit,
    addExpense, updateExpense, deleteExpense, toggleExpensePaid,
    addApartment, updateApartment, deleteApartment,
  } = useSupabaseData();

  if (loading) return <LoadingScreen />;
  if (!user) return <LoginScreen profileError={profileError} />;
  if (aptLoadError) return (
    <div style={{minHeight:"100vh",background:"#0a0806",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"2rem",fontFamily:"Georgia,serif",textAlign:"center"}}>
      <div style={{fontSize:"2.5rem",marginBottom:"1rem"}}>⚠️</div>
      <div style={{fontFamily:"'Playfair Display',serif",color:"#c96e6e",fontSize:"1.1rem",marginBottom:"0.5rem"}}>Errore caricamento appartamenti</div>
      <div style={{color:"#6a5a40",fontSize:"0.8rem",marginBottom:"1.5rem"}}>Impossibile leggere la tabella apartments da Supabase.<br/>Verifica la connessione e le policy RLS.</div>
      <button onClick={handleLogout} style={{background:"#2a1010",border:"1px solid #c96e6e44",borderRadius:"10px",padding:"0.65rem 1.5rem",color:"#c96e6e",cursor:"pointer",fontFamily:"'Playfair Display',serif",fontSize:"0.9rem"}}>Esci e riprova</button>
    </div>
  );
  if (user.role === "cleaner") return <CleanerView bookings={bookings} onToggleCleaning={toggleCleaning} onLogout={handleLogout} apartments={apartments} />;

  return (
    <OwnerView
      user={user} bookings={bookings} expenses={expenses}
      onAddBooking={addBooking} onUpdateBooking={updateBooking} onDeleteBooking={deleteBooking}
      onToggleCleaning={toggleCleaning} onToggleCheckin={toggleCheckin} onToggleDeposit={toggleDeposit}
      onAddExpense={addExpense} onUpdateExpense={updateExpense} onDeleteExpense={deleteExpense} onToggleExpensePaid={toggleExpensePaid}
      onLogout={handleLogout}
      apartments={apartments} onAddApartment={addApartment} onUpdateApartment={updateApartment} onDeleteApartment={deleteApartment}
      categories={categories}
    />
  );
}
