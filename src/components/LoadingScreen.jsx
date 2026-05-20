export default function LoadingScreen() {
  return (
    <div style={{minHeight:"100vh",background:"#0a0806",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"Georgia,serif"}}>
      <div style={{fontSize:"2.5rem",marginBottom:"0.8rem"}}>🏠</div>
      <div style={{fontFamily:"'Playfair Display',serif",fontSize:"1.5rem",color:"#c9a96e",letterSpacing:"0.06em",marginBottom:"0.3rem"}}>GestAffitti</div>
      <div style={{fontSize:"0.65rem",color:"#6a5a40",letterSpacing:"0.18em",textTransform:"uppercase",marginBottom:"2rem"}}>Affitti Brevi</div>
      <div style={{width:"36px",height:"36px",border:"3px solid #2a2010",borderTop:"3px solid #c9a96e",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
