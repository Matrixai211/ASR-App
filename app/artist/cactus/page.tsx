'use client';

import { useState } from 'react';

type Track = { id:string; title:string; trackNumber:number; ready:boolean };
type Catalog = { release:{ id:string; title:string; status:string; tracks:Track[] } };

export default function CactusMastersPage() {
  const [catalog,setCatalog]=useState<Catalog|null>(null);
  const [status,setStatus]=useState('Initialize the Cactus catalog, then choose each authorized master file.');
  const [busy,setBusy]=useState<string|null>(null);

  async function initialize(){
    setStatus('Preparing Cactus database records…');
    const res=await fetch('/api/catalog/asap-shimmy',{method:'POST'});
    const data=await res.json();
    if(!res.ok){setStatus(data.error||'Could not initialize catalog');return;}
    setCatalog(data);setStatus('Cactus is ready. Upload masters directly to private ASR storage.');
  }

  async function upload(track:Track,file:File){
    setBusy(track.id);setStatus(`Uploading ${track.title}…`);
    try{
      const sign=await fetch('/api/uploads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({trackId:track.id,fileName:file.name,contentType:file.type||'audio/mpeg',kind:'audio'})});
      const signed=await sign.json(); if(!sign.ok) throw new Error(signed.error||'Upload authorization failed');
      const put=await fetch(signed.uploadUrl,{method:'PUT',headers:{'content-type':file.type||'audio/mpeg'},body:file});
      if(!put.ok) throw new Error('Storage upload failed');
      const done=await fetch('/api/uploads/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({trackId:track.id,objectKey:signed.objectKey})});
      const completed=await done.json(); if(!done.ok) throw new Error(completed.error||'Could not attach master');
      setCatalog(c=>c?{...c,release:{...c.release,tracks:c.release.tracks.map(t=>t.id===track.id?{...t,ready:true}:t)}}:c);
      setStatus(`${track.title} attached to ASR successfully.`);
    }catch(e){setStatus(e instanceof Error?e.message:'Upload failed');}
    finally{setBusy(null);}
  }

  return <main>
    <nav className="nav"><a className="brand" href="/">ASR<span>.</span></a><div><a href="/artist">Workspace</a> · <a href="/artists/asap-shimmy">Profile</a></div></nav>
    <section className="hero" style={{paddingBottom:30}}><div className="eyebrow">ASAP SHIMMY · MASTER INGEST</div><h1>Cactus masters.</h1><p>Upload rights-controlled masters directly from your device to ASR private storage. Files do not pass through GitHub.</p><button className="btn" onClick={initialize}>Initialize / refresh Cactus</button><p style={{marginTop:16}}>{status}</p></section>
    {catalog&&<section style={{maxWidth:900,margin:'0 auto',padding:'0 clamp(20px,5vw,48px) 90px',display:'grid',gap:10}}>
      {catalog.release.tracks.map(t=><div className="card" key={t.id} style={{display:'grid',gridTemplateColumns:'60px 1fr auto',alignItems:'center',gap:14,padding:16}}>
        <strong>{String(t.trackNumber).padStart(2,'0')}</strong><div><h3 style={{margin:0}}>{t.title}</h3><p style={{margin:'4px 0 0'}}>{t.ready?'Master attached':'Waiting for master'}</p></div>
        <label className="play" style={{cursor:busy?'wait':'pointer'}}>{busy===t.id?'Uploading…':t.ready?'Replace':'Upload'}<input hidden type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/flac,audio/mp4" disabled={Boolean(busy)} onChange={e=>{const f=e.target.files?.[0];if(f)upload(t,f)}}/></label>
      </div>)}
    </section>}
  </main>;
}
