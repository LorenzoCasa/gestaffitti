import { formatDate } from "../../../utils/dateUtils";

export default function OperationsSection({ filteredBookings, aptColor, aptLabel, onToggleCleaning, onToggleCheckin }) {
  return (
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
  );
}
