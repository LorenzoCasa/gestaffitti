import { useState } from "react";
import { MONTHS } from "./constants";
import LoadingScreen from "./components/LoadingScreen";
import LoginScreen from "./components/LoginScreen";
import CleanerView from "./components/CleanerView";
import DayPopup from "./components/shared/DayPopup";
import DashboardSection from "./components/owner/sections/DashboardSection";
import CalendarSection from "./components/owner/sections/CalendarSection";
import OperationsSection from "./components/owner/sections/OperationsSection";
import GuestsSection from "./components/owner/sections/GuestsSection";
import SettingsSection from "./components/owner/sections/SettingsSection";
import BookingsSection from "./components/owner/sections/BookingsSection";
import FinancesSection from "./components/owner/sections/FinancesSection";
import AgentSection from "./components/owner/sections/AgentSection";
import MessaggiSection from "./components/owner/sections/MessaggiSection";
import ManagerAgentSection from "./components/owner/sections/ManagerAgentSection";
import useSupabaseData from "./hooks/useSupabaseData";
import useAgentData from "./hooks/useAgentData";

// ────────────────────────────────────────────
//  OWNER VIEW
// ────────────────────────────────────────────
function OwnerView({user,bookings,expenses,onAddBooking,onUpdateBooking,onDeleteBooking,onToggleCleaning,onToggleCheckin,onToggleDeposit,onAddExpense,onUpdateExpense,onDeleteExpense,onToggleExpensePaid,onLogout,apartments,onAddApartment,onUpdateApartment,onDeleteApartment,categories,inbox,decisions,aptRules,agentLoading,updateInboxStatus,markThreadReplied,markDecisionSent,approveDecision}) {
  const now = new Date();
  const aptColor=(id)=>{ if(id==="property") return "#8a7a60"; return apartments.find(a=>a.id===id)?.color||"#c9a96e"; };
  const aptLabel=(id)=>{ if(id==="property") return "Immobile / Comune"; return apartments.find(a=>a.id===id)?.label||id; };
  const realApts=apartments.filter(a=>a.id!=="all");
  const nuoviCount=(inbox??[]).filter(i=>["new","processing"].includes(i.status)).length;

  const [activeFilter,setActiveFilter]=useState("all");
  const [section,setSection]=useState("dashboard");
  const [dayPopup,setDayPopup]=useState(null);

  const [calYear,setCalYear]=useState(now.getFullYear());
  const [calMonth,setCalMonth]=useState(now.getMonth());
  const [calView,setCalView]=useState("grid");
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
  const currentGuests=filtered(bookings).filter(b=>b.checkinDone&&b.checkin<=today&&b.checkout>today);
  const upcoming=filtered(bookings).filter(b=>b.checkin>=today&&!b.checkinDone).sort((a,b)=>a.checkin>b.checkin?1:-1).slice(0,3);
  const pendingCleaning=filtered(bookings).filter(b=>!b.cleaning&&b.checkout<=today);
  const pendingCheckin=filtered(bookings).filter(b=>!b.checkinDone&&b.checkin>=today&&b.checkin<=new Date(Date.now()+86400000*3).toISOString().split("T")[0]);

  function openDayPopup(day){
    const d=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    setDayPopup({dateStr:d,bookings:filteredBookings.filter(b=>b.checkin<=d&&b.checkout>d)});
  }

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
        {[{id:"dashboard",icon:"📊",label:"Home"},{id:"bookings",icon:"📅",label:"Prenot."},{id:"calendar",icon:"🗓",label:"Cal."},{id:"finances",icon:"💰",label:"Finanze"},{id:"guests",icon:"👤",label:"Ospiti"},{id:"operations",icon:"🧹",label:"Operaz."},{id:"manager",icon:"🎛",label:"Agente"},{id:"messaggi",icon:"✉️",label:"Messaggi"},{id:"settings",icon:"⚙️",label:"Impost."}].map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)} style={{padding:"0.65rem 0.85rem",border:"none",background:"none",cursor:"pointer",color:section===s.id?"#c9a96e":"#5a4a30",borderBottom:section===s.id?"2px solid #c9a96e":"2px solid transparent",fontFamily:"'Playfair Display',serif",fontSize:"0.7rem",whiteSpace:"nowrap",display:"flex",flexDirection:"column",alignItems:"center",gap:"0.15rem",flexShrink:0}}>
            <span style={{fontSize:"0.9rem",position:"relative",display:"inline-block"}}>
              {s.icon}
              {s.id==="messaggi"&&nuoviCount>0&&(
                <span style={{position:"absolute",top:"-4px",right:"-9px",background:"#c96e6e",color:"#fff",borderRadius:"10px",padding:"0 0.25rem",fontSize:"0.5rem",lineHeight:"1.6",fontWeight:"700",minWidth:"1.2em",textAlign:"center",fontFamily:"Georgia,serif"}}>
                  {nuoviCount}
                </span>
              )}
            </span>
            <span>{s.label}</span>
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
          <DashboardSection
            activeFilter={activeFilter}
            aptLabel={aptLabel}
            aptColor={aptColor}
            totalRevenue={totalRevenue}
            totalExpAmt={totalExpAmt}
            netProfit={netProfit}
            bookingCount={filteredBookings.length}
            pendingDeposits={pendingDeposits}
            currentGuests={currentGuests}
            upcoming={upcoming}
            pendingCleaning={pendingCleaning}
            pendingCheckin={pendingCheckin}
            byMonth={byMonth}
            maxBar={maxBar}
            calYear={calYear}
            onToggleDeposit={onToggleDeposit}
          />
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
          <CalendarSection
            calYear={calYear}
            calMonth={calMonth}
            calView={calView}
            prevMonth={prevMonth}
            nextMonth={nextMonth}
            setCalView={setCalView}
            filteredBookings={filteredBookings}
            realApts={realApts}
            aptColor={aptColor}
            aptLabel={aptLabel}
            today={today}
            openDayPopup={openDayPopup}
          />
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
            today={today}
          />
        )}

        {/* AGENTE */}
        {section==="agent"&&(
          <AgentSection bookings={bookings} apartments={apartments} user={user}/>
        )}

        {/* MANAGER AGENT */}
        {section==="manager"&&(
          <ManagerAgentSection
            bookings={bookings}
            apartments={apartments}
            inbox={inbox??[]}
            decisions={decisions??[]}
            agentLoading={agentLoading}
            onAddBooking={onAddBooking}
            onUpdateBooking={onUpdateBooking}
          />
        )}

        {/* MESSAGGI */}
        {section==="messaggi"&&(
          <MessaggiSection user={user} apartments={apartments} bookings={bookings} inbox={inbox??[]} decisions={decisions??[]} aptRules={aptRules??[]} agentLoading={agentLoading} updateInboxStatus={updateInboxStatus} markThreadReplied={markThreadReplied} markDecisionSent={markDecisionSent} approveDecision={approveDecision}/>
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
  const { inbox, decisions, aptRules, agentLoading, updateInboxStatus, markThreadReplied, markDecisionSent, approveDecision } = useAgentData(user);

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
      inbox={inbox} decisions={decisions} aptRules={aptRules} agentLoading={agentLoading} updateInboxStatus={updateInboxStatus} markThreadReplied={markThreadReplied} markDecisionSent={markDecisionSent} approveDecision={approveDecision}
    />
  );
}
