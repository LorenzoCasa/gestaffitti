import { useState } from "react";
import { formatDate, nightCount } from "../utils/dateUtils";

export default function CleanerView({ bookings, onToggleCleaning, onLogout, apartments }) {
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
