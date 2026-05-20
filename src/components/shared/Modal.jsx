export default function Modal({ title, onClose, children }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(10,8,6,0.88)",zIndex:1000,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
      <div style={{background:"#1a1612",border:"1px solid #3a3020",borderRadius:"20px 20px 0 0",padding:"1.5rem",width:"100%",maxWidth:"560px",maxHeight:"92vh",overflowY:"auto",boxShadow:"0 -12px 60px rgba(0,0,0,0.7)"}}>
        <div style={{width:"36px",height:"4px",background:"#3a3020",borderRadius:"2px",margin:"0 auto 1.2rem"}}/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.2rem"}}>
          <h3 style={{margin:0,fontFamily:"'Playfair Display',serif",color:"#e8d5b0",fontSize:"1.2rem"}}>{title}</h3>
          <button onClick={onClose} style={{background:"#2a2010",border:"none",color:"#8a7a60",fontSize:"1.2rem",cursor:"pointer",width:"30px",height:"30px",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
