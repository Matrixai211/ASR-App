'use client';

import { FormEvent, useEffect, useState } from 'react';

type SearchResult = {
  id: string;
  type: 'artist' | 'release' | 'track' | 'featured';
  title: string;
  subtitle?: string;
  href?: string;
  genre?: string;
  artwork?: string;
};

type ItunesAlbum = {
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
};

function upscaleArtwork(url: string, size = 800) {
  return url.replace(/\/\d+x\d+bb\.(jpg|png)$/i, `/${size}x${size}bb.$1`);
}

export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
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
        // Search stays functional with the ASR fallback artwork.
      }
    }

    void loadArtwork();
    return () => { cancelled = true; };
  }, []);

  async function runSearch(term: string) {
    const clean = term.trim();
    if (!clean) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(clean)}`);
      const payload = await response.json() as { results?: SearchResult[] };
      setResults(payload.results || []);
      window.history.replaceState(null, '', `/search?q=${encodeURIComponent(clean)}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q') || '';
    if (initial) {
      setQuery(initial);
      void runSearch(initial);
    }
  }, []);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void runSearch(query);
  }

  function artworkFor(item: SearchResult) {
    if (item.artwork) return item.artwork;
    const haystack = `${item.title} ${item.subtitle || ''}`.toLowerCase();
    return haystack.includes('asap shimmy') || haystack.includes('cactus') ? cactusArtwork : null;
  }

  return <main>
    <nav className="nav"><a className="brand" href="/">ASR<span>.</span></a><a href="/listen">Listen</a></nav>
    <section className="hero">
      <div className="eyebrow">SEARCH</div>
      <h1>Find your sound.</h1>
      <p>Search artists, tracks, albums, genres and playlists.</p>
      <form onSubmit={submit}>
        <input className="input" name="q" value={query} onChange={event => setQuery(event.target.value)} placeholder="Artist, track or album" />
        <button className="btn" disabled={loading}>{loading ? 'Searching…' : 'Search'}</button>
      </form>
    </section>

    {searched && <section className="grid search-results">
      {results.length ? results.map(item => {
        const artwork = artworkFor(item);
        return <a className="card search-card" href={item.href || '#'} key={item.id}>
          {artwork ? <img className="cover cover-img" src={artwork} alt={`${item.title} artwork`} /> : <div className="cover">ASR</div>}
          <div className="tag">{item.type.toUpperCase()}</div>
          <h3>{item.title}</h3>
          <p>{item.subtitle}{item.genre ? ` · ${item.genre}` : ''}</p>
        </a>;
      }) : !loading && <div className="search-empty"><div className="eyebrow">NO RESULTS</div><h2>Nothing matched “{query}”.</h2><p>Try an artist, track, album or genre.</p></div>}
    </section>}
  </main>;
}
