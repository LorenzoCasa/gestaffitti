import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function LoginScreen({ profileError }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(profileError ? "Profilo non configurato, contatta l'amministratore" : "");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password) { setError("Inserisci email e password"); return; }
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) {
      setError("Email o password non corretti");
      setLoading(false);
    }
    // Se il login ha successo, onAuthStateChange nel root App gestisce il resto
  }

  const iS = {width:"100%",background:"#0d0a07",border:"1px solid #3a3020",borderRadius:"10px",padding:"0.75rem 1rem",color:"#e8d5b0",fontFamily:"Georgia,serif",fontSize:"0.9rem",outline:"none",boxSizing:"border-box"};
  return (
    <div style={{minHeight:"100vh",background:"#0a0806",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"1.5rem",fontFamily:"Georgia,serif"}}>
      <div style={{textAlign:"center",marginBottom:"2.5rem"}}>
        <div style={{fontSize:"3rem",marginBottom:"0.5rem"}}>🏠</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:"2rem",color:"#c9a96e",letterSpacing:"0.06em"}}>GestAffitti</div>
        <div style={{fontSize:"0.65rem",color:"#6a5a40",letterSpacing:"0.18em",textTransform:"uppercase",marginTop:"0.2rem"}}>Affitti Brevi</div>
      </div>
      <div style={{background:"#120f0a",border:"1px solid #3a3020",borderRadius:"20px",padding:"2rem",width:"100%",maxWidth:"360px",boxShadow:"0 24px 60px rgba(0,0,0,0.5)"}}>
        <h2 style={{fontFamily:"'Playfair Display',serif",color:"#e8d5b0",fontSize:"1.1rem",margin:"0 0 1.5rem",textAlign:"center",letterSpacing:"0.04em"}}>Accedi</h2>
        <div style={{marginBottom:"1rem"}}>
          <label style={{display:"block",color:"#8a7a60",fontSize:"0.68rem",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:"0.35rem",fontFamily:"'Playfair Display',serif"}}>Email</label>
          <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="utente@email.com" style={iS}/>
        </div>
        <div style={{marginBottom:"1.4rem"}}>
          <label style={{display:"block",color:"#8a7a60",fontSize:"0.68rem",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:"0.35rem",fontFamily:"'Playfair Display',serif"}}>Password</label>
          <div style={{position:"relative"}}>
            <input type={showPw?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="••••••••"
              style={{...iS,padding:"0.75rem 2.8rem 0.75rem 1rem"}}/>
            <button onClick={()=>setShowPw(s=>!s)} style={{position:"absolute",right:"0.8rem",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#6a5a40",cursor:"pointer",fontSize:"1rem",lineHeight:1}}>{showPw?"🙈":"👁"}</button>
          </div>
        </div>
        {error&&<div style={{background:"rgba(201,110,110,0.12)",border:"1px solid #c96e6e44",borderRadius:"8px",padding:"0.6rem 0.8rem",color:"#c96e6e",fontSize:"0.8rem",textAlign:"center",marginBottom:"1rem"}}>{error}</div>}
        <button onClick={handleLogin} disabled={loading} style={{width:"100%",background:loading?"#3a3020":"linear-gradient(135deg,#c9a96e,#a07840)",border:"none",borderRadius:"10px",padding:"0.85rem",color:"#0a0806",fontWeight:"700",cursor:loading?"not-allowed":"pointer",fontFamily:"'Playfair Display',serif",fontSize:"1rem",letterSpacing:"0.05em",opacity:loading?0.7:1}}>
          {loading?"Accesso in corso...":"Entra"}
        </button>
      </div>
    </div>
  );
}
