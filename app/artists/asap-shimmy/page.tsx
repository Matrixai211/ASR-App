'use client';

import { useEffect, useMemo, useState } from 'react';
import { asapShimmy } from '../../../lib/catalog';
import { type ASRPlayerTrack, useASRPlayer } from '../../../components/ASRPlayer';

type ItunesTrack = {
  artistName?: string;
  collectionName?: string;
  trackName?: string;
  previewUrl?: string;
};

type PublishedTrack = {
  id: string;
  title: string;
  trackNumber: number;
  playable: boolean;
  streamUrl: string | null;
};

function upscaleArtwork(url: string, size = 1200) {
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/i, `/${size}x${size}bb.$1`);
}

export default function AsapShimmyPage() {
  const player = useASRPlayer();
  const [cactusArtwork] = useState<string | null>('/api/artwork/cactus');
  const [artistArtwork] = useState<string | null>('/api/artwork/asap-shimmy');
  const [publishedTracks, setPublishedTracks] = useState<PublishedTrack[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      const [catalogResult, previewResult] = await Promise.allSettled([
        fetch('/api/catalog/asap-shimmy'),
        fetch('https://itunes.apple.com/search?term=ASAP%20Shimmy%20Cactus&entity=song&country=us&limit=200'),
      ]);

      if (catalogResult.status === 'fulfilled' && catalogResult.value.ok) {
        const payload = await catalogResult.value.json() as { tracks?: PublishedTrack[] };
        if (!cancelled) setPublishedTracks(payload.tracks || []);
      }

      if (previewResult.status === 'fulfilled' && previewResult.value.ok) {
        const payload = await previewResult.value.json() as { results?: ItunesTrack[] };
        const mapped: Record<string, string> = {};
        for (const item of payload.results || []) {
          if (
            item.artistName?.toLowerCase() === 'asap shimmy' &&
            item.collectionName?.toLowerCase() === 'cactus' &&
            item.trackName &&
            item.previewUrl
          ) {
            mapped[item.trackName.toLowerCase()] = item.previewUrl;
          }
        }
        if (!cancelled) setPreviews(mapped);
      }
    }

    void loadPageData();
    return () => { cancelled = true; };
  }, []);

  const liveByTitle = useMemo(
    () => new Map(publishedTracks.map(track => [track.title.toLowerCase(), track])),
    [publishedTracks],
  );

  const playableQueue = useMemo<ASRPlayerTrack[]>(() => {
    return asapShimmy.release.tracks.flatMap((title, index) => {
      const key = title.toLowerCase();
      const liveTrack = liveByTitle.get(key);
      const nativeSource = liveTrack?.playable && liveTrack.streamUrl ? liveTrack.streamUrl : null;
      const source = nativeSource || previews[key];
      if (!source) return [];

      return [{
        id: liveTrack?.id || `asap-shimmy-cactus-${String(index + 1).padStart(2, '0')}`,
        title,
        artist: 'ASAP Shimmy',
        album: 'Cactus',
        artwork: cactusArtwork,
        src: source,
        sourceLabel: nativeSource ? 'FULL ASR MASTER' : 'ASR PREVIEW SOURCE',
      }];
    });
  }, [cactusArtwork, liveByTitle, previews]);

  return <main>
    <nav className="nav"><a className="brand" href="/">ASR<span>.</span></a><div><a href="/listen">Listen</a> · <a href="/search">Search</a> · <a href="/player">Player</a> · <a href="/premium">Premium</a></div></nav>

    <section className="hero artist-hero-grid">
      <div>
        <div className="eyebrow">FEATURED ARTIST</div>
        <h1>{asapShimmy.name}</h1>
        <p>{asapShimmy.bio}</p>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:24}}>
          {playableQueue.length > 0 && <button className="play" onClick={() => player.playQueue(playableQueue, 0)}>▶ Play Cactus in ASR</button>}
          {asapShimmy.platforms.map(platform => <a className="play secondary-play" style={{textDecoration:'none'}} key={platform.name} href={platform.url} target="_blank" rel="noreferrer">{platform.name}</a>)}
        </div>
      </div>
      {artistArtwork ? <img className="artist-portrait" src={artistArtwork} alt="Official ASAP Shimmy artist artwork" /> : <div className="artist-portrait cover">ASAP<br/>SHIMMY</div>}
    </section>

    <section className="hero album-spotlight">
      {cactusArtwork ? <img className="album-art" src={cactusArtwork} alt="Cactus by ASAP Shimmy album artwork" /> : <div className="album-art cover">CACTUS</div>}
      <div>
        <div className="eyebrow">ALBUM · 2023</div>
        <h2 style={{fontSize:'clamp(34px,5vw,64px)',margin:'10px 0'}}>Cactus</h2>
        <p>19 tracks · ASAP Shimmy</p>
        <p className="tag">Powered by the independent ASR Player. Full ASR masters automatically replace fallback sources when attached.</p>
      </div>
    </section>

    <section className="grid">{asapShimmy.release.tracks.map((title, index) => {
      const key = title.toLowerCase();
      const liveTrack = liveByTitle.get(key);
      const nativeSource = liveTrack?.playable && liveTrack.streamUrl ? liveTrack.streamUrl : null;
      const hasSource = Boolean(nativeSource || previews[key]);
      const queueIndex = playableQueue.findIndex(track => track.title.toLowerCase() === key);
      const isCurrent = player.currentTrack?.title.toLowerCase() === key && player.currentTrack.artist === 'ASAP Shimmy';

      return <article className={`card track-card ${isCurrent ? 'playing-card' : ''}`} key={title + '-' + index}>
        {cactusArtwork ? <img className="cover cover-img" src={cactusArtwork} alt={`${title} — Cactus artwork`} /> : <div className="cover">{String(index + 1).padStart(2, '0')}</div>}
        <div className="tag">CACTUS · {String(index + 1).padStart(2, '0')}</div>
        <h3>{title}</h3>
        <p>ASAP Shimmy</p>
        {hasSource
          ? <button
              className="play track-play"
              onClick={() => {
                if (isCurrent) player.togglePlay();
                else player.playQueue(playableQueue, queueIndex);
              }}
            >
              {isCurrent && player.isPlaying ? '❚❚ Pause' : '▶ Play in ASR'}
            </button>
          : <button className="play track-play" disabled>Source pending</button>}
        <span className="tag">{nativeSource ? 'FULL ASR MASTER' : hasSource ? 'ASR PREVIEW SOURCE' : 'MASTER PENDING'}</span>
      </article>;
    })}</section>
  </main>;
}
