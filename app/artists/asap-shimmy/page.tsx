import { asapShimmy } from '../../../lib/catalog';

export default function AsapShimmyPage() {
  return <main>
    <nav className="nav"><a className="brand" href="/">ASR<span>.</span></a><div><a href="/listen">Listen</a> · <a href="/premium">Premium</a></div></nav>
    <section className="hero">
      <div className="eyebrow">FEATURED ARTIST</div><h1>{asapShimmy.name}</h1><p>{asapShimmy.bio}</p>
      <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:24}}>{asapShimmy.platforms.map(p=><a className="play" style={{textDecoration:'none'}} key={p.name} href={p.url} target="_blank" rel="noreferrer">{p.name}</a>)}</div>
    </section>
    <section className="hero" style={{paddingTop:0,paddingBottom:28}}><div className="eyebrow">ALBUM · 2023</div><h2 style={{fontSize:'clamp(34px,5vw,64px)',margin:'10px 0'}}>Cactus</h2><p>19 tracks · ASAP Shimmy</p></section>
    <section className="grid">{asapShimmy.release.tracks.map((title,i)=><article className="card" key={title+'-'+i}><div className="cover">{String(i+1).padStart(2,'0')}</div><div className="tag">CACTUS</div><h3>{title}</h3><p>ASAP Shimmy</p><a className="play" style={{textDecoration:'none',display:'inline-block'}} href={asapShimmy.platforms[0].url} target="_blank" rel="noreferrer">Open music</a></article>)}</section>
  </main>;
}
