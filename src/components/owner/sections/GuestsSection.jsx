import { formatDate, nightCount } from "../../../utils/dateUtils";

export default function GuestsSection({ filteredBookings, aptColor, aptLabel }) {
  return (
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
  );
}
