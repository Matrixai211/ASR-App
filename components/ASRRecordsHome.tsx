'use client';

import { useEffect, useMemo, useState } from 'react';
import { asapShimmy } from '../lib/catalog';
import { type ASRPlayerTrack, useASRPlayer } from './ASRPlayer';

type ItunesAlbum = {
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
};

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

const news = [
  {
    date: '13 OCT 2026',
    title: 'ASR Player expands with Native + Connected Music',
    copy: 'ASR now keeps its own independent player while adding an account-connected music workspace for search, playlists, liked songs, queue and devices.',
  },
  {
    date: '13 OCT 2026',
    title: 'Cactus catalog goes live inside ASR',
    copy: 'ASAP Shimmy’s 19-track Cactus catalog is now indexed inside ASR with native-stream priority and lawful preview fallback until each master is attached.',
  },
];

const merch = [
  ['ASR LOGO TEE', 'Label merchandise'],
  ['ASR HEAVY HOODIE', 'Artist-first essentials'],
  ['ASR RECORDS CAP', 'Independent label gear'],
  ['CACTUS EDITION', 'Release merchandise'],
];

export default function ASRRecordsHome() {
  const player = useASRPlayer();
  const [menuOpen, setMenuOpen] = useState(false);
  const [cactusArtwork, setCactusArtwork] = useState<string | null>(null);
  const [publishedTracks, setPublishedTracks] = useState<PublishedTrack[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function loadRelease() {
      const [artworkResult, catalogResult, previewResult] = await Promise.allSettled([
        fetch('https://itunes.apple.com/search?term=ASAP%20Shimmy%20Cactus&entity=album&country=us&limit=25'),
        fetch('/api/catalog/asap-shimmy'),
        fetch('https://itunes.apple.com/search?term=ASAP%20Shimmy%20Cactus&entity=song&country=us&limit=200'),
      ]);

      if (artworkResult.status === 'fulfilled' && artworkResult.value.ok) {
        const payload = await artworkResult.value.json() as { results?: ItunesAlbum[] };
        const item = payload.results?.find(result =>
          result.artistName?.toLowerCase() === 'asap shimmy' &&
          result.collectionName?.toLowerCase() === 'cactus' &&
          result.artworkUrl100
        ) || payload.results?.find(result => result.artworkUrl100);
        if (!cancelled && item?.artworkUrl100) setCactusArtwork(upscaleArtwork(item.artworkUrl100));
      }

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

    void loadRelease();
    return () => { cancelled = true; };
  }, []);

  const liveByTitle = useMemo(
    () => new Map(publishedTracks.map(track => [track.title.toLowerCase(), track])),
    [publishedTracks],
  );

  const queue = useMemo<ASRPlayerTrack[]>(() => {
    return asapShimmy.release.tracks.flatMap((title, index) => {
      const key = title.toLowerCase();
      const live = liveByTitle.get(key);
      const native = live?.playable && live.streamUrl ? live.streamUrl : null;
      const source = native || previews[key];
      if (!source) return [];
      return [{
        id: live?.id || `asap-shimmy-cactus-${String(index + 1).padStart(2, '0')}`,
        title,
        artist: 'ASAP Shimmy',
        album: 'Cactus',
        artwork: cactusArtwork,
        src: source,
        sourceLabel: native ? 'FULL ASR MASTER' : 'ASR PREVIEW SOURCE',
      }];
    });
  }, [cactusArtwork, liveByTitle, previews]);

  return <main className="records-site">
    <a className="records-skip" href="#records-main">Skip to content</a>

    <header className="records-top">
      <div className="records-top-inner">
        <a className="records-logo" href="/" aria-label="ASR Records home">ASR<span>Records</span></a>
        <button
          className="records-menu-button"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(value => !value)}
        >
          Menu
        </button>
        <nav className={`records-nav ${menuOpen ? 'open' : ''}`}>
          <a href="#releases" onClick={() => setMenuOpen(false)}>Releases</a>
          <a href="#artists" onClick={() => setMenuOpen(false)}>Artists</a>
          <a href="#news" onClick={() => setMenuOpen(false)}>News</a>
          <a href="#shop" onClick={() => setMenuOpen(false)}>Shop</a>
          <a href="#demo" onClick={() => setMenuOpen(false)}>Demos</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>About</a>
          <a href="/search">Search</a>
          <a href="/player">Player</a>
        </nav>
      </div>
    </header>

    <div id="records-main">
      <section className="records-hero">
        <div className="records-vinyl" aria-hidden="true">
          <div className="records-vinyl-ring r1" />
          <div className="records-vinyl-ring r2" />
          <div className="records-vinyl-ring r3" />
          <div className="records-vinyl-label">ASR</div>
        </div>
        <h1 className="records-wordmark">ASR<span className="records-sr"> Records</span></h1>
        <p className="records-lede">Independent music, pressed loud.</p>

        <div className="records-featured">
          <a className="records-sleeve" href="/artists/asap-shimmy">
            {cactusArtwork
              ? <img src={cactusArtwork} alt="Cactus by ASAP Shimmy cover art" />
              : <div className="records-cover-fallback">CACTUS</div>}
          </a>
          <div>
            <p className="records-muted">Out now · 2023 · 19 tracks</p>
            <h2>Cactus</h2>
            <p>ASAP Shimmy · Afrosounds / trap / contemporary African influences</p>
            <div className="records-actions">
              <button
                className="records-btn orange"
                disabled={!queue.length}
                onClick={() => queue.length && player.playQueue(queue, 0)}
              >
                ▶ Play Cactus
              </button>
              <a className="records-btn" href="/artists/asap-shimmy">Tracklist</a>
              <a className="records-btn" href="/player">Open Player</a>
            </div>
          </div>
        </div>
      </section>

      <section id="releases" className="records-band white">
        <div className="records-wrap">
          <div className="records-band-head">
            <h2>New releases</h2>
            <a href="/listen">All listening</a>
          </div>
          <div className="records-grid">
            <a className="records-card" href="/artists/asap-shimmy">
              <div className="records-sleeve">
                {cactusArtwork
                  ? <img src={cactusArtwork} alt="Cactus cover art" />
                  : <div className="records-cover-fallback">CACTUS</div>}
              </div>
              <div className="records-card-title">Cactus</div>
              <div className="records-card-sub">ASAP Shimmy · Album · 2023</div>
            </a>
            <a className="records-card records-system-card" href="/player">
              <div className="records-system-art">ASR<br/>PLAYER</div>
              <div className="records-card-title">ASR Player</div>
              <div className="records-card-sub">Native + Connected Music</div>
            </a>
            <a className="records-card records-system-card" href="/search">
              <div className="records-system-art inverted">SEARCH</div>
              <div className="records-card-title">Catalog Search</div>
              <div className="records-card-sub">Artists · releases · tracks</div>
            </a>
          </div>
        </div>
      </section>

      <section id="artists" className="records-band orange">
        <div className="records-wrap">
          <h2>Artists</h2>
          <ul className="records-roster">
            <li><a href="/artists/asap-shimmy">ASAP Shimmy</a></li>
          </ul>
          <p className="records-roster-note">More ASR artists can be added as their profiles and releases are published.</p>
        </div>
      </section>

      <section className="records-band black">
        <div className="records-wrap">
          <div className="records-band-head">
            <h2>Player</h2>
            <a href="/player">Launch full player</a>
          </div>
          <div className="records-player-panel">
            <div>
              <div className="records-kicker">ASR NATIVE</div>
              <h3>Own the playback layer.</h3>
              <p>ASR-hosted masters take priority. Until a master is attached, approved preview sources keep releases playable without replacing the ASR interface.</p>
              <a className="records-btn" href="/player">Open Native Player</a>
            </div>
            <div>
              <div className="records-kicker">CONNECTED MUSIC</div>
              <h3>Bring a library inside.</h3>
              <p>Listeners can connect a supported music account for search, playlists, liked songs, queue, device selection, shuffle and repeat inside ASR.</p>
              <a className="records-btn orange" href="/player?mode=connected">Connected Music</a>
            </div>
          </div>
        </div>
      </section>

      <section id="news" className="records-band white">
        <div className="records-wrap">
          <div className="records-band-head"><h2>News</h2></div>
          <div className="records-news">
            {news.map(item => <article className="records-post" key={item.title}>
              <div className="records-muted">{item.date}</div>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>)}
          </div>
        </div>
      </section>

      <section id="shop" className="records-band black">
        <div className="records-wrap">
          <div className="records-band-head">
            <h2>Shop</h2>
            <a href="/store">Open store</a>
          </div>
          <div className="records-grid merch">
            {merch.map(([name, sub], index) => <a className="records-card" href="/store" key={name}>
              <div className={`records-merch-art m${index + 1}`}><span>ASR</span></div>
              <div className="records-card-title">{name}</div>
              <div className="records-card-sub">{sub}</div>
            </a>)}
          </div>
        </div>
      </section>

      <section id="demo" className="records-band orange">
        <div className="records-wrap records-demo">
          <div>
            <h2>Send us your music</h2>
            <p>Share music you own, tell ASR who you are, and build your artist profile when submissions are opened.</p>
          </div>
          <div className="records-actions">
            <a className="records-btn black" href="/auth">Create artist account</a>
            <a className="records-btn black-outline" href="/artist">Artist dashboard</a>
          </div>
        </div>
      </section>

      <section id="about" className="records-band white">
        <div className="records-wrap records-about">
          <h2>About</h2>
          <p>ASR Records is an independent label and music platform built around artist ownership, discovery, releases, playback, direct-to-fan tools and connected listening.</p>
          <p>The production catalog currently centers on ASAP Shimmy and the 19-track album <strong>Cactus</strong>, with infrastructure ready for additional artists and releases.</p>
        </div>
      </section>
    </div>

    <footer className="records-footer">
      <div className="records-wrap records-footer-grid">
        <div>
          <h3>Explore</h3>
          <a href="/listen">Listen</a>
          <a href="/search">Search</a>
          <a href="/library">Library</a>
          <a href="/store">Store</a>
        </div>
        <div>
          <h3>Artist</h3>
          <a href="/artists/asap-shimmy">ASAP Shimmy</a>
          <a href="/artist">Artist dashboard</a>
          <a href="/artist/cactus">Cactus masters</a>
        </div>
        <div>
          <h3>Account</h3>
          <a href="/auth">Sign in / register</a>
          <a href="/premium">Premium</a>
          <a href="/player?mode=connected">Connected Music</a>
        </div>
      </div>
      <div className="records-wrap records-footer-mark">ASR</div>
      <div className="records-wrap records-copyright">© 2026 ASR Records. All rights reserved.</div>
    </footer>
  </main>;
}
