import { MONTHS_LONG } from "../../../constants";
import { formatDate } from "../../../utils/dateUtils";

export default function CalendarSection({
  calYear,
  calMonth,
  calView,
  prevMonth,
  nextMonth,
  setCalView,
  filteredBookings,
  realApts,
  aptColor,
  aptLabel,
  today,
  openDayPopup,
}) {
  const mStr        = `${calYear}-${String(calMonth+1).padStart(2,"0")}`;
  const daysInMonth = new Date(calYear,calMonth+1,0).getDate();
  const firstDay    = ((new Date(calYear,calMonth,1).getDay())+6)%7;
  const calDays     = Array.from({length:daysInMonth},(_,i)=>i+1);
  const monthBs     = filteredBookings
    .filter(b=>b.checkin<`${mStr}-32`&&b.checkout>`${mStr}-00`)
    .sort((a,b)=>a.checkin>b.checkin?1:-1);

  const btnV = (v) => ({
    background:   calView===v?"#2a2010":"#120f0a",
    border:       `1px solid ${calView===v?"#c9a96e55":"#2a2010"}`,
    borderRadius: "20px",
    padding:      "0.28rem 0.75rem",
    color:        calView===v?"#c9a96e":"#5a4a30",
    fontSize:     "0.68rem",
    cursor:       "pointer",
    fontFamily:   "'Playfair Display',serif",
  });

  function getDayRole(b,day) {
    const d=`${mStr}-${String(day).padStart(2,"0")}`;
    if(b.checkin===d)  return "checkin";
    if(b.checkout===d) return "checkout";
    return "stay";
  }

  function getBookingsForDay(day) {
    const d=`${mStr}-${String(day).padStart(2,"0")}`;
    return filteredBookings.filter(b=>b.checkin<=d&&b.checkout>d);
  }

  return (
    <div>
      {/* Navigazione mese */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"0.7rem"}}>
        <button onClick={prevMonth} style={{background:"#1a1612",border:"1px solid #3a3020",borderRadius:"10px",padding:"0.45rem 1rem",color:"#c9a96e",cursor:"pointer",fontSize:"1.1rem",lineHeight:1,fontWeight:"bold"}}>‹</button>
        <h2 style={{fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"1.15rem",margin:0}}>{MONTHS_LONG[calMonth]} {calYear}</h2>
        <button onClick={nextMonth} style={{background:"#1a1612",border:"1px solid #3a3020",borderRadius:"10px",padding:"0.45rem 1rem",color:"#c9a96e",cursor:"pointer",fontSize:"1.1rem",lineHeight:1,fontWeight:"bold"}}>›</button>
      </div>
      {/* Toggle vista */}
      <div style={{display:"flex",gap:"0.35rem",marginBottom:"0.8rem"}}>
        <button onClick={()=>setCalView("grid")}  style={btnV("grid")}>📅 Mensile</button>
        <button onClick={()=>setCalView("gantt")} style={btnV("gantt")}>📊 Per appartamento</button>
      </div>

      {/* ── VISTA GRIGLIA ── */}
      {calView==="grid"&&(
        <>
          <div style={{background:"#120f0a",border:"1px solid #2a2010",borderRadius:"14px",padding:"0.7rem"}}>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"2px",marginBottom:"3px"}}>
              {["L","M","M","G","V","S","D"].map((d,i)=>(
                <div key={i} style={{textAlign:"center",color:i===6?"#5a4832":"#4a3a20",fontSize:"0.65rem",padding:"0.2rem 0",fontWeight:"700"}}>{d}</div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"2px"}}>
              {Array.from({length:firstDay}).map((_,i)=><div key={"e"+i} style={{minHeight:"50px"}}/>)}
              {calDays.map(day=>{
                const dateStr=`${mStr}-${String(day).padStart(2,"0")}`;
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
        </>
      )}

      {/* ── VISTA GANTT ── */}
      {calView==="gantt"&&(
        <div style={{background:"#120f0a",border:"1px solid #2a2010",borderRadius:"14px",padding:"0.7rem",overflowX:"auto"}}>
          <div style={{minWidth:`${90+daysInMonth*22}px`}}>
            {/* Header giorni */}
            <div style={{display:"flex",marginBottom:"4px"}}>
              <div style={{width:"90px",flexShrink:0}}/>
              <div style={{flex:1,display:"flex",gap:"1px"}}>
                {calDays.map(d=>{
                  const dateStr=`${mStr}-${String(d).padStart(2,"0")}`;
                  const isToday=dateStr===today;
                  const wd=new Date(dateStr+"T12:00:00Z").getUTCDay();
                  return(
                    <div key={d} style={{flex:1,minWidth:"20px",textAlign:"center",fontSize:"0.52rem",fontWeight:isToday?"700":"400",color:isToday?"#c9a96e":wd===0||wd===6?"#5a4a30":"#3a2a18"}}>
                      {d}
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Righe appartamenti */}
            {realApts.map(apt=>{
              const aptBs=monthBs.filter(b=>b.apt===apt.id);
              return(
                <div key={apt.id} style={{display:"flex",alignItems:"center",marginBottom:"5px"}}>
                  <div style={{width:"90px",flexShrink:0,fontSize:"0.68rem",color:aptColor(apt.id),fontWeight:"700",paddingRight:"6px",textAlign:"right",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{apt.label}</div>
                  <div style={{flex:1,display:"flex",gap:"1px",height:"32px"}}>
                    {calDays.map(d=>{
                      const dateStr=`${mStr}-${String(d).padStart(2,"0")}`;
                      const nextDateStr=`${mStr}-${String(d+1).padStart(2,"0")}`;
                      const isToday=dateStr===today;
                      const bk=aptBs.find(b=>b.checkin<=dateStr&&b.checkout>dateStr);
                      const isFirst=bk&&(bk.checkin===dateStr||(d===1&&bk.checkin<dateStr));
                      const isLast=bk&&(bk.checkout===nextDateStr||d===daysInMonth||bk.checkout<nextDateStr);
                      const bg=bk?aptColor(bk.apt)+"bb":(isToday?"#1a1608":"#0a0806");
                      const br=isFirst&&isLast?"4px":isFirst?"4px 0 0 4px":isLast?"0 4px 4px 0":"0";
                      return(
                        <div key={d} style={{flex:1,minWidth:"20px",height:"100%",background:bg,borderRadius:br,border:`1px solid ${bk?"transparent":isToday?"#2a2010":"#181410"}`,display:"flex",alignItems:"center",overflow:"hidden",position:"relative"}}>
                          {isToday&&!bk&&<div style={{position:"absolute",bottom:"2px",left:"50%",transform:"translateX(-50%)",width:"3px",height:"3px",borderRadius:"50%",background:"#c9a96e"}}/>}
                          {isFirst&&bk&&<span style={{fontSize:"0.48rem",color:"#0a0806",fontWeight:"700",whiteSpace:"nowrap",paddingLeft:"3px",overflow:"hidden"}}>{bk.guest.split(" ")[0]}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {realApts.length===0&&<p style={{color:"#5a4a30",fontSize:"0.8rem",textAlign:"center",padding:"1rem 0"}}>Nessun appartamento configurato.</p>}
          </div>
        </div>
      )}

      {/* Lista prenotazioni del mese (entrambe le viste) */}
      {monthBs.length>0&&(
        <div style={{marginTop:"0.9rem"}}>
          <h3 style={{fontFamily:"'Playfair Display',serif",color:"#8a7a60",fontSize:"0.88rem",marginBottom:"0.55rem"}}>Prenotazioni del mese</h3>
          {monthBs.map(b=>(
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
      )}
    </div>
  );
}
