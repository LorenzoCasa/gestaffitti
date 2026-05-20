export const iS = {width:"100%",background:"#120f0a",border:"1px solid #3a3020",borderRadius:"8px",padding:"0.6rem 0.8rem",color:"#e8d5b0",fontFamily:"Georgia,serif",fontSize:"0.9rem",outline:"none",boxSizing:"border-box"};
export const btnP = {background:"linear-gradient(135deg,#c9a96e,#a07840)",border:"none",borderRadius:"8px",padding:"0.7rem 1.5rem",color:"#0a0806",fontWeight:"700",cursor:"pointer",fontFamily:"'Playfair Display',serif",fontSize:"0.9rem",letterSpacing:"0.05em"};

export default function Field({ label, children }) {
  return (
    <div style={{marginBottom:"0.9rem"}}>
      <label style={{display:"block",color:"#8a7a60",fontSize:"0.7rem",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:"0.35rem",fontFamily:"'Playfair Display',serif"}}>{label}</label>
      {children}
    </div>
  );
}
