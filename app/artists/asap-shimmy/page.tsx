'use client';

import { useEffect, useState } from 'react';
import { asapShimmy } from '../../../lib/catalog';

type ItunesAlbum = {
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
};

function upscaleArtwork(url: string, size = 1200) {
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/i, `/${size}x${size}bb.$1`);
}

export default function AsapShimmyPage() {
  const [cactusArtwork, setCactusArtwork] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadArtwork() {
      try {
        const response = await fetch('https://itunes.apple.com/search?term=ASAP%20Shimmy%20Cactus&entity=album&country=us&limit=25');
        if (!response.ok) return;
        const payload = await response.json() as { results?: ItunesAlbum[] };
        const item = payload.results?.find(result =>
          result.artistName?.toLowerCase() === 'asap shimmy' &&
          result.collectionName?.toLowerCase() === 'cactus' &&
          result.artworkUrl100
        ) || payload.results?.find(result => result.artworkUrl100);

        if (!cancelled && item?.artworkUrl100) {
          setCactusArtwork(upscaleArtwork(item.artworkUrl100));
        }
      } catch {
        // Keep the designed ASR fallback if Apple's artwork endpoint is unavailable.
      }
    }

    void loadArtwork();
    return () => { cancelled = true; };
  }, []);

  return <main>
    <nav className="nav"><a className="brand" href="/">ASR<span>.</span></a><div><a href="/listen">Listen</a> · <a href="/premium">Premium</a></div></nav>

    <section className="hero artist-hero-grid">
      <div>
        <div className="eyebrow">FEATURED ARTIST</div>
        <h1>{asapShimmy.name}</h1>
        <p>{asapShimmy.bio}</p>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:24}}>{asapShimmy.platforms.map(p=><a className="play" style={{textDecoration:'none'}} key={p.name} href={p.url} target="_blank" rel="noreferrer">{p.name}</a>)}</div>
      </div>
      {cactusArtwork ? <img className="artist-portrait" src={cactusArtwork} alt="ASAP Shimmy — Cactus artwork" /> : <div className="artist-portrait cover">ASAP<br/>SHIMMY</div>}
    </section>

    <section className="hero album-spotlight">
      {cactusArtwork ? <img className="album-art" src={cactusArtwork} alt="Cactus by ASAP Shimmy album artwork" /> : <div className="album-art cover">CACTUS</div>}
      <div>
        <div className="eyebrow">ALBUM · 2023</div>
        <h2 style={{fontSize:'clamp(34px,5vw,64px)',margin:'10px 0'}}>Cactus</h2>
        <p>19 tracks · ASAP Shimmy</p>
      </div>
    </section>

    <section className="grid">{asapShimmy.release.tracks.map((title,i)=><article className="card" key={title+'-'+i}>{cactusArtwork ? <img className="cover cover-img" src={cactusArtwork} alt={`${title} — Cactus artwork`} /> : <div className="cover">{String(i+1).padStart(2,'0')}</div>}<div className="tag">CACTUS</div><h3>{title}</h3><p>ASAP Shimmy</p><a className="play" style={{textDecoration:'none',display:'inline-block'}} href={asapShimmy.platforms[0].url} target="_blank" rel="noreferrer">Open music</a></article>)}</section>
  </main>;
}
