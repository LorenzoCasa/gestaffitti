import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function LoginScreen({ profileError }) {
  const [mode, setMode] = useState("login"); // 'login' | 'forgot' | 'forgot_sent'
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

  async function handleForgot() {
    if (!email.trim()) { setError("Inserisci la tua email"); return; }
    setLoading(true);
    setError("");
    const redirectTo = import.meta.env.DEV
      ? "http://localhost:5173"
      : "https://gestaffitti.vercel.app";
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    setLoading(false);
    if (resetError) {
      setError("Errore: " + resetError.message);
    } else {
      setMode("forgot_sent");
    }
  }

  function switchMode(newMode) {
    setMode(newMode);
    setError("");
    setPassword("");
  }

  const iS = { width:"100%", background:"#0d0a07", border:"1px solid #3a3020", borderRadius:"10px", padding:"0.75rem 1rem", color:"#e8d5b0", fontFamily:"Georgia,serif", fontSize:"0.9rem", outline:"none", boxSizing:"border-box" };

  return (
    <div style={{minHeight:"100vh",background:"#0a0806",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"1.5rem",fontFamily:"Georgia,serif"}}>
      <div style={{textAlign:"center",marginBottom:"2.5rem"}}>
        <div style={{fontSize:"3rem",marginBottom:"0.5rem"}}>🏠</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:"2rem",color:"#c9a96e",letterSpacing:"0.06em"}}>GestAffitti</div>
        <div style={{fontSize:"0.65rem",color:"#6a5a40",letterSpacing:"0.18em",textTransform:"uppercase",marginTop:"0.2rem"}}>Affitti Brevi</div>
      </div>
      <div style={{background:"#120f0a",border:"1px solid #3a3020",borderRadius:"20px",padding:"2rem",width:"100%",maxWidth:"360px",boxShadow:"0 24px 60px rgba(0,0,0,0.5)"}}>

        {/* ── LOGIN ── */}
        {mode === "login" && (
          <>
            <h2 style={{fontFamily:"'Playfair Display',serif",color:"#e8d5b0",fontSize:"1.1rem",margin:"0 0 1.5rem",textAlign:"center",letterSpacing:"0.04em"}}>Accedi</h2>
            <div style={{marginBottom:"1rem"}}>
              <label style={{display:"block",color:"#8a7a60",fontSize:"0.68rem",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:"0.35rem",fontFamily:"'Playfair Display',serif"}}>Email</label>
              <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="utente@email.com" style={iS}/>
            </div>
            <div style={{marginBottom:"0.5rem"}}>
              <label style={{display:"block",color:"#8a7a60",fontSize:"0.68rem",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:"0.35rem",fontFamily:"'Playfair Display',serif"}}>Password</label>
              <div style={{position:"relative"}}>
                <input type={showPw?"text":"password"} value={password} onChange={e=>{setPassword(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="••••••••"
                  style={{...iS,padding:"0.75rem 2.8rem 0.75rem 1rem"}}/>
                <button onClick={()=>setShowPw(s=>!s)} style={{position:"absolute",right:"0.8rem",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#6a5a40",cursor:"pointer",fontSize:"1rem",lineHeight:1}}>{showPw?"🙈":"👁"}</button>
              </div>
            </div>
            <div style={{textAlign:"right",marginBottom:"1.2rem"}}>
              <button onClick={()=>switchMode("forgot")} style={{background:"none",border:"none",color:"#6a5a40",cursor:"pointer",fontSize:"0.72rem",padding:0,textDecoration:"underline",fontFamily:"Georgia,serif"}}>Password dimenticata?</button>
            </div>
            {error&&<div style={{background:"rgba(201,110,110,0.12)",border:"1px solid #c96e6e44",borderRadius:"8px",padding:"0.6rem 0.8rem",color:"#c96e6e",fontSize:"0.8rem",textAlign:"center",marginBottom:"1rem"}}>{error}</div>}
            <button onClick={handleLogin} disabled={loading} style={{width:"100%",background:loading?"#3a3020":"linear-gradient(135deg,#c9a96e,#a07840)",border:"none",borderRadius:"10px",padding:"0.85rem",color:"#0a0806",fontWeight:"700",cursor:loading?"not-allowed":"pointer",fontFamily:"'Playfair Display',serif",fontSize:"1rem",letterSpacing:"0.05em",opacity:loading?0.7:1}}>
              {loading?"Accesso in corso...":"Entra"}
            </button>
          </>
        )}

        {/* ── PASSWORD DIMENTICATA ── */}
        {mode === "forgot" && (
          <>
            <h2 style={{fontFamily:"'Playfair Display',serif",color:"#e8d5b0",fontSize:"1.1rem",margin:"0 0 0.4rem",textAlign:"center",letterSpacing:"0.04em"}}>Reset password</h2>
            <p style={{color:"#6a5a40",fontSize:"0.75rem",textAlign:"center",margin:"0 0 1.5rem"}}>Inserisci la tua email. Ti mandiamo un link per impostare una nuova password.</p>
            <div style={{marginBottom:"1.4rem"}}>
              <label style={{display:"block",color:"#8a7a60",fontSize:"0.68rem",letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:"0.35rem",fontFamily:"'Playfair Display',serif"}}>Email</label>
              <input type="email" value={email} onChange={e=>{setEmail(e.target.value);setError("");}} onKeyDown={e=>e.key==="Enter"&&handleForgot()} placeholder="utente@email.com" style={iS}/>
            </div>
            {error&&<div style={{background:"rgba(201,110,110,0.12)",border:"1px solid #c96e6e44",borderRadius:"8px",padding:"0.6rem 0.8rem",color:"#c96e6e",fontSize:"0.8rem",textAlign:"center",marginBottom:"1rem"}}>{error}</div>}
            <button onClick={handleForgot} disabled={loading} style={{width:"100%",background:loading?"#3a3020":"linear-gradient(135deg,#c9a96e,#a07840)",border:"none",borderRadius:"10px",padding:"0.85rem",color:"#0a0806",fontWeight:"700",cursor:loading?"not-allowed":"pointer",fontFamily:"'Playfair Display',serif",fontSize:"1rem",letterSpacing:"0.05em",opacity:loading?0.7:1}}>
              {loading?"Invio in corso...":"Invia link reset"}
            </button>
            <button onClick={()=>switchMode("login")} style={{width:"100%",marginTop:"0.75rem",background:"none",border:"none",color:"#6a5a40",cursor:"pointer",fontSize:"0.8rem",fontFamily:"Georgia,serif",textDecoration:"underline"}}>← Torna al login</button>
          </>
        )}

        {/* ── EMAIL INVIATA ── */}
        {mode === "forgot_sent" && (
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:"2.5rem",marginBottom:"0.75rem"}}>📬</div>
            <div style={{fontFamily:"'Playfair Display',serif",color:"#6ec99a",fontSize:"1rem",marginBottom:"0.6rem"}}>Email inviata</div>
            <div style={{color:"#8a7a60",fontSize:"0.8rem",lineHeight:1.5,marginBottom:"1.5rem"}}>Controlla la casella <strong style={{color:"#c9a96e"}}>{email}</strong> e clicca il link per impostare la nuova password.</div>
            <button onClick={()=>switchMode("login")} style={{background:"none",border:"1px solid #3a3020",borderRadius:"10px",padding:"0.65rem 1.5rem",color:"#8a7a60",cursor:"pointer",fontFamily:"'Playfair Display',serif",fontSize:"0.85rem"}}>← Torna al login</button>
          </div>
        )}

      </div>
    </div>
  );
}
