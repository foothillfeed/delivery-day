import { useState, useRef, useEffect, useCallback } from "react";

const GREEN = "#2D5233";
const AMBER = "#d4853a";
const RED = "#c0392b";
const BLUE = "#2c5f8a";
const PURPLE = "#6b4c9a";

// Vendor config — add new vendors here
const VENDORS = {
  "Newco":    { repEmail: "nate.burger@newcodistributors.com", deadlineDay: "Wednesday",       color: GREEN },
  "VSI":      { repEmail: "orders@vsi.cc",                    deadlineDay: "Tuesday by 2pm",  color: "#7b3f9e" },
  "Phillips": { repEmail: "orders@phillipspet.com",           deadlineDay: "Thursday by 10am", color: "#c45c1a" },
  "Other":    { repEmail: "",                                 deadlineDay: null,               color: BLUE },
};

// Detect vendor from invoice content
function detectVendor(raw) {
  const u = raw.toUpperCase();
  if (u.includes("NEWCO") || u.includes("RANCHO CUCAMONGA")) return "Newco";
  if (u.includes("VETERINARY SERVICE") || u.includes("VSI") || u.includes("PALMYRITA")) return "VSI";
  if (u.includes("PHILLIPS PET") || u.includes("HECKTOWN") || u.includes("EASTON, PA")) return "Phillips";
  return "Other";
}

function Badge({ type, children }) {
  const colors = {
    ok:{bg:"#eef4ef",color:GREEN}, short:{bg:"#fdf4eb",color:AMBER}, cancel:{bg:"#fdf0ee",color:RED},
    special:{bg:"#edf3f9",color:BLUE}, damaged:{bg:"#fdf0ee",color:RED}, wrong:{bg:"#edf3f9",color:BLUE},
    extra:{bg:"#f3eef9",color:PURPLE}, price:{bg:"#fff8e1",color:"#b8860b"}
  };
  const c = colors[type]||colors.ok;
  return <span style={{background:c.bg,color:c.color,padding:"3px 8px",borderRadius:20,fontSize:11,fontWeight:600}}>{children}</span>;
}

// ── QR Code generator (pure JS, no library needed) ────────────────────────
function generateQR(text) {
  // We use a free QR API for simplicity
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}`;
}

// ── Add Photos Modal — opens on iPad to add photos to flagged items ────────
function AddPhotosModal({ session, onSave, onClose }) {
  const [photos, setPhotos] = useState(session.damagePhotos || {});
  const photoInputRef = useRef();
  const [activeIdx, setActiveIdx] = useState(null);

  const damagedItems = (session.items || [])
    .map((item, i) => ({ item, i }))
    .filter(({ i }) => session.flags[i] === "damaged");

  const handlePhotoCapture = (e, idx) => {
    Array.from(e.target.files).forEach(file => {
      const r = new FileReader();
      r.onload = ev => setPhotos(prev => ({ ...prev, [idx]: [...(prev[idx] || []), ev.target.result] }));
      r.readAsDataURL(file);
    });
  };

  const removePhoto = (idx, pi) => setPhotos(prev => ({ ...prev, [idx]: prev[idx].filter((_,i) => i !== pi) }));

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div style={{background:"white",borderRadius:14,padding:24,maxWidth:520,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}}>
        <div style={{fontSize:12,color:"#888",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>📱 Add Damage Photos — iPad</div>
        <div style={{fontSize:17,fontWeight:700,color:RED,marginBottom:4}}>Invoice {session.invoice_number}</div>
        <div style={{fontSize:13,color:"#666",marginBottom:20}}>Tap each item to add photos of the damage</div>

        {damagedItems.length === 0 && (
          <div style={{textAlign:"center",padding:"24px 0",color:"#aaa"}}>No damaged items flagged in this check-in</div>
        )}

        {damagedItems.map(({ item, i }) => (
          <div key={i} style={{border:"1px solid #ddd8d0",borderRadius:10,padding:"14px 16px",marginBottom:12}}>
            <div style={{fontWeight:600,fontSize:14,marginBottom:4}}>{item.description}</div>
            <div style={{fontSize:12,color:"#888",marginBottom:10}}>{session.damagedQty?.[i] || "?"} bags damaged</div>
            {(photos[i] || []).length > 0 && (
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:10}}>
                {(photos[i] || []).map((src, pi) => (
                  <div key={pi} style={{position:"relative",aspectRatio:"1",borderRadius:8,overflow:"hidden",border:"1px solid #ddd"}}>
                    <img src={src} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="damage"/>
                    <button onClick={() => removePhoto(i, pi)} style={{position:"absolute",top:3,right:3,background:"rgba(0,0,0,0.65)",color:"white",border:"none",borderRadius:"50%",width:20,height:20,fontSize:11,cursor:"pointer"}}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <label style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px 0",borderRadius:8,border:`1px dashed ${RED}`,background:"#fdf8f8",color:RED,fontWeight:600,fontSize:13,cursor:"pointer"}}>
              📷 {(photos[i]||[]).length > 0 ? `Add More Photos (${(photos[i]||[]).length})` : "Take Photo"}
              <input type="file" accept="image/*" capture="environment" multiple style={{display:"none"}} onChange={e => handlePhotoCapture(e, i)}/>
            </label>
          </div>
        ))}

        <div style={{display:"flex",gap:8,marginTop:8}}>
          <button onClick={() => onSave(photos)} style={{flex:1,padding:"12px 0",borderRadius:8,fontWeight:700,fontSize:14,cursor:"pointer",background:GREEN,color:"white",border:"none",fontFamily:"inherit"}}>
            ✓ Save Photos to Report
          </button>
          <button onClick={onClose} style={{padding:"12px 16px",borderRadius:8,fontWeight:600,fontSize:14,cursor:"pointer",background:"white",color:"#888",border:"1px solid #ddd",fontFamily:"inherit"}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Share Session Modal — shows QR code for iPad ──────────────────────────
function ShareSessionModal({ session, onClose }) {
  const sessionStr = JSON.stringify(session);
  const tooLarge = sessionStr.length > 2000; // QR codes have size limits
  const url = tooLarge ? null : `${window.location.href.split('?')[0]}?session=${encodeURIComponent(sessionStr)}`;
  const qrUrl = url ? generateQR(url) : null;

  const copyLink = () => {
    if (url) { navigator.clipboard.writeText(url); alert("Link copied! Open on iPad."); }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:"white",borderRadius:14,padding:26,maxWidth:400,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.25)",textAlign:"center"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:16,fontWeight:700,color:GREEN,marginBottom:4}}>📱 Add Photos on iPad</div>
        <div style={{fontSize:13,color:"#666",marginBottom:20}}>Scan this QR code with your iPad camera, or copy the link and open it in Safari</div>

        {tooLarge ? (
          <div style={{background:"#fdf4eb",border:"1px solid #f0c070",borderRadius:10,padding:"16px",marginBottom:16,fontSize:13,color:AMBER}}>
            ⚠ Session is too large for a QR code. Use the Copy Link button and text it to your iPad instead.
          </div>
        ) : (
          <div style={{display:"inline-block",padding:12,border:"2px solid #eee",borderRadius:12,marginBottom:16}}>
            <img src={qrUrl} style={{width:180,height:180,display:"block"}} alt="QR Code"/>
          </div>
        )}

        <div style={{display:"flex",gap:8,justifyContent:"center"}}>
          <button onClick={copyLink} style={{flex:1,padding:"11px 0",borderRadius:8,fontWeight:700,fontSize:14,cursor:"pointer",background:GREEN,color:"white",border:"none",fontFamily:"inherit"}}>
            🔗 Copy Link
          </button>
          <button onClick={onClose} style={{padding:"11px 16px",borderRadius:8,fontWeight:600,fontSize:14,cursor:"pointer",background:"white",color:"#888",border:"1px solid #ddd",fontFamily:"inherit"}}>Close</button>
        </div>
        <div style={{fontSize:11,color:"#aaa",marginTop:12}}>Photos added on iPad automatically merge into the report</div>
      </div>
    </div>
  );
}


// ── Camera Barcode Scanner ─────────────────────────────────────────────────
function CameraScanner({ onScan, onClose }) {
  const videoRef = useRef();
  const streamRef = useRef();
  const intervalRef = useRef();
  const [status, setStatus] = useState("Starting camera...");
  const [camError, setCamError] = useState("");

  useEffect(() => { startCamera(); return () => stopCamera(); }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:"environment", width:{ideal:1280}, height:{ideal:720} } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); setStatus("Point camera at barcode"); }
      if ("BarcodeDetector" in window) {
        const detector = new window.BarcodeDetector({ formats:["upc_a","upc_e","ean_13","ean_8","code_128","code_39"] });
        intervalRef.current = setInterval(async () => {
          if (videoRef.current?.readyState === 4) {
            try { const codes = await detector.detect(videoRef.current); if (codes.length>0) { stopCamera(); onScan(codes[0].rawValue); } } catch(e){}
          }
        }, 300);
      } else { setStatus("Point at barcode — tap Capture when aligned"); }
    } catch(e) { setCamError("Camera access denied. Please allow camera access and try again."); }
  };
  const stopCamera = () => { if(intervalRef.current) clearInterval(intervalRef.current); streamRef.current?.getTracks().forEach(t=>t.stop()); };
  const handleCapture = () => { setStatus("Type the barcode number in the field below"); stopCamera(); onClose(); };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:2000,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"white",fontSize:14,marginBottom:12,opacity:0.8}}>{status}</div>
      {camError && <div style={{color:"#ff6b6b",fontSize:13,marginBottom:12,textAlign:"center",padding:"0 20px"}}>{camError}</div>}
      <div style={{position:"relative",width:"min(92vw,500px)",borderRadius:14,overflow:"hidden",background:"black"}}>
        <video ref={videoRef} style={{width:"100%",display:"block"}} playsInline muted autoPlay/>
        <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
          <div style={{width:"70%",height:100,border:"2px solid rgba(255,255,255,0.7)",borderRadius:8,boxShadow:"0 0 0 9999px rgba(0,0,0,0.4)"}}>
            <div style={{position:"absolute",top:"50%",left:"15%",right:"15%",height:2,background:"rgba(255,80,80,0.8)",transform:"translateY(-50%)"}}/>
          </div>
        </div>
      </div>
      <div style={{display:"flex",gap:12,marginTop:16}}>
        {!("BarcodeDetector" in window) && <button onClick={handleCapture} style={{padding:"11px 24px",borderRadius:8,background:"white",color:"#111",fontWeight:700,fontSize:14,border:"none",cursor:"pointer"}}>📸 Capture</button>}
        <button onClick={()=>{stopCamera();onClose();}} style={{padding:"11px 24px",borderRadius:8,background:"rgba(255,255,255,0.15)",color:"white",fontWeight:600,fontSize:14,border:"1px solid rgba(255,255,255,0.3)",cursor:"pointer"}}>Cancel</button>
      </div>
      <div style={{color:"rgba(255,255,255,0.4)",fontSize:11,marginTop:12}}>Auto-detects in Chrome · Safari needs manual capture</div>
    </div>
  );
}

// ── Short Resolution Modal — missing or damaged? ───────────────────────────
function ShortReasonModal({ item, itemIndex, shortage, onMissing, onDamaged, onClose }) {
  if (!item) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:"white",borderRadius:14,padding:26,maxWidth:420,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:12,color:"#888",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>⚠ Short by {shortage}</div>
        <div style={{fontSize:16,fontWeight:700,color:"#333",marginBottom:4}}>{item.description}</div>
        <div style={{fontSize:13,color:"#666",marginBottom:22}}>You received fewer than the invoice shows. Were the missing units <strong>not delivered</strong>, or did they arrive <strong>damaged</strong>?</div>
        <div style={{display:"flex",gap:10,flexDirection:"column"}}>
          <button onClick={onMissing} style={{padding:"14px 0",borderRadius:10,fontWeight:700,fontSize:15,cursor:"pointer",background:AMBER,color:"white",border:"none",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            📦 Not delivered — short shipped
          </button>
          <button onClick={onDamaged} style={{padding:"14px 0",borderRadius:10,fontWeight:700,fontSize:15,cursor:"pointer",background:RED,color:"white",border:"none",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
            🔴 Arrived damaged — take photos
          </button>
          <button onClick={onClose} style={{padding:"10px 0",borderRadius:8,fontWeight:500,fontSize:13,cursor:"pointer",background:"white",color:"#888",border:"1px solid #ddd",fontFamily:"inherit"}}>
            Cancel — go back
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Damage Modal (qty + photos) ────────────────────────────────────────────
function DamageModal({ item, itemIndex, prefillCount, onConfirm, onClose }) {
  const [damaged, setDamaged] = useState(prefillCount ? String(prefillCount) : "1");
  const [photos, setPhotos] = useState([]);
  const photoInputRef = useRef();
  const inputRef = useRef();
  useEffect(() => { if(inputRef.current) inputRef.current.focus(); }, []);
  if (!item) return null;
  const total = parseInt(item.ship_qty) || 0;
  const dmg = parseInt(damaged) || 0;
  const usable = total - dmg;

  const handlePhotoCapture = (e) => {
    Array.from(e.target.files).forEach(file => {
      const r = new FileReader();
      r.onload = ev => setPhotos(prev => [...prev, ev.target.result]);
      r.readAsDataURL(file);
    });
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:1200,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}} onClick={onClose}>
      <div style={{background:"white",borderRadius:14,padding:24,maxWidth:480,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:12,color:"#888",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>🔴 Damaged Item</div>
        <div style={{fontSize:16,fontWeight:700,color:RED,marginBottom:3}}>{item.description}</div>
        <div style={{fontFamily:"monospace",fontSize:11,color:"#aaa",marginBottom:18}}>{item.upc}</div>

        <div style={{background:"#fdf0ee",borderRadius:10,padding:"14px 16px",marginBottom:14}}>
          <div style={{fontSize:13,color:"#666",marginBottom:12}}>Invoice shows <strong>{total}</strong> unit{total!==1?"s":""}. How many arrived damaged?</div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14}}>
            <button onClick={()=>setDamaged(String(Math.max(0,dmg-1)))} style={{width:34,height:34,borderRadius:"50%",border:`1px solid ${RED}`,background:"white",color:RED,fontSize:18,cursor:"pointer",fontWeight:700}}>−</button>
            <input ref={inputRef} type="number" min="0" max={total} value={damaged} onChange={e=>setDamaged(e.target.value)}
              style={{width:76,fontSize:30,fontWeight:800,fontFamily:"monospace",textAlign:"center",border:`2px solid ${RED}`,borderRadius:8,padding:"4px 6px",outline:"none",color:RED}}/>
            <button onClick={()=>setDamaged(String(Math.min(total,dmg+1)))} style={{width:34,height:34,borderRadius:"50%",border:`1px solid ${RED}`,background:"white",color:RED,fontSize:18,cursor:"pointer",fontWeight:700}}>+</button>
          </div>
          <div style={{textAlign:"center",fontSize:12,color:"#888",marginTop:8}}>bags damaged</div>
        </div>

        {dmg>0&&dmg<=total&&<div style={{background:"#fff8f0",border:`1px solid ${AMBER}`,borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:13,color:AMBER}}><strong>{usable}</strong> usable · <strong>{dmg}</strong> damaged</div>}

        <div style={{marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:8}}>📸 Damage Photos <span style={{fontSize:11,fontWeight:400,color:"#888"}}>(helps process vendor credits)</span></div>
          {photos.length>0&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:10}}>
              {photos.map((src,idx)=>(
                <div key={idx} style={{position:"relative",aspectRatio:"1",borderRadius:8,overflow:"hidden",border:"1px solid #ddd"}}>
                  <img src={src} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="damage"/>
                  <button onClick={()=>setPhotos(prev=>prev.filter((_,i)=>i!==idx))} style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,0.6)",color:"white",border:"none",borderRadius:"50%",width:22,height:22,fontSize:12,cursor:"pointer"}}>✕</button>
                </div>
              ))}
            </div>
          )}
          <button onClick={()=>photoInputRef.current.click()}
            style={{width:"100%",padding:"10px 0",borderRadius:8,border:`1px dashed ${RED}`,background:"#fdf8f8",color:RED,fontWeight:600,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            📷 Take Photo{photos.length>0?` (${photos.length} taken)`:""}
          </button>
          <input ref={photoInputRef} type="file" accept="image/*" capture="environment" multiple style={{display:"none"}} onChange={handlePhotoCapture}/>
          {photos.length===0&&<div style={{fontSize:11,color:"#aaa",marginTop:5,textAlign:"center"}}>Opens camera on iPad · Speeds up vendor credit</div>}
        </div>

        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>{ if(dmg<=total) onConfirm(itemIndex, dmg, total, photos); }}
            style={{flex:1,padding:"11px 0",borderRadius:8,fontWeight:700,fontSize:14,cursor:"pointer",background:RED,color:"white",border:"none",fontFamily:"inherit"}}>
            ✓ Confirm {photos.length>0?`with ${photos.length} photo${photos.length>1?"s":""}`:"Damage"}
          </button>
          <button onClick={onClose} style={{padding:"11px 16px",borderRadius:8,fontWeight:600,fontSize:14,cursor:"pointer",background:"white",color:"#888",border:"1px solid #ddd",fontFamily:"inherit"}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}


// ── Fuzzy Search Modal — when UPC not found on invoice ────────────────────
function FuzzySearchModal({ manifest, onSelect, onClose }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef();
  useEffect(() => { if(inputRef.current) inputRef.current.focus(); }, []);

  const results = query.length > 1 ? (manifest?.items || [])
    .map((item, i) => ({ item, i, score: query.toLowerCase().split(" ")
      .filter(w => w.length > 1)
      .reduce((s, w) => s + (item.description.toLowerCase().includes(w) ? 1 : 0), 0) }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8) : [];

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",zIndex:1500,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"60px 16px 16px"}} onClick={onClose}>
      <div style={{background:"white",borderRadius:14,padding:22,maxWidth:520,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:13,color:"#888",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>⚠ UPC Not Found on Invoice</div>
        <div style={{fontSize:15,fontWeight:700,color:"#333",marginBottom:4}}>Search by product description</div>
        <div style={{fontSize:13,color:"#666",marginBottom:14}}>Type part of the product name to find it — the UPC on the bag may not match the invoice</div>
        <input
          ref={inputRef}
          placeholder="e.g. open farm beef, orijen large breed..."
          value={query}
          onChange={e=>setQuery(e.target.value)}
          style={{width:"100%",padding:"11px 14px",border:`2px solid ${AMBER}`,borderRadius:8,fontSize:14,fontFamily:"inherit",outline:"none",marginBottom:12}}
        />
        {results.length > 0 && (
          <div style={{border:"1px solid #eee",borderRadius:8,overflow:"hidden",marginBottom:8}}>
            {results.map(({item, i}) => (
              <button key={i} onClick={() => onSelect(item, i)}
                style={{width:"100%",padding:"11px 14px",textAlign:"left",background:"white",border:"none",borderBottom:"1px solid #f0f0f0",cursor:"pointer",fontFamily:"inherit",display:"block"}}>
                <div style={{fontWeight:600,fontSize:13,color:"#333"}}>{item.description}</div>
                <div style={{fontSize:11,color:"#aaa",marginTop:2,display:"flex",gap:10}}>
                  <span style={{fontFamily:"monospace"}}>{item.upc}</span>
                  <span>Invoice qty: {item.ship_qty}</span>
                  <span>${item.net_price}</span>
                </div>
              </button>
            ))}
          </div>
        )}
        {query.length > 1 && results.length === 0 && (
          <div style={{textAlign:"center",padding:"16px 0",color:"#aaa",fontSize:13}}>No matches found — try different keywords</div>
        )}
        <button onClick={onClose} style={{width:"100%",padding:"10px 0",borderRadius:8,fontWeight:600,fontSize:13,cursor:"pointer",background:"white",color:"#888",border:"1px solid #ddd",fontFamily:"inherit"}}>
          Cancel — go back
        </button>
      </div>
    </div>
  );
}

// ── Scan Confirm Modal ─────────────────────────────────────────────────────
function ScanModal({ item, itemIndex, onConfirm, onClose }) {
  const [received, setReceived] = useState(item ? String(item.ship_qty) : "");
  const inputRef = useRef();
  useEffect(() => { if(inputRef.current) inputRef.current.focus(); }, []);
  if (!item) return null;
  const expected = parseInt(item.ship_qty)||0;
  const got = parseInt(received)||0;
  const diff = got - expected;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:"white",borderRadius:14,padding:24,maxWidth:430,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.2)"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:12,color:"#888",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>Item Scanned</div>
        <div style={{fontSize:16,fontWeight:700,color:GREEN,marginBottom:3}}>{item.description}</div>
        <div style={{fontFamily:"monospace",fontSize:11,color:"#aaa",marginBottom:18}}>{item.upc}</div>
        <div style={{background:"#eef4ef",borderRadius:10,padding:"14px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:11,color:"#888",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>Invoice Says</div>
            <div style={{fontSize:32,fontWeight:800,color:GREEN,fontFamily:"monospace"}}>{item.ship_qty}</div>
          </div>
          <div style={{fontSize:24,color:"#c2d9c5"}}>→</div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:11,color:"#888",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4}}>You Received</div>
            <input ref={inputRef} type="number" value={received} onChange={e=>setReceived(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter") onConfirm(itemIndex, got, expected); }}
              style={{width:86,fontSize:32,fontWeight:800,fontFamily:"monospace",textAlign:"center",border:`2px solid ${diff<0?RED:diff>0?AMBER:GREEN}`,borderRadius:8,padding:"4px 6px",outline:"none",color:diff<0?RED:diff>0?AMBER:GREEN}}/>
          </div>
        </div>
        {diff<0&&<div style={{background:"#fdf0ee",border:`1px solid ${RED}`,borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:13,color:RED,fontWeight:600}}>⚠ {Math.abs(diff)} unit{Math.abs(diff)>1?"s":""} short — next you'll tell us why</div>}
        {diff>0&&<div style={{background:"#f3eef9",border:`1px solid ${PURPLE}`,borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:13,color:PURPLE,fontWeight:600}}>⚠ {diff} extra unit{diff>1?"s":""} — will be noted in inventory only, not emailed to vendor</div>}
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>onConfirm(itemIndex, got, expected)} style={{flex:1,padding:"11px 0",borderRadius:8,fontWeight:700,fontSize:14,cursor:"pointer",background:GREEN,color:"white",border:"none",fontFamily:"inherit"}}>✓ Confirm</button>
          <button onClick={onClose} style={{padding:"11px 16px",borderRadius:8,fontWeight:600,fontSize:14,cursor:"pointer",background:"white",color:"#888",border:"1px solid #ddd",fontFamily:"inherit"}}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("upload");
  const [manifest, setManifest] = useState(null);
  const [lastPrices, setLastPrices] = useState({}); // upc -> last net price
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const [flags, setFlags] = useState({});           // index -> 'damaged'|'short'|'wrong'|'extra'|null
  const [receivedQty, setReceivedQty] = useState({});
  const [damagedQty, setDamagedQty] = useState({});
  const [damagePhotos, setDamagePhotos] = useState({});
  const [specials, setSpecials] = useState({});
  const [checkedIn, setCheckedIn] = useState({});
  const [orders, setOrders] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ff_special_orders_v2") || "[]"); } catch(e) { return []; }
  });
  const [report, setReport] = useState(null);
  const [soForm, setSoForm] = useState({name:"",phone:"",product:"",distributor:"Newco",notes:""});
  const [scanModal, setScanModal] = useState(null);
  const [shortModal, setShortModal] = useState(null); // {item, index, shortage}
  const [damageModal, setDamageModal] = useState(null);
  const [shareModal, setShareModal] = useState(false);
  const [addPhotosModal, setAddPhotosModal] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [fuzzyModal, setFuzzyModal] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const [scanBuffer, setScanBuffer] = useState("");
  const [lastScanTime, setLastScanTime] = useState(0);
  const [scanFlash, setScanFlash] = useState(false);
  const [creditMemo, setCreditMemo] = useState(null); // {vendor, invoice_number, date, items, total, program}
  const [creditLog, setCreditLog] = useState(() => {
    try { return JSON.parse(localStorage.getItem("ff_credit_log") || "[]"); } catch(e) { return []; }
  });
  const fileRef = useRef();

  // Load saved prices from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("ff_last_prices");
    if (saved) try { setLastPrices(JSON.parse(saved)); } catch(e){}
  }, []);

  // Load shared session from URL (iPad photo-add flow)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get("session");
    if (sessionParam) {
      try {
        const session = JSON.parse(decodeURIComponent(sessionParam));
        if (session.items) {
          setManifest({ invoice_number: session.invoice_number, ship_date: session.ship_date, invoice_total: session.invoice_total, distributor: session.distributor, items: session.items, cancelled_items: session.cancelled_items || [], priceChanges: session.priceChanges || [] });
          setFlags(session.flags || {});
          setReceivedQty(session.receivedQty || {});
          setDamagedQty(session.damagedQty || {});
          setDamagePhotos(session.damagePhotos || {});
          setCheckedIn(session.checkedIn || {});
          setSpecials(session.specials || {});
          setAddPhotosModal(true);
          setTab("checkin");
        }
      } catch(e) { console.error("Failed to load session:", e); }
    }
  }, []);

  // USB scanner keyboard listener
  useEffect(() => {
    const handleKey = (e) => {
      if (tab!=="checkin"||!manifest) return;
      const tag = document.activeElement?.tagName;
      if (tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT") return;
      const now = Date.now();
      if (now-lastScanTime>300) { setScanBuffer(e.key==="Enter"?"":e.key); }
      else { setScanBuffer(prev => { if(e.key==="Enter"&&prev.length>3){handleBarcodeScan(prev);return "";} return prev+e.key; }); }
      setLastScanTime(now);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [tab, manifest, lastScanTime]);

  const handleBarcodeScan = useCallback((barcode) => {
    if (!manifest?.items) return;
    const clean = barcode.trim();
    const idx = manifest.items.findIndex(item =>
      item.upc===clean || item.upc?.replace(/^0+/,"")===clean.replace(/^0+/,"") || item.item_id===clean
    );
    if (idx>=0) {
      setScanFlash(true); setTimeout(()=>setScanFlash(false),400);
      setScanModal({item:manifest.items[idx],index:idx});
    } else {
      // UPC not found — open fuzzy search so staff can find it by description
      setFuzzyModal(true);
    }
  }, [manifest]);

  const handleManualScan = () => { if(manualBarcode.trim()){handleBarcodeScan(manualBarcode.trim());setManualBarcode("");} };
  const handleCameraScan = (barcode) => { setCameraOpen(false); handleBarcodeScan(barcode); };

  // After scan confirm — if short, ask why
  const handleScanConfirm = (idx, got, expected) => {
    setScanModal(null);
    setReceivedQty(prev=>({...prev,[idx]:got}));
    setCheckedIn(prev=>({...prev,[idx]:true}));
    if (got < expected) {
      const shortage = expected - got;
      setShortModal({item:manifest.items[idx], index:idx, shortage});
    } else if (got > expected) {
      setFlags(prev=>({...prev,[idx]:"extra"}));
    } else {
      setFlags(prev=>({...prev,[idx]:null}));
    }
  };

  // Short reason: missing
  const handleShortMissing = () => {
    if (!shortModal) return;
    setFlags(prev=>({...prev,[shortModal.index]:"short"}));
    setShortModal(null);
  };

  // Short reason: damaged — open damage modal
  const handleShortDamaged = () => {
    if (!shortModal) return;
    const {item, index, shortage} = shortModal;
    setShortModal(null);
    setDamageModal({item, index, prefillCount: shortage});
  };

  const handleDamageConfirm = (idx, dmgCount, total, photos) => {
    setDamageModal(null);
    setDamagedQty(prev=>({...prev,[idx]:dmgCount}));
    setDamagePhotos(prev=>({...prev,[idx]:photos}));
    setFlags(prev=>({...prev,[idx]:"damaged"}));
  };

  // File handling
  const toBase64 = (file) => new Promise((res,rej)=>{ const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=()=>rej(new Error("Read failed"));r.readAsDataURL(file); });

  const repairJSON = (text) => {
    let s=text.trim();
    s=s.replace(/,\s*"[^"]*"?\s*:\s*"[^"]*$/,"");s=s.replace(/,\s*"[^"]*"?\s*:\s*$/,"");s=s.replace(/,\s*"[^"]*$/,"");s=s.replace(/,\s*$/,"");
    let opens=0,objs=0;for(const ch of s){if(ch==="[")opens++;else if(ch==="]")opens--;else if(ch==="{")objs++;else if(ch==="}")objs--;}
    while(objs>0){s+="}";objs--;}while(opens>0){s+="]";opens--;}return s;
  };

  const handleFile = async (file) => {
    if(!file||file.type!=="application/pdf"){setError("Please upload a PDF file.");return;}
    setError("");setLoading(true);setLoadingMsg("Reading PDF...");
    try {
      const b64 = await toBase64(file);
      setLoadingMsg("AI parsing manifest — about 20 seconds...");
      const prompt = `Parse this distributor invoice PDF for a retail feed store. Return ONLY valid JSON, no markdown.

{"invoice_number":"string","ship_date":"string","invoice_total":"string","distributor":"string","items":[{"upc":"string","item_id":"string","description":"string","ord_qty":"string","ship_qty":"string","net_price":"string","extended":"string"}],"cancelled_items":[{"description":"string","ord_qty":"string"}]}

Rules:
- Include ALL shipped items in the items array
- For Newco invoices: ord_qty = ORD QTY column, ship_qty = SHIP QTY column. Items with Cancel in SHIP QTY go in cancelled_items.
- For VSI invoices: ord_qty = QTY OPEN column, ship_qty = SHIP QTY column. Items where SHIP QTY is 0 or blank go in cancelled_items. Skip fuel surcharge and misc charge lines.
- For Phillips Pet Food invoices: The QUANTITY block has two numbers — first is ORDER qty, second is SHIPPED qty. ord_qty = ORDER, ship_qty = SHIPPED. Items where SHIPPED = 0 go in cancelled_items. Descriptions may wrap to a second line — concatenate them into one description. Expand common abbreviations: TOW = Taste of the Wild, DIA NAT = Diamond Naturals, NB LID = Natural Balance Lid, CNNE = Canine, CKN = Chicken, LMB = Lamb, BSN = Bison, VNS = Venison, FELN = Feline, PUP = Puppy, ADLT = Adult, SM BRD = Small Breed, LG BRD = Large Breed, RBBT = Rabbit, ALF = Alfalfa, THAY = Timothy Hay, GF = Grain Free, RC = Rice. Strip notes like "*REPL 404020", "*IF OS USE...", "- This Items Order Quantity Increased to Meet Minimum -". Skip fuel surcharge lines and the Open Recap page (page 4 with account balance summary). Invoice total = ** TOTAL ** value on last invoice page.
- Strip item codes from start of descriptions (e.g. "115174 PINK EYE SPRAY" -> description = "PINK EYE SPRAY 16oz VETERICYN")
- Quantities as numbers only — no "EA", "CS", "PK" suffixes
- distributor field: set to "Newco" if Newco invoice, "VSI" if Veterinary Service Inc invoice, "Phillips" if Phillips Pet Food invoice, otherwise "Other"
- Return ONLY the JSON object, nothing else`;
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:8000,messages:[{role:"user",content:[{type:"document",source:{type:"base64",media_type:"application/pdf",data:b64}},{type:"text",text:prompt}]}]})});
      const data = await res.json();
      if(!res.ok) throw new Error(data.error?.message||"API error");
      let raw = data.content.map(b=>b.text||"").join("").replace(/```json|```/g,"").trim();
      let parsed;
      try { parsed=JSON.parse(raw); } catch(e1) { try { parsed=JSON.parse(repairJSON(raw)); setError("⚠ Invoice very long — verify last few items."); } catch(e2) { throw new Error("Could not parse manifest. Please try again."); } }

      // ── Credit memo detection ─────────────────────────────────────────────
      // Detect by: negative invoice total, all-negative quantities, or "CREDIT MEMO" in raw text
      const rawUpper = raw.toUpperCase();
      const totalNum = parseFloat(parsed.invoice_total) || 0;
      const allNegativeQty = (parsed.items||[]).length > 0 && (parsed.items||[]).every(item => parseFloat(item.ship_qty) < 0 || parseFloat(item.ord_qty) < 0);
      const isCreditMemo = rawUpper.includes("CREDIT MEMO") || totalNum < 0 || allNegativeQty;

      if (isCreditMemo) {
        // Normalize quantities to positive for display
        const creditItems = (parsed.items||[]).map(item => ({
          ...item,
          ship_qty: String(Math.abs(parseFloat(item.ship_qty)||0)),
          ord_qty: String(Math.abs(parseFloat(item.ord_qty)||0)),
          net_price: item.net_price,
          extended: String(Math.abs(parseFloat(item.extended)||0)),
        }));
        const creditEntry = {
          id: Date.now().toString(),
          vendor: parsed.distributor || "Unknown",
          invoice_number: parsed.invoice_number,
          date: parsed.ship_date || new Date().toLocaleDateString(),
          program: parsed.customer_po || "",
          items: creditItems,
          total: Math.abs(totalNum).toFixed(2),
          loggedAt: new Date().toISOString(),
        };
        // Save to credit log
        const updatedLog = [creditEntry, ...creditLog];
        setCreditLog(updatedLog);
        localStorage.setItem("ff_credit_log", JSON.stringify(updatedLog));
        setCreditMemo(creditEntry);
        setTab("upload"); // stay on upload tab — show credit memo screen instead
        setLoading(false);
        return; // stop — do NOT proceed to delivery flow
      }

      // Detect price changes vs last invoice
      const newLastPrices = {...lastPrices};
      const priceChanges = [];
      (parsed.items||[]).forEach(item => {
        if (!item.upc) return;
        const current = parseFloat(item.net_price)||0;
        const previous = lastPrices[item.upc];
        if (previous && current > previous) {
          priceChanges.push({ description: item.description, upc: item.upc, previous: previous.toFixed(2), current: current.toFixed(2), change: (current-previous).toFixed(2), pct: (((current-previous)/previous)*100).toFixed(1) });
        }
        newLastPrices[item.upc] = current;
      });
      setLastPrices(newLastPrices);
      localStorage.setItem("ff_last_prices", JSON.stringify(newLastPrices));

      setManifest({...parsed, priceChanges});
      const autoFlags={};
      (parsed.items||[]).forEach((item,i)=>{ if(parseInt(item.ord_qty)>parseInt(item.ship_qty)) autoFlags[i]="short"; });
      setFlags(autoFlags);setReceivedQty({});setDamagedQty({});setDamagePhotos({});setCheckedIn({});setSpecials({});setReport(null);
      setTab("checkin");
    } catch(e){setError("Error: "+e.message);}
    finally{setLoading(false);}
  };

  const toggleFlag = (i, type) => setFlags(prev=>({...prev,[i]:prev[i]===type?null:type}));
  const toggleSpecial = (i, checked) => setSpecials(prev=>({...prev,[i]:checked}));
  const addOrder = () => {
    if(!soForm.name||!soForm.product) return;
    const newOrder = {
      id: Date.now().toString(),
      customerName: soForm.name, phone: soForm.phone, email: "", product: soForm.product,
      distributor: soForm.distributor, notes: soForm.notes, depositTaken: false, depositAmount: "",
      status: "pending", deadlineDate: null, createdAt: new Date().toISOString(),
      createdBy: "Staff", arrivedAt: null
    };
    const updated = [newOrder, ...orders];
    setOrders(updated);
    localStorage.setItem("ff_special_orders_v2", JSON.stringify(updated));
    setSoForm({name:"",phone:"",product:"",distributor:"Newco",notes:""});
  };
  const deleteOrder = (id) => {
    const updated = orders.filter(o=>o.id!==id);
    setOrders(updated);
    localStorage.setItem("ff_special_orders_v2", JSON.stringify(updated));
  };
  const markArrived = (id) => {
    const updated = orders.map(o => o.id===id ? {...o, status:"arrived", arrivedAt:new Date().toISOString()} : o);
    setOrders(updated);
    localStorage.setItem("ff_special_orders_v2", JSON.stringify(updated));
  };

  // Build shareable session object
  const getSession = () => ({
    invoice_number: manifest?.invoice_number,
    ship_date: manifest?.ship_date,
    invoice_total: manifest?.invoice_total,
    distributor: manifest?.distributor,
    items: manifest?.items || [],
    cancelled_items: manifest?.cancelled_items || [],
    priceChanges: manifest?.priceChanges || [],
    flags, receivedQty, damagedQty, damagePhotos, checkedIn, specials
  });

  const generateReport = () => {
    const items = manifest?.items||[];
    if(items.length===0) return;
    const flaggedItems=[],specialItems=[],shelfItems=[];
    items.forEach((item,i)=>{
      const entry={item,i,flag:flags[i]||null,actualQty:receivedQty[i]!==undefined?receivedQty[i]:parseInt(item.ship_qty),checkedIn:!!checkedIn[i],dmgCount:damagedQty[i]||0,photos:damagePhotos[i]||[]};
      if(flags[i]) flaggedItems.push(entry);
      if(specials[i]) specialItems.push(entry); else shelfItems.push(entry);
    });
    const cancelled=manifest?.cancelled_items||[];
    const priceChanges=manifest?.priceChanges||[];
    const today=new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});

    // Vendor email — NO extras, only genuine issues
    let vendorEmail=`Hi,\n\nPlease see the following exceptions from our delivery today (${today}), Invoice #${manifest?.invoice_number}:\n\n`;
    const short=flaggedItems.filter(x=>x.flag==="short");
    const damaged=flaggedItems.filter(x=>x.flag==="damaged");
    const wrong=flaggedItems.filter(x=>x.flag==="wrong");
    // extras intentionally excluded from vendor email
    if(short.length){vendorEmail+=`SHORT SHIPPED:\n`;short.forEach(x=>{const act=receivedQty[x.i]!==undefined?receivedQty[x.i]:parseInt(x.item.ship_qty);vendorEmail+=`  • ${x.item.description} — invoice says ${x.item.ship_qty}, received ${act}\n`;});vendorEmail+="\n";}
    if(damaged.length){vendorEmail+=`DAMAGED ON ARRIVAL:\n`;damaged.forEach(x=>{const p=damagePhotos[x.i]||[];vendorEmail+=`  • ${x.item.description} — ${x.dmgCount} of ${x.item.ship_qty} bag${parseInt(x.item.ship_qty)!==1?"s":""} damaged${p.length>0?` (${p.length} photo${p.length>1?"s":""} attached)`:""}\n`;});vendorEmail+="\n";}
    if(wrong.length){vendorEmail+=`WRONG ITEM RECEIVED:\n`;wrong.forEach(x=>{vendorEmail+=`  • ${x.item.description}\n`;});vendorEmail+="\n";}
    const vendorInfo = VENDORS[manifest?.distributor] || VENDORS["Other"];
    if(short.length||damaged.length||wrong.length) vendorEmail+=`Please advise on credit or replacement.\n\nThank you,\nFoothill Feed\n3293 Taylor Rd, Loomis CA 95650\n(916) 652-7121\norders@foothillfeedloomis.com`;

    // Price change email to owner
    let priceEmail="";
    if(priceChanges.length>0){
      priceEmail=`Hi Jeff,\n\nThe following items had price increases on today's delivery (${today}), Invoice #${manifest?.invoice_number}. Please update retail pricing before these items go on the shelf:\n\n`;
      priceChanges.forEach(pc=>{priceEmail+=`  • ${pc.description}\n    Previous cost: $${pc.previous} → New cost: $${pc.current} (+$${pc.change} / +${pc.pct}%)\n\n`;});
      priceEmail+=`Please review and update shelf prices accordingly.\n\nFoothill Feed Delivery System`;
    }

    setReport({items,flaggedItems,specialItems,shelfItems,cancelled,priceChanges,vendorEmail,priceEmail,today});
    setTab("report");
  };

  const pendingOrders=orders.filter(o=>o.status==="pending"||(o.status===undefined&&!o.arrived));
  const checkedInCount=Object.keys(checkedIn).length;
  const totalItems=manifest?.items?.length||0;
  const priceChangeCount=manifest?.priceChanges?.length||0;

  // Style helpers
  const tabSty=(t)=>({padding:"12px 16px",fontSize:13,fontWeight:500,color:tab===t?GREEN:"#888",cursor:"pointer",borderBottom:tab===t?`2px solid ${GREEN}`:"2px solid transparent",display:"flex",alignItems:"center",gap:6,whiteSpace:"nowrap"});
  const card={background:"white",border:"1px solid #ddd8d0",borderRadius:10,boxShadow:"0 2px 10px rgba(0,0,0,0.06)",overflow:"hidden",marginBottom:16};
  const cardH={padding:"13px 18px",borderBottom:"1px solid #ddd8d0",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#faf8f4"};
  const btn=(bg,color,border="none")=>({padding:"8px 16px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",background:bg,color,border,fontFamily:"inherit",display:"inline-flex",alignItems:"center",gap:5});
  const inp={width:"100%",padding:"9px 12px",border:"1px solid #ddd",borderRadius:8,fontSize:14,fontFamily:"inherit",background:"white",outline:"none"};
  const th={background:GREEN,color:"white",padding:"9px 12px",textAlign:"left",fontSize:11,textTransform:"uppercase",letterSpacing:"0.05em"};
  const td={padding:"9px 12px",borderBottom:"1px solid #eee",verticalAlign:"middle",fontSize:13};

  return (
    <div style={{fontFamily:"system-ui,sans-serif",background:"#faf8f4",minHeight:"100vh",color:"#1a1a1a"}}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}*{box-sizing:border-box}tr:hover td{background:#fdfcfb}`}</style>

      {cameraOpen&&<CameraScanner onScan={handleCameraScan} onClose={()=>setCameraOpen(false)}/>}
      {fuzzyModal&&<FuzzySearchModal manifest={manifest} onSelect={(item,i)=>{setFuzzyModal(false);setScanModal({item,index:i});}} onClose={()=>setFuzzyModal(false)}/>}
      {scanModal&&<ScanModal item={scanModal.item} itemIndex={scanModal.index} onConfirm={handleScanConfirm} onClose={()=>setScanModal(null)}/>}
      {shortModal&&<ShortReasonModal item={shortModal.item} itemIndex={shortModal.index} shortage={shortModal.shortage} onMissing={handleShortMissing} onDamaged={handleShortDamaged} onClose={()=>setShortModal(null)}/>}
      {damageModal&&<DamageModal item={damageModal.item} itemIndex={damageModal.index} prefillCount={damageModal.prefillCount} onConfirm={handleDamageConfirm} onClose={()=>setDamageModal(null)}/>}
      {shareModal&&<ShareSessionModal session={getSession()} onClose={()=>setShareModal(false)}/>}
      {addPhotosModal&&manifest&&<AddPhotosModal session={{...getSession(), items: manifest.items}} onSave={(newPhotos)=>{ setDamagePhotos(newPhotos); setAddPhotosModal(false); }} onClose={()=>setAddPhotosModal(false)}/>}

      {/* Header */}
      <div style={{background:scanFlash?"#5a9e66":GREEN,color:"white",padding:"13px 22px",display:"flex",alignItems:"center",justifyContent:"space-between",transition:"background 0.2s"}}>
        <div style={{fontSize:18,fontWeight:800}}>🌾 Foothill Feed <span style={{opacity:0.55,fontSize:13,fontWeight:400,marginLeft:8}}>Delivery Day</span></div>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          {tab==="checkin"&&manifest&&<div style={{fontSize:12,opacity:0.8,fontFamily:"monospace"}}>📡 {checkedInCount}/{totalItems} checked in</div>}
          {priceChangeCount>0&&<div style={{fontSize:12,background:"#b8860b",padding:"3px 10px",borderRadius:20,fontWeight:600}}>⚠ {priceChangeCount} price change{priceChangeCount>1?"s":""}</div>}
          <div style={{fontSize:12,opacity:0.7,fontFamily:"monospace"}}>{new Date().toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"})}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{background:"white",borderBottom:"1px solid #ddd8d0",display:"flex",padding:"0 16px",gap:2,overflowX:"auto"}}>
        {[["upload","📦 Upload",null],["checkin","✅ Check-In",manifest?.items?.length],["orders","⭐ Special Orders",pendingOrders.length],["report","📋 Report",null],["credits","💳 Credits",creditLog.length||null]].map(([key,label,count])=>(
          <div key={key} style={tabSty(key)} onClick={()=>setTab(key)}>
            {label}{count>0&&<span style={{background:GREEN,color:"white",fontSize:10,padding:"2px 6px",borderRadius:10}}>{count}</span>}
          </div>
        ))}
      </div>

      <div style={{maxWidth:1060,margin:"0 auto",padding:"20px 16px"}}>

        {/* ── UPLOAD ── */}
        {tab==="upload"&&<>
          <div style={card}>
            <div style={cardH}><span style={{fontSize:16,fontWeight:700,color:GREEN}}>Upload Distributor Manifest</span><span style={{fontSize:12,color:"#888"}}>Newco · VSI · and others</span></div>
            <div style={{padding:18}}>
              {!loading?(
                <div onClick={()=>fileRef.current.click()} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files[0]);}}
                  style={{border:"2px dashed #c2d9c5",borderRadius:10,padding:"44px 24px",textAlign:"center",cursor:"pointer",background:"#eef4ef"}}>
                  <div style={{fontSize:38,marginBottom:10}}>📄</div>
                  <div style={{fontSize:17,fontWeight:700,color:GREEN,marginBottom:5}}>Drop your distributor invoice PDF here</div>
                  <div style={{fontSize:13,color:"#666"}}>Or click to browse · Invoice format supported</div>
                  <input ref={fileRef} type="file" accept=".pdf" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"center",gap:12,padding:20,color:GREEN}}>
                  <div style={{width:18,height:18,border:"2px solid #c2d9c5",borderTopColor:GREEN,borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
                  <span style={{fontSize:14}}>{loadingMsg}</span>
                </div>
              )}
              {error&&<div style={{color:RED,padding:"10px 0",fontSize:13}}>⚠ {error}</div>}
            </div>
          </div>
          {/* ── Credit memo intercept screen ── */}
          {creditMemo&&(
            <div style={{...card,border:"2px solid #4a90a4",overflow:"hidden",marginBottom:16}}>
              <div style={{background:"#e8f4f8",borderBottom:"2px solid #4a90a4",padding:"14px 20px",display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:28}}>💳</span>
                <div>
                  <div style={{fontSize:16,fontWeight:800,color:"#2c6e8a"}}>Credit Memo Detected — Not a Delivery</div>
                  <div style={{fontSize:13,color:"#4a7f96",marginTop:2}}>This document has been logged to your Credits tab. No delivery action needed.</div>
                </div>
              </div>
              <div style={{padding:"16px 20px"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
                  {[["Vendor",creditMemo.vendor],["Invoice #",creditMemo.invoice_number],["Date",creditMemo.date],["Credit Total","$"+creditMemo.total]].map(([label,val])=>(
                    <div key={label} style={{background:"#f0f8fc",border:"1px solid #b8dce8",borderRadius:8,padding:"10px 14px"}}>
                      <div style={{fontSize:10,color:"#7aabbc",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>{label}</div>
                      <div style={{fontSize:14,fontWeight:700,color:"#2c6e8a",fontFamily:"monospace"}}>{val}</div>
                    </div>
                  ))}
                </div>
                {creditMemo.program&&(
                  <div style={{background:"#f0f8fc",border:"1px solid #b8dce8",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:13,color:"#2c6e8a"}}>
                    <span style={{fontWeight:700}}>Program / PO: </span>{creditMemo.program}
                  </div>
                )}
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:14}}>
                  <thead><tr>{["Product","UPC","Qty","Net Price","Credit Amount"].map(h=><th key={h} style={{...th,background:"#4a90a4"}}>{h}</th>)}</tr></thead>
                  <tbody>{creditMemo.items.map((item,i)=>(
                    <tr key={i}>
                      <td style={{...td,fontWeight:600}}>{item.description}</td>
                      <td style={{...td,fontFamily:"monospace",fontSize:11,color:"#888"}}>{item.upc}</td>
                      <td style={{...td,fontFamily:"monospace"}}>{item.ship_qty}</td>
                      <td style={{...td,fontFamily:"monospace"}}>${item.net_price}</td>
                      <td style={{...td,fontFamily:"monospace",fontWeight:700,color:"#2c6e8a"}}>${item.extended}</td>
                    </tr>
                  ))}</tbody>
                </table>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <div style={{background:"#d4edee",border:"1px solid #4a90a4",borderRadius:8,padding:"10px 16px",fontSize:13,color:"#2c6e8a",fontWeight:600,flex:1}}>
                    ✅ Credit of <strong>${creditMemo.total}</strong> logged to Credits tab on {new Date(creditMemo.loggedAt).toLocaleDateString()}
                  </div>
                  <button onClick={()=>setCreditMemo(null)} style={{...btn("white","#888","1px solid #ddd")}}>Dismiss</button>
                  <button onClick={()=>{setCreditMemo(null);setTab("credits");}} style={{...btn("#4a90a4","white")}}>View Credits Log →</button>
                </div>
              </div>
            </div>
          )}

          {!creditMemo&&(
          <div style={card}>
            <div style={cardH}><span style={{fontSize:16,fontWeight:700,color:GREEN}}>How it works</span></div>
            <div style={{padding:18,display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,textAlign:"center"}}>
              {[["📄","1. Upload","Drop the PDF invoice"],["🤖","2. AI reads it","Items, prices & changes detected"],["📡","3. Scan & check","Camera, USB, or manual"],["📋","4. Report","Call list · shelf · vendor · price emails"]].map(([icon,t,d])=>(
                <div key={t} style={{padding:14}}><div style={{fontSize:28,marginBottom:8}}>{icon}</div><div style={{fontWeight:700,marginBottom:4,fontSize:13}}>{t}</div><div style={{fontSize:12,color:"#888"}}>{d}</div></div>
              ))}
            </div>
          </div>
          )}
        </>}

        {/* ── CHECK-IN ── */}
        {tab==="checkin"&&<>
          {!manifest?(
            <div style={{textAlign:"center",padding:"48px 24px",color:"#888"}}><div style={{fontSize:36}}>📦</div><h3 style={{marginTop:10}}>No manifest loaded</h3><p>Upload a PDF first</p></div>
          ):<>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:14}}>
              {[["Invoice #",manifest.invoice_number],["Ship Date",manifest.ship_date],["Items",manifest.items?.length],["Invoice Total","$"+manifest.invoice_total]].map(([label,val])=>(
                <div key={label} style={{background:"#eef4ef",border:"1px solid #c2d9c5",borderRadius:8,padding:"10px 14px"}}>
                  <div style={{fontSize:10,color:"#888",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>{label}</div>
                  <div style={{fontSize:15,fontWeight:700,color:GREEN,fontFamily:"monospace"}}>{val}</div>
                </div>
              ))}
            </div>

            {/* Price change alert */}
            {priceChangeCount>0&&(
              <div style={{background:"#fff8e1",border:"1px solid #f0c040",borderRadius:10,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:20}}>💰</span>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:"#b8860b"}}>{priceChangeCount} price increase{priceChangeCount>1?"s":""} detected on this delivery</div>
                  <div style={{fontSize:12,color:"#888",marginTop:2}}>See Report tab for full details and owner email · Items are flagged below</div>
                </div>
              </div>
            )}

            {error&&<div style={{background:"#fdf4eb",border:"1px solid #f0c070",borderRadius:8,padding:"10px 14px",fontSize:13,color:AMBER,marginBottom:14}}>{error}</div>}

            {/* Scanner bar */}
            <div style={{background:"white",border:"1px solid #ddd8d0",borderRadius:10,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:18}}>📡</span>
              <div style={{fontSize:13,fontWeight:600,color:GREEN}}>Barcode Scanner</div>
              <div style={{fontSize:12,color:"#888",flex:1,minWidth:120}}>USB auto-detects · camera or manual below</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button onClick={()=>setCameraOpen(true)} style={{...btn("#eef4ef",GREEN,`1px solid #c2d9c5`)}}>📷 Camera</button>
                <button onClick={()=>setFuzzyModal(true)} style={{...btn("#fdf4eb",AMBER,`1px solid #f0c070`)}}>🔍 Not on invoice?</button>
                <input placeholder="Type UPC..." value={manualBarcode} onChange={e=>setManualBarcode(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")handleManualScan();}}
                  style={{padding:"7px 10px",border:"1px solid #ddd",borderRadius:8,fontSize:13,fontFamily:"monospace",width:150,outline:"none"}}/>
                <button onClick={handleManualScan} style={btn(GREEN,"white")}>Look Up</button>
              </div>
            </div>

            {/* Progress */}
            {totalItems>0&&(
              <div style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"#888",marginBottom:4}}>
                  <span>Check-in progress</span><span>{checkedInCount} of {totalItems} confirmed</span>
                </div>
                <div style={{background:"#eee",borderRadius:99,height:6}}>
                  <div style={{background:GREEN,height:6,borderRadius:99,width:`${totalItems>0?(checkedInCount/totalItems)*100:0}%`,transition:"width 0.3s"}}/>
                </div>
              </div>
            )}

            <div style={card}>
              <div style={cardH}>
                <span style={{fontSize:16,fontWeight:700,color:GREEN}}>Delivery Check-In</span>
                <div style={{display:"flex",gap:8}}>
                  <button style={btn("white",GREEN,`1px solid ${GREEN}`)} onClick={()=>{setFlags({});setReceivedQty({});setCheckedIn({});setDamagedQty({});setDamagePhotos({});}}>Reset</button>
                  <button style={btn("white","#b8860b",`1px solid #b8860b`)} onClick={()=>setShareModal(true)}>📱 Add Photos on iPad</button>
                  <button style={btn(GREEN,"white")} onClick={generateReport}>Generate Report →</button>
                </div>
              </div>
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead><tr>{["","Product","Invoice","Received","Status","Issue Flag","Special?"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {manifest.items.map((item,i)=>{
                      const invoiceQty=parseInt(item.ship_qty)||0;
                      const actualQty=receivedQty[i]!==undefined?receivedQty[i]:invoiceQty;
                      const isChecked=!!checkedIn[i];
                      const flag=flags[i];
                      const diff=actualQty-invoiceQty;
                      const photoCount=(damagePhotos[i]||[]).length;
                      const priceChange=(manifest.priceChanges||[]).find(pc=>pc.upc===item.upc);
                      const matched=orders.find(o=>o.status!=="arrived"&&(o.product||o.name||"").toLowerCase().split(" ").some(w=>w.length>3&&item.description.toLowerCase().includes(w)));
                      return(
                        <tr key={i} style={{background:isChecked?"#f6fbf6":i%2===0?"white":"#fdfcfb"}}>
                          <td style={{...td,width:36,textAlign:"center"}}>
                            {isChecked?<span style={{color:GREEN,fontSize:16}}>✓</span>
                              :<button onClick={()=>setScanModal({item,index:i})} style={{background:"none",border:"1px solid #ddd",borderRadius:6,cursor:"pointer",fontSize:11,padding:"3px 7px",color:"#888"}}>check</button>}
                          </td>
                          <td style={td}>
                            <div style={{fontWeight:600}}>{item.description}</div>
                            <div style={{display:"flex",gap:6,marginTop:3,flexWrap:"wrap"}}>
                              <span style={{fontFamily:"monospace",fontSize:11,color:"#aaa"}}>{item.upc}</span>
                              {priceChange&&<span style={{fontSize:11,background:"#fff8e1",color:"#b8860b",padding:"1px 6px",borderRadius:10,fontWeight:600}}>💰 +${priceChange.change} price increase</span>}
                            </div>
                          </td>
                          <td style={{...td,fontFamily:"monospace",fontWeight:600}}>{item.ship_qty}</td>
                          <td style={{...td,fontFamily:"monospace"}}>
                            {isChecked?<span style={{color:diff<0?RED:diff>0?PURPLE:GREEN,fontWeight:700}}>{actualQty}</span>:"—"}
                          </td>
                          <td style={td}>
                            {isChecked
                              ? diff<0?<Badge type="short">Short {Math.abs(diff)}</Badge>
                                :diff>0?<Badge type="extra">+{diff} extra</Badge>
                                :<Badge type="ok">✓ Match</Badge>
                              : <Badge type="ok">Expected {item.ship_qty}</Badge>
                            }
                          </td>
                          <td style={td}>
                            <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                              <button onClick={()=>{ if(flag==="damaged"){setFlags(p=>({...p,[i]:null}));setDamagedQty(p=>({...p,[i]:0}));setDamagePhotos(p=>({...p,[i]:[]}));} else setDamageModal({item,index:i,prefillCount:null}); }}
                                style={{padding:"3px 9px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",border:`1px solid ${flag==="damaged"?RED:"#ddd"}`,background:flag==="damaged"?"#fdf0ee":"white",color:flag==="damaged"?RED:"#888",fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}}>
                                🔴 Damaged{flag==="damaged"&&<span style={{fontSize:10}}>({damagedQty[i]||0}{photoCount>0?` · ${photoCount}📷`:""})</span>}
                              </button>
                              {[["short","🟡 Short",AMBER,"#fdf4eb"],["wrong","🔵 Wrong",BLUE,"#edf3f9"]].map(([type,label,col,bg])=>(
                                <button key={type} onClick={()=>toggleFlag(i,type)} style={{padding:"3px 9px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",border:`1px solid ${flag===type?col:"#ddd"}`,background:flag===type?bg:"white",color:flag===type?col:"#888",fontFamily:"inherit"}}>{label}</button>
                              ))}
                            </div>
                          </td>
                          <td style={td}>
                            <label style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",fontSize:13}}>
                              <input type="checkbox" checked={!!specials[i]} onChange={e=>toggleSpecial(i,e.target.checked)} style={{accentColor:GREEN}}/>
                              {matched?<Badge type="special">Match: {matched.customerName||matched.name}</Badge>:"Mark"}
                            </label>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {manifest.cancelled_items?.length>0&&(
              <div style={card}>
                <div style={cardH}><span style={{fontSize:16,fontWeight:700,color:RED}}>⚠ Cancelled / Backordered</span></div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead><tr>{["Product","Qty","Status"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>{manifest.cancelled_items.map((item,i)=><tr key={i}><td style={td}>{item.description}</td><td style={{...td,fontFamily:"monospace"}}>{item.ord_qty}</td><td style={td}><Badge type="cancel">Cancelled</Badge></td></tr>)}</tbody>
                </table>
              </div>
            )}
          </>}
        </>}

        {/* ── SPECIAL ORDERS ── */}
        {tab==="orders"&&<>
          <div style={card}>
            <div style={cardH}><span style={{fontSize:16,fontWeight:700,color:GREEN}}>Log a Special Order</span></div>
            <div style={{padding:18}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
                {[["Customer Name","name","text","e.g. Sarah Martinez"],["Phone","phone","tel","(916) 555-0000"]].map(([label,key,type,ph])=>(
                  <div key={key}><div style={{fontSize:11,fontWeight:600,color:"#555",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</div><input style={inp} type={type} placeholder={ph} value={soForm[key]} onChange={e=>setSoForm(p=>({...p,[key]:e.target.value}))}/></div>
                ))}
                <div style={{gridColumn:"1/-1"}}><div style={{fontSize:11,fontWeight:600,color:"#555",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Product Description</div><input style={inp} placeholder="e.g. Orijen Large Breed 25lb" value={soForm.product} onChange={e=>setSoForm(p=>({...p,product:e.target.value}))}/></div>
                <div><div style={{fontSize:11,fontWeight:600,color:"#555",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Distributor</div><select style={inp} value={soForm.distributor} onChange={e=>setSoForm(p=>({...p,distributor:e.target.value}))}><option>Newco</option><option>VSI</option><option>Phillips</option><option>Other</option></select></div>
                <div><div style={{fontSize:11,fontWeight:600,color:"#555",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>Notes</div><input style={inp} placeholder="Any special instructions" value={soForm.notes} onChange={e=>setSoForm(p=>({...p,notes:e.target.value}))}/></div>
              </div>
              <button style={btn(GREEN,"white")} onClick={addOrder}>+ Add Special Order</button>
            </div>
          </div>
          <div style={card}>
            <div style={cardH}><span style={{fontSize:16,fontWeight:700,color:GREEN}}>Pending Orders</span><span style={{fontSize:12,color:"#888"}}>{pendingOrders.length} pending</span></div>
            <div style={{padding:18}}>
              {orders.length===0?(<div style={{textAlign:"center",padding:"32px 24px",color:"#aaa"}}><div style={{fontSize:32}}>⭐</div><p style={{marginTop:8}}>No special orders logged yet</p></div>)
              :orders.map(o=>(
                <div key={o.id} style={{border:"1px solid #ddd8d0",borderLeft:o.arrived?`3px solid ${GREEN}`:"1px solid #ddd8d0",borderRadius:8,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between",background:"white"}}>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:14}}>{o.name} {o.arrived&&"✅"}</div>
                    <div style={{fontSize:12,color:"#666",marginTop:2}}>{o.product} · {o.distributor} · {o.date}</div>
                    {o.phone&&<div style={{fontFamily:"monospace",fontSize:13,color:BLUE,marginTop:2}}>{o.phone}</div>}
                    {o.notes&&<div style={{fontSize:12,color:"#888",fontStyle:"italic"}}>{o.notes}</div>}
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    {!o.arrived&&<button style={btn("white",GREEN,`1px solid ${GREEN}`)} onClick={()=>markArrived(o.id)}>Mark Arrived</button>}
                    <button style={btn("#fdf0ee",RED)} onClick={()=>deleteOrder(o.id)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>}

        {/* ── REPORT ── */}
        {tab==="report"&&<>
          {!report?(
            <div style={{textAlign:"center",padding:"48px 24px",color:"#888"}}>
              <div style={{fontSize:36}}>📋</div><h3 style={{marginTop:10}}>No report yet</h3>
              <p style={{marginTop:6}}>Go to Check-In and click Generate Report</p>
              <button style={{...btn(GREEN,"white"),marginTop:16}} onClick={()=>setTab("checkin")}>← Go to Check-In</button>
            </div>
          ):<>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <div><div style={{fontSize:22,fontWeight:800,color:GREEN}}>Delivery Report</div><div style={{fontSize:12,color:"#888"}}>Invoice {manifest?.invoice_number} · {manifest?.ship_date} · {report.today}</div></div>
              <button style={btn("white",GREEN,`1px solid ${GREEN}`)} onClick={()=>window.print()}>🖨 Print</button>
            </div>

            {/* Stats */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:10,marginBottom:18}}>
              {[["Items",report.items.length,GREEN],["Issues",report.flaggedItems.length,AMBER],["Special Orders",report.specialItems.length,BLUE],["Cancelled",report.cancelled.length,"#888"],["Price Changes",report.priceChanges.length,"#b8860b"]].map(([label,val,color])=>(
                <div key={label} style={{background:"white",border:"1px solid #ddd8d0",borderRadius:10,padding:12,textAlign:"center",boxShadow:"0 2px 8px rgba(0,0,0,0.05)"}}>
                  <div style={{fontSize:24,fontWeight:800,color}}>{val}</div>
                  <div style={{fontSize:10,color:"#aaa",textTransform:"uppercase",letterSpacing:"0.06em",marginTop:3}}>{label}</div>
                </div>
              ))}
            </div>

            {/* Call list */}
            {report.specialItems.length>0&&(
              <div style={{...card,overflow:"hidden"}}>
                <div style={{background:BLUE,color:"white",padding:"10px 14px",fontSize:13,fontWeight:600}}>📞 Call List — Special Orders Arrived</div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead><tr>{["Customer","Phone","Product","Notes"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>{report.specialItems.map(({item,i})=>{
                    const m=orders.find(o=>o.product.toLowerCase().split(" ").some(w=>w.length>3&&item.description.toLowerCase().includes(w)));
                    return<tr key={i}><td style={{...td,fontWeight:600}}>{m?.customerName||m?.name||"—"}</td><td style={{...td,fontFamily:"monospace",color:BLUE}}>{m?.phone||"—"}</td><td style={td}>{item.description}</td><td style={td}>{m?.notes||"—"}</td></tr>;
                  })}</tbody>
                </table>
              </div>
            )}

            {/* Shelf stock — includes price change warnings and extras */}
            <div style={{...card,overflow:"hidden"}}>
              <div style={{background:GREEN,color:"white",padding:"10px 14px",fontSize:13,fontWeight:600}}>📦 Shelf Stock — Put Away</div>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead><tr>{["Product","Invoice Qty","Received","Status","⚠ Staff Notes"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>{report.shelfItems.map(({item,i,flag,actualQty,checkedIn:ci})=>{
                  const priceChange=(report.priceChanges||[]).find(pc=>pc.upc===item.upc);
                  return(
                    <tr key={i}>
                      <td style={td}><div style={{fontWeight:600}}>{item.description}</div><div style={{fontFamily:"monospace",fontSize:11,color:"#aaa"}}>{item.upc}</div></td>
                      <td style={{...td,fontFamily:"monospace"}}>{item.ship_qty}</td>
                      <td style={{...td,fontFamily:"monospace",fontWeight:700,color:ci?(actualQty<parseInt(item.ship_qty)?RED:actualQty>parseInt(item.ship_qty)?PURPLE:GREEN):"#aaa"}}>{ci?actualQty:"—"}</td>
                      <td style={td}>{flag==="extra"?<Badge type="extra">+{actualQty-parseInt(item.ship_qty)} extra</Badge>:flag?<Badge type={flag}>⚠ {flag}</Badge>:<Badge type="ok">OK</Badge>}</td>
                      <td style={td}>
                        <div style={{display:"flex",flexDirection:"column",gap:4}}>
                          {flag==="extra"&&<span style={{fontSize:11,color:PURPLE,fontWeight:600}}>📦 Extra units received — add to inventory count</span>}
                          {priceChange&&<span style={{fontSize:11,color:"#b8860b",fontWeight:700,background:"#fff8e1",padding:"2px 8px",borderRadius:6}}>💰 PRICE CHANGE: was ${priceChange.previous} → now ${priceChange.current} (+${priceChange.change}) — DO NOT SHELVE until price is updated</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>

            {/* Issues */}
            {report.flaggedItems.filter(x=>x.flag!=="extra").length>0&&<>
              <div style={{...card,overflow:"hidden"}}>
                <div style={{background:AMBER,color:"white",padding:"10px 14px",fontSize:13,fontWeight:600}}>⚠ Issues — Vendor Report</div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                  <thead><tr>{["Product","Issue","Invoice Qty","Detail","Photos"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>{report.flaggedItems.filter(x=>x.flag!=="extra").map(({item,i,flag,actualQty,checkedIn:ci,dmgCount,photos})=>(
                    <tr key={i}>
                      <td style={td}>{item.description}</td>
                      <td style={td}><Badge type={flag}>{flag.charAt(0).toUpperCase()+flag.slice(1)}</Badge></td>
                      <td style={{...td,fontFamily:"monospace"}}>{item.ship_qty}</td>
                      <td style={{...td,fontSize:12,color:RED}}>{flag==="damaged"?`${dmgCount} of ${item.ship_qty} damaged`:flag==="short"?(ci?`received ${actualQty}`:"short"):"wrong item"}</td>
                      <td style={td}>{photos?.length>0?(<div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{photos.map((src,pi)=><img key={pi} src={src} style={{width:40,height:40,objectFit:"cover",borderRadius:6,border:"1px solid #ddd",cursor:"pointer"}} onClick={()=>window.open(src,"_blank")} alt="damage"/>)}</div>):<span style={{color:"#aaa",fontSize:12}}>None</span>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>

              {/* Vendor email */}
              {(report.flaggedItems.filter(x=>x.flag!=="extra").length>0)&&<>
                <div style={{fontSize:16,fontWeight:800,color:GREEN,marginBottom:10}}>📧 Vendor Exception Email</div>
                <div style={{background:"white",border:"1px solid #ddd8d0",borderRadius:10,overflow:"hidden",marginBottom:16}}>
                  <div style={{background:"#faf8f4",borderBottom:"1px solid #ddd8d0",padding:"12px 18px"}}>
                    {[["To",(VENDORS[manifest?.distributor]||VENDORS["Other"]).repEmail||"rep@vendor.com"],["From","orders@foothillfeedloomis.com"],["Subject",`Delivery Exception — Foothill Feed — ${report.today}`]].map(([label,val])=>(
                      <div key={label} style={{display:"flex",gap:10,marginBottom:5,fontSize:13}}><span style={{color:"#aaa",width:55}}>{label}:</span><span>{val}</span></div>
                    ))}
                  </div>
                  <div style={{padding:18,fontFamily:"monospace",fontSize:12,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{report.vendorEmail}</div>
                  {report.flaggedItems.some(x=>x.photos?.length>0)&&(
                    <div style={{padding:"0 18px 18px"}}>
                      <div style={{fontSize:12,fontWeight:600,color:"#555",marginBottom:8}}>📎 Photos to attach:</div>
                      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                        {report.flaggedItems.flatMap(({item,photos})=>(photos||[]).map((src,pi)=>(
                          <div key={`${item.upc}-${pi}`} style={{textAlign:"center"}}>
                            <img src={src} style={{width:72,height:72,objectFit:"cover",borderRadius:8,border:"1px solid #ddd",display:"block",cursor:"pointer"}} onClick={()=>window.open(src,"_blank")} alt="damage"/>
                            <div style={{fontSize:10,color:"#aaa",marginTop:2,maxWidth:72,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.description.split(" ").slice(0,2).join(" ")}</div>
                          </div>
                        )))}
                      </div>
                      <div style={{fontSize:11,color:"#aaa",marginTop:8}}>Tap photo to open full size · Save and attach when sending email</div>
                    </div>
                  )}
                </div>
                <button style={btn(AMBER,"white")} onClick={()=>{navigator.clipboard.writeText(report.vendorEmail);alert("Vendor email copied!");}}>📋 Copy Vendor Email</button>
                <button style={{...btn("white","#b8860b",`1px solid #b8860b`),marginLeft:8}} onClick={()=>setShareModal(true)}>📱 Add Photos on iPad</button>
              </>}
            </>}

            {/* Price change email to owner */}
            {report.priceChanges.length>0&&<>
              <div style={{fontSize:16,fontWeight:800,color:"#b8860b",marginTop:20,marginBottom:10}}>💰 Price Change Email — To You</div>
              <div style={{background:"white",border:"1px solid #f0c040",borderRadius:10,overflow:"hidden",marginBottom:12}}>
                <div style={{background:"#fff8e1",borderBottom:"1px solid #f0c040",padding:"12px 18px"}}>
                  {[["To","jeff@foothillfeedloomis.com"],["From","orders@foothillfeedloomis.com"],["Subject",`⚠ Price Increases — Update Before Shelving — ${report.today}`]].map(([label,val])=>(
                    <div key={label} style={{display:"flex",gap:10,marginBottom:5,fontSize:13}}><span style={{color:"#aaa",width:55}}>{label}:</span><span>{val}</span></div>
                  ))}
                </div>
                <div style={{padding:18,fontFamily:"monospace",fontSize:12,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{report.priceEmail}</div>
              </div>
              <button style={{...btn("#b8860b","white"),marginBottom:20}} onClick={()=>{navigator.clipboard.writeText(report.priceEmail);alert("Price change email copied!");}}>📋 Copy Price Change Email</button>
            </>}
          </>}
        </>}

        {/* ── CREDITS LOG ── */}
        {tab==="credits"&&<>
          <div style={{...card,overflow:"hidden"}}>
            <div style={{...cardH,background:"#e8f4f8",borderBottom:"1px solid #b8dce8"}}>
              <div>
                <span style={{fontSize:16,fontWeight:700,color:"#2c6e8a"}}>💳 Vendor Credit Log</span>
                <div style={{fontSize:12,color:"#4a7f96",marginTop:3}}>Credit memos logged here automatically · Never processed as deliveries</div>
              </div>
              {creditLog.length>0&&(
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:22,fontWeight:800,color:"#2c6e8a",fontFamily:"monospace"}}>
                    ${creditLog.reduce((sum,c)=>sum+parseFloat(c.total||0),0).toFixed(2)}
                  </div>
                  <div style={{fontSize:11,color:"#7aabbc"}}>total credits logged</div>
                </div>
              )}
            </div>

            {creditLog.length===0?(
              <div style={{textAlign:"center",padding:"48px 24px",color:"#aaa"}}>
                <div style={{fontSize:36,marginBottom:12}}>💳</div>
                <div style={{fontSize:15,fontWeight:600,marginBottom:6}}>No credits logged yet</div>
                <div style={{fontSize:13}}>Credit memos from Newco, VSI, or Phillips will appear here automatically when uploaded</div>
              </div>
            ):(
              <div style={{padding:16}}>
                {creditLog.map(entry=>(
                  <div key={entry.id} style={{border:"1px solid #b8dce8",borderRadius:10,marginBottom:12,overflow:"hidden"}}>
                    <div style={{background:"#f0f8fc",borderBottom:"1px solid #b8dce8",padding:"11px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <div style={{display:"flex",alignItems:"center",gap:12}}>
                        <div>
                          <div style={{fontWeight:700,fontSize:14,color:"#2c6e8a"}}>{entry.vendor} — Invoice #{entry.invoice_number}</div>
                          <div style={{fontSize:11,color:"#7aabbc",marginTop:2}}>
                            {entry.date} · Logged {new Date(entry.loggedAt).toLocaleDateString()}
                            {entry.program&&<span> · Program: <strong>{entry.program}</strong></span>}
                          </div>
                        </div>
                      </div>
                      <div style={{fontFamily:"monospace",fontWeight:800,fontSize:18,color:"#2c6e8a"}}>${entry.total}</div>
                    </div>
                    <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                      <thead><tr>{["Product","UPC","Qty","Net","Amount"].map(h=><th key={h} style={{...th,background:"#4a90a4",fontSize:10}}>{h}</th>)}</tr></thead>
                      <tbody>{entry.items.map((item,i)=>(
                        <tr key={i}>
                          <td style={td}>{item.description}</td>
                          <td style={{...td,fontFamily:"monospace",fontSize:11,color:"#aaa"}}>{item.upc}</td>
                          <td style={{...td,fontFamily:"monospace"}}>{item.ship_qty}</td>
                          <td style={{...td,fontFamily:"monospace"}}>${item.net_price}</td>
                          <td style={{...td,fontFamily:"monospace",fontWeight:700,color:"#2c6e8a"}}>${item.extended}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                ))}
                <div style={{textAlign:"center",paddingTop:8}}>
                  <button onClick={()=>{if(window.confirm("Clear all credit log entries? This cannot be undone.")){setCreditLog([]);localStorage.removeItem("ff_credit_log");}}} style={{...btn("white",RED,"1px solid "+RED),fontSize:12}}>
                    🗑 Clear Credit Log
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{...card,padding:16,background:"#f0f8fc",border:"1px solid #b8dce8"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#2c6e8a",marginBottom:6}}>🔮 Coming Soon: Credit Reconciliation</div>
            <div style={{fontSize:12,color:"#4a7f96",lineHeight:1.6}}>
              Future feature: Log Astro loyalty submissions → auto-match to credit memos received → flag any outstanding credits past 30 days. Track direct-from-Astro credits vs. distributor pass-through credits per brand.
            </div>
          </div>
        </>}

      </div>
    </div>
  );
}
