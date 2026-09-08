import { asapShimmy } from '../../../lib/catalog';
import { getAsapShimmyArtistArtwork, getCactusArtwork } from '../../../lib/music-artwork';

export default async function AsapShimmyPage() {
  const [cactusArtwork, artistArtwork] = await Promise.all([
    getCactusArtwork(1200),
    getAsapShimmyArtistArtwork(1200),
  ]);

  return <main>
    <nav className="nav"><a className="brand" href="/">ASR<span>.</span></a><div><a href="/listen">Listen</a> · <a href="/premium">Premium</a></div></nav>

    <section className="hero artist-hero-grid">
      <div>
        <div className="eyebrow">FEATURED ARTIST</div>
        <h1>{asapShimmy.name}</h1>
        <p>{asapShimmy.bio}</p>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:24}}>{asapShimmy.platforms.map(p=><a className="play" style={{textDecoration:'none'}} key={p.name} href={p.url} target="_blank" rel="noreferrer">{p.name}</a>)}</div>
      </div>
      {(artistArtwork || cactusArtwork) && <img className="artist-portrait" src={artistArtwork || cactusArtwork || ''} alt="ASAP Shimmy" />}
    </section>

    <section className="hero album-spotlight">
      {cactusArtwork && <img className="album-art" src={cactusArtwork} alt="Cactus by ASAP Shimmy album artwork" />}
      <div>
        <div className="eyebrow">ALBUM · 2023</div>
        <h2 style={{fontSize:'clamp(34px,5vw,64px)',margin:'10px 0'}}>Cactus</h2>
        <p>19 tracks · ASAP Shimmy</p>
      </div>
    </section>

    <section className="grid">{asapShimmy.release.tracks.map((title,i)=><article className="card" key={title+'-'+i}>{cactusArtwork ? <img className="cover cover-img" src={cactusArtwork} alt={`${title} — Cactus artwork`} /> : <div className="cover">{String(i+1).padStart(2,'0')}</div>}<div className="tag">CACTUS</div><h3>{title}</h3><p>ASAP Shimmy</p><a className="play" style={{textDecoration:'none',display:'inline-block'}} href={asapShimmy.platforms[0].url} target="_blank" rel="noreferrer">Open music</a></article>)}</section>
  </main>;
}
