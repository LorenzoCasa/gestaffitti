import { formatDate, nightCount } from "../../../utils/dateUtils";

export default function DashboardSection({
  activeFilter,
  aptLabel,
  aptColor,
  totalRevenue,
  totalExpAmt,
  netProfit,
  bookingCount,
  pendingDeposits,
  currentGuests,
  upcoming,
  pendingCleaning,
  pendingCheckin,
  byMonth,
  maxBar,
  calYear,
  onToggleDeposit,
}) {
  return (
    <div>
      <h2 style={{fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"1.2rem",marginBottom:"0.9rem",marginTop:"0.4rem"}}>
        {activeFilter!=="all"?aptLabel(activeFilter):"Panoramica Generale"}
      </h2>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"0.6rem",marginBottom:"1rem"}}>
        {[
          {label:"Entrate",value:`€${totalRevenue.toLocaleString("it")}`,icon:"💶",color:"#6ec99a"},
          {label:"Spese",value:`€${totalExpAmt.toLocaleString("it")}`,icon:"📤",color:"#c96e6e"},
          {label:"Utile Netto",value:`€${netProfit.toLocaleString("it")}`,icon:"📈",color:netProfit>=0?"#c9a96e":"#c96e6e"},
          {label:"Prenotazioni",value:bookingCount,icon:"🔑",color:"#9e6ec9"},
        ].map(k=>(
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
      {currentGuests.length>0&&(
        <div style={{background:"rgba(110,201,154,0.06)",border:"1px solid #6ec99a33",borderRadius:"12px",padding:"0.9rem",marginBottom:"0.9rem"}}>
          <h3 style={{margin:"0 0 0.6rem",fontFamily:"'Playfair Display',serif",color:"#6ec99a",fontSize:"0.9rem"}}>🏠 Ospiti presenti ({currentGuests.length})</h3>
          {currentGuests.map(b=>(
            <div key={b.id} style={{display:"flex",alignItems:"center",gap:"0.7rem",padding:"0.5rem 0",borderBottom:"1px solid #1a2a1a"}}>
              <div style={{width:"7px",height:"7px",borderRadius:"50%",background:aptColor(b.apt),flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{color:"#e8d5b0",fontSize:"0.85rem",fontWeight:"500",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{b.guest}</div>
                <div style={{color:"#6a5a40",fontSize:"0.7rem"}}>{aptLabel(b.apt)} · fino al {formatDate(b.checkout)}</div>
              </div>
              <span style={{background:"#1a2a1a",color:"#6ec99a",fontSize:"0.62rem",padding:"0.1rem 0.45rem",borderRadius:"10px",border:"1px solid #6ec99a33",flexShrink:0}}>✓ Entrato</span>
            </div>
          ))}
        </div>
      )}
      <div style={{background:"#120f0a",border:"1px solid #2a2010",borderRadius:"12px",padding:"0.9rem",marginBottom:"0.9rem"}}>
        <h3 style={{margin:"0 0 0.7rem",fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"0.9rem"}}>Prossimi Arrivi</h3>
        {upcoming.length===0
          ? <p style={{color:"#5a4a30",fontSize:"0.8rem",margin:0}}>Nessun arrivo imminente</p>
          : upcoming.map(b=>(
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
          ))
        }
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
  );
}
