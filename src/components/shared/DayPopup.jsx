import { formatDate, nightCount } from "../../utils/dateUtils";

export default function DayPopup({ dayBookings, dateStr, onClose, aptColor, aptLabel }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(10,8,6,0.85)",zIndex:900,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:"#1a1612",border:"1px solid #3a3020",borderRadius:"20px 20px 0 0",padding:"1.5rem",width:"100%",maxWidth:"480px",maxHeight:"60vh",overflowY:"auto"}}>
        <div style={{width:"36px",height:"4px",background:"#3a3020",borderRadius:"2px",margin:"0 auto 1rem"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem"}}>
          <h3 style={{margin:0,fontFamily:"'Playfair Display',serif",color:"#c9a96e",fontSize:"1rem"}}>{formatDate(dateStr)}</h3>
          <button onClick={onClose} style={{background:"#2a2010",border:"none",color:"#8a7a60",fontSize:"1.1rem",cursor:"pointer",width:"28px",height:"28px",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        {dayBookings.length === 0
          ? <p style={{color:"#5a4a30",fontSize:"0.85rem"}}>Nessuna prenotazione</p>
          : dayBookings.map(b => (
            <div key={b.id} style={{borderLeft:`3px solid ${aptColor(b.apt)}`,paddingLeft:"0.8rem",marginBottom:"0.9rem"}}>
              <div style={{color:"#e8d5b0",fontWeight:"600",fontSize:"0.95rem"}}>{b.guest}</div>
              <div style={{color:aptColor(b.apt),fontSize:"0.72rem",marginBottom:"0.2rem"}}>{aptLabel(b.apt)} · {b.platform}</div>
              <div style={{color:"#6a5a40",fontSize:"0.78rem"}}>{formatDate(b.checkin)} → {formatDate(b.checkout)} · {nightCount(b.checkin,b.checkout)} notti</div>
              <div style={{display:"flex",gap:"0.5rem",marginTop:"0.3rem",flexWrap:"wrap"}}>
                <span style={{color:"#c9a96e",fontSize:"0.8rem"}}>€{b.price}</span>
                <span style={{color:b.depositPaid?"#6ec99a":"#c9a96e",fontSize:"0.72rem",background:b.depositPaid?"#1a2a1a":"#2a2010",padding:"0.1rem 0.4rem",borderRadius:"4px"}}>{b.depositPaid?"✓":"○"} Caparra €{b.deposit}</span>
              </div>
              {b.notes && <div style={{color:"#8a7a60",fontSize:"0.72rem",fontStyle:"italic",marginTop:"0.25rem"}}>📝 {b.notes}</div>}
            </div>
          ))
        }
      </div>
    </div>
  );
}
