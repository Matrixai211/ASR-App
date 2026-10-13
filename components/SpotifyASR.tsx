'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useASRPlayer } from './ASRPlayer';

declare global {
  interface Window {
    Spotify?: any;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

type SpotifyTrack = {
  id: string;
  uri: string;
  name: string;
  artist: string;
  album: string;
  image: string;
  durationMs: number;
};

type SpotifyCard = {
  id: string;
  kind: 'album' | 'artist' | 'playlist';
  name: string;
  subtitle: string;
  image: string;
  uri?: string;
};

type SpotifyPlaylist = SpotifyCard & {
  owner?: string;
};

type SpotifySection =
  | { type: 'tracks'; title: string; tracks: SpotifyTrack[]; contextUri?: string }
  | { type: 'cards'; title: string; cards: SpotifyCard[] };

type Device = {
  id: string;
  name: string;
  is_active?: boolean;
};

const API = 'https://api.spotify.com/v1';
const AUTH = 'https://accounts.spotify.com/authorize';
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-top-read',
  'user-library-read',
  'user-library-modify',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
].join(' ');

function base64Url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomString(length: number) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, value => alphabet[value % alphabet.length]).join('');
}

function formatMs(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

function imageOf(entity: any) {
  const images = entity?.images || [];
  return images[1]?.url || images[0]?.url || '';
}

function normalizeTrack(track: any, albumFallback?: any): SpotifyTrack | null {
  if (!track?.uri) return null;
  const album = track.album || albumFallback || {};
  return {
    id: track.id || track.uri,
    uri: track.uri,
    name: track.name || 'Untitled',
    artist: (track.artists || []).map((artist: any) => artist.name).join(', '),
    album: album.name || '',
    image: imageOf(album),
    durationMs: track.duration_ms || 0,
  };
}

function normalizeCard(kind: SpotifyCard['kind'], entity: any): SpotifyCard {
  const subtitle =
    kind === 'album'
      ? (entity.artists || []).map((artist: any) => artist.name).join(', ')
      : kind === 'playlist'
        ? (entity.owner?.display_name ? 'By ' + entity.owner.display_name : 'Playlist')
        : 'Artist';
  return {
    id: entity.id,
    kind,
    name: entity.name || 'Untitled',
    subtitle,
    image: imageOf(entity),
    uri: entity.uri,
  };
}

export default function SpotifyASR() {
  const native = useASRPlayer();
  const sdkRef = useRef<any>(null);
  const clientIdRef = useRef('');
  const accessTokenRef = useRef('');
  const expiresAtRef = useRef(0);
  const refreshTokenRef = useRef('');
  const deviceIdRef = useRef<string | null>(null);
  const positionAtRef = useRef(0);
  const positionBaseRef = useRef(0);

  const [clientId, setClientId] = useState('');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [sections, setSections] = useState<SpotifySection[]>([]);
  const [title, setTitle] = useState('Connected Music');
  const [subtitle, setSubtitle] = useState('');
  const [view, setView] = useState<'home' | 'search' | 'liked' | 'playlist' | 'album' | 'artist'>('home');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [now, setNow] = useState<SpotifyTrack | null>(null);
  const [paused, setPaused] = useState(true);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<'off' | 'context' | 'track'>('off');
  const [volume, setVolumeState] = useState(0.6);
  const [queue, setQueue] = useState<SpotifyTrack[]>([]);
  const [queueOpen, setQueueOpen] = useState(false);
  const [newPlaylist, setNewPlaylist] = useState('');

  const redirectUri = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return window.location.origin + '/player';
  }, []);

  const tokenRequest = useCallback(async (body: Record<string, string>) => {
    const cid = clientIdRef.current;
    if (!cid) throw new Error('Spotify Client ID is missing.');
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: cid, ...body }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error_description || payload.error || 'Spotify login failed.');
    accessTokenRef.current = payload.access_token;
    expiresAtRef.current = Date.now() + Number(payload.expires_in || 3600) * 1000;
    if (payload.refresh_token) {
      refreshTokenRef.current = payload.refresh_token;
      window.localStorage.setItem('asr_spotify_refresh', payload.refresh_token);
    }
    return payload.access_token as string;
  }, []);

  const getToken = useCallback(async () => {
    if (accessTokenRef.current && Date.now() < expiresAtRef.current - 30000) {
      return accessTokenRef.current;
    }
    const refresh = refreshTokenRef.current || window.localStorage.getItem('asr_spotify_refresh') || '';
    if (!refresh) throw new Error('Connect Spotify again.');
    refreshTokenRef.current = refresh;
    return tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh });
  }, [tokenRequest]);

  const api = useCallback(async (
    path: string,
    options: { method?: string; body?: unknown } = {},
    retry = true,
  ): Promise<any> => {
    const token = await getToken();
    const response = await fetch(path.startsWith('http') ? path : API + path, {
      method: options.method || 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (response.status === 429 && retry) {
      const seconds = Number(response.headers.get('Retry-After') || 2);
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      return api(path, options, false);
    }

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const payload = await response.json();
        detail = payload?.error?.message || payload?.error_description || payload?.error || detail;
      } catch {}
      const err = new Error(detail || 'Spotify request failed.') as Error & { status?: number };
      err.status = response.status;
      throw err;
    }

    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }, [getToken]);

  const refreshDevices = useCallback(async () => {
    try {
      const payload = await api('/me/player/devices');
      setDevices((payload?.devices || []).filter((device: Device) => device.id));
    } catch {}
  }, [api]);

  const refreshQueue = useCallback(async () => {
    try {
      const payload = await api('/me/player/queue');
      setQueue((payload?.queue || []).map((item: any) => normalizeTrack(item)).filter(Boolean));
    } catch {
      setQueue([]);
    }
  }, [api]);

  const loadPlaylists = useCallback(async () => {
    const payload = await api('/me/playlists?limit=50');
    const items = (payload?.items || []).filter(Boolean).map((item: any) => ({
      ...normalizeCard('playlist', item),
      owner: item.owner?.display_name || '',
    }));
    setPlaylists(items);
  }, [api]);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setView('home');
    setTitle(profile?.display_name ? 'Welcome, ' + profile.display_name : 'Connected Music');
    setSubtitle('Your account-backed listening space inside ASR.');
    try {
      const [recent, topTracks, topArtists] = await Promise.allSettled([
        api('/me/player/recently-played?limit=20'),
        api('/me/top/tracks?limit=12&time_range=short_term'),
        api('/me/top/artists?limit=12&time_range=short_term'),
      ]);
      const next: SpotifySection[] = [];
      if (recent.status === 'fulfilled') {
        const seen = new Set<string>();
        const tracks = (recent.value?.items || [])
          .map((item: any) => normalizeTrack(item.track))
          .filter((track: SpotifyTrack | null): track is SpotifyTrack => Boolean(track && !seen.has(track.uri) && seen.add(track.uri)));
        if (tracks.length) next.push({ type: 'tracks', title: 'Recently played', tracks });
      }
      if (topTracks.status === 'fulfilled') {
        const tracks = (topTracks.value?.items || []).map((item: any) => normalizeTrack(item)).filter(Boolean);
        if (tracks.length) next.push({ type: 'tracks', title: 'Your top tracks', tracks });
      }
      if (topArtists.status === 'fulfilled') {
        const cards = (topArtists.value?.items || []).map((item: any) => normalizeCard('artist', item));
        if (cards.length) next.push({ type: 'cards', title: 'Your top artists', cards });
      }
      setSections(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Spotify home.');
    } finally {
      setLoading(false);
    }
  }, [api, profile]);

  const loadLiked = useCallback(async () => {
    setLoading(true);
    setView('liked');
    setTitle('Liked Songs');
    setSubtitle('Saved in your connected Spotify library.');
    try {
      const payload = await api('/me/tracks?limit=50');
      const tracks = (payload?.items || []).map((item: any) => normalizeTrack(item.track)).filter(Boolean);
      setSections([{ type: 'tracks', title: 'Liked Songs', tracks }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load liked songs.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadPlaylist = useCallback(async (playlist: SpotifyPlaylist) => {
    setLoading(true);
    setView('playlist');
    setTitle(playlist.name);
    setSubtitle(playlist.owner ? 'Playlist · ' + playlist.owner : 'Playlist');
    try {
      let payload: any;
      try {
        payload = await api('/playlists/' + playlist.id + '/items?limit=50');
      } catch {
        payload = await api('/playlists/' + playlist.id + '/tracks?limit=50');
      }
      const tracks = (payload?.items || [])
        .map((item: any) => normalizeTrack(item.item || item.track))
        .filter(Boolean);
      setSections([{ type: 'tracks', title: playlist.name, tracks, contextUri: playlist.uri }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load playlist.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadAlbum = useCallback(async (card: SpotifyCard) => {
    setLoading(true);
    setView('album');
    try {
      const album = await api('/albums/' + card.id);
      setTitle(album.name || card.name);
      setSubtitle((album.artists || []).map((artist: any) => artist.name).join(', ') + ' · ' + String(album.release_date || '').slice(0, 4));
      const tracks = (album.tracks?.items || []).map((item: any) => normalizeTrack(item, album)).filter(Boolean);
      setSections([{ type: 'tracks', title: 'Tracks', tracks, contextUri: album.uri }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load album.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadArtist = useCallback(async (card: SpotifyCard) => {
    setLoading(true);
    setView('artist');
    try {
      const [artist, albums] = await Promise.all([
        api('/artists/' + card.id),
        api('/artists/' + card.id + '/albums?include_groups=album,single&limit=20'),
      ]);
      setTitle(artist.name || card.name);
      setSubtitle('Artist');
      const cards = (albums?.items || []).filter(Boolean).map((item: any) => normalizeCard('album', item));
      setSections([{ type: 'cards', title: 'Albums and singles', cards }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load artist.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  const loadSearch = useCallback(async (query: string) => {
    const q = query.trim();
    setView('search');
    setTitle('Search');
    setSubtitle(q ? 'Results for “' + q + '”' : 'Songs, albums, artists and playlists');
    if (!q) {
      setSections([]);
      return;
    }
    setLoading(true);
    try {
      const payload = await api('/search?type=track,album,artist,playlist&limit=12&q=' + encodeURIComponent(q));
      const next: SpotifySection[] = [];
      const tracks = (payload?.tracks?.items || []).map((item: any) => normalizeTrack(item)).filter(Boolean);
      const artists = (payload?.artists?.items || []).filter(Boolean).map((item: any) => normalizeCard('artist', item));
      const albums = (payload?.albums?.items || []).filter(Boolean).map((item: any) => normalizeCard('album', item));
      const foundPlaylists = (payload?.playlists?.items || []).filter(Boolean).map((item: any) => normalizeCard('playlist', item));
      if (tracks.length) next.push({ type: 'tracks', title: 'Songs', tracks });
      if (artists.length) next.push({ type: 'cards', title: 'Artists', cards: artists });
      if (albums.length) next.push({ type: 'cards', title: 'Albums', cards: albums });
      if (foundPlaylists.length) next.push({ type: 'cards', title: 'Playlists', cards: foundPlaylists });
      setSections(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  const playBody = useCallback(async (body: unknown) => {
    const id = deviceIdRef.current;
    if (!id) {
      setMessage('ASR Connected Player is still starting. Spotify Premium is required for browser playback.');
      return;
    }
    native.pause();
    if (sdkRef.current?.activateElement) sdkRef.current.activateElement();
    const request = () => api('/me/player/play?device_id=' + encodeURIComponent(id), { method: 'PUT', body });
    try {
      await request();
    } catch (err) {
      const withStatus = err as Error & { status?: number };
      if (withStatus.status === 404) {
        await api('/me/player', { method: 'PUT', body: { device_ids: [id], play: false } });
        await new Promise(resolve => setTimeout(resolve, 600));
        await request();
      } else {
        throw err;
      }
    }
  }, [api, native]);

  const playTrackList = useCallback(async (tracks: SpotifyTrack[], index: number, contextUri?: string) => {
    if (!tracks[index]) return;
    try {
      if (contextUri) {
        await playBody({ context_uri: contextUri, offset: { uri: tracks[index].uri } });
      } else {
        await playBody({ uris: tracks.slice(index, index + 100).map(track => track.uri) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Playback failed.');
    }
  }, [playBody]);

  const addToQueue = useCallback(async (track: SpotifyTrack) => {
    try {
      const device = deviceIdRef.current ? '&device_id=' + encodeURIComponent(deviceIdRef.current) : '';
      await api('/me/player/queue?uri=' + encodeURIComponent(track.uri) + device, { method: 'POST' });
      setMessage('Added “' + track.name + '” to queue.');
      await refreshQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add to queue.');
    }
  }, [api, refreshQueue]);

  const saveTrack = useCallback(async (track: SpotifyTrack) => {
    try {
      await api('/me/tracks?ids=' + encodeURIComponent(track.id), { method: 'PUT' });
      setMessage('Saved “' + track.name + '” to Liked Songs.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save track.');
    }
  }, [api]);

  const openCard = useCallback(async (card: SpotifyCard) => {
    if (card.kind === 'album') return loadAlbum(card);
    if (card.kind === 'artist') return loadArtist(card);
    return loadPlaylist(card as SpotifyPlaylist);
  }, [loadAlbum, loadArtist, loadPlaylist]);

  const initSdk = useCallback(() => {
    const start = () => {
      if (!window.Spotify || sdkRef.current) return;
      const player = new window.Spotify.Player({
        name: 'ASR Connected Player',
        getOAuthToken: (callback: (token: string) => void) => {
          getToken().then(callback).catch(err => setError(err.message));
        },
        volume,
      });
      sdkRef.current = player;
      player.addListener('ready', ({ device_id }: { device_id: string }) => {
        deviceIdRef.current = device_id;
        setDeviceId(device_id);
        setMessage('Connected player ready.');
        void refreshDevices();
      });
      player.addListener('not_ready', () => {
        deviceIdRef.current = null;
        setDeviceId(null);
      });
      player.addListener('player_state_changed', (state: any) => {
        if (!state) return;
        const raw = state.track_window?.current_track;
        if (raw) {
          const track = normalizeTrack(raw);
          if (track) setNow(track);
        }
        setPaused(Boolean(state.paused));
        setShuffle(Boolean(state.shuffle));
        setRepeat(state.repeat_mode === 2 ? 'track' : state.repeat_mode === 1 ? 'context' : 'off');
        const pos = Number(state.position || 0);
        positionBaseRef.current = pos;
        positionAtRef.current = performance.now();
        setPosition(pos);
        setDuration(Number(state.duration || raw?.duration_ms || 0));
        void refreshQueue();
      });
      const report = (prefix: string) => ({ message }: { message: string }) => setError(prefix + ': ' + message);
      player.addListener('initialization_error', report('Player initialization'));
      player.addListener('authentication_error', report('Player authentication'));
      player.addListener('account_error', () => setError('Spotify Premium is required for browser playback.'));
      player.addListener('playback_error', report('Playback'));
      void player.connect();
    };

    if (window.Spotify) {
      start();
      return;
    }
    window.onSpotifyWebPlaybackSDKReady = start;
    if (!document.querySelector('script[data-asr-spotify-sdk]')) {
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      script.dataset.asrSpotifySdk = 'true';
      document.body.appendChild(script);
    }
  }, [getToken, refreshDevices, refreshQueue, volume]);

  const finishConnection = useCallback(async () => {
    const me = await api('/me');
    setProfile(me);
    setConnected(true);
    await loadPlaylists();
    initSdk();
    await refreshDevices();
  }, [api, initSdk, loadPlaylists, refreshDevices]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const storedId = window.localStorage.getItem('asr_spotify_client_id') || process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || '';
      const storedRefresh = window.localStorage.getItem('asr_spotify_refresh') || '';
      clientIdRef.current = storedId;
      refreshTokenRef.current = storedRefresh;
      setClientId(storedId);

      const params = new URLSearchParams(window.location.search);
      const authError = params.get('error');
      const code = params.get('code');

      try {
        if (authError) throw new Error('Spotify login failed: ' + authError);
        if (code) {
          const returnedState = params.get('state') || '';
          const expectedState = window.sessionStorage.getItem('asr_spotify_state') || '';
          const verifier = window.sessionStorage.getItem('asr_spotify_verifier') || '';
          if (!expectedState || returnedState !== expectedState) throw new Error('Spotify login state did not match. Please reconnect.');
          if (!verifier) throw new Error('Spotify login verifier expired. Please reconnect.');
          await tokenRequest({
            grant_type: 'authorization_code',
            code,
            redirect_uri: window.location.origin + '/player',
            code_verifier: verifier,
          });
          window.sessionStorage.removeItem('asr_spotify_state');
          window.sessionStorage.removeItem('asr_spotify_verifier');
          window.history.replaceState({}, '', '/player?mode=connected');
        } else if (!storedRefresh) {
          if (!cancelled) setConnecting(false);
          return;
        }

        await finishConnection();
        if (!cancelled) {
          setConnecting(false);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setConnecting(false);
          setConnected(false);
          setError(err instanceof Error ? err.message : 'Could not connect Spotify.');
        }
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [finishConnection, tokenRequest]);

  useEffect(() => {
    if (!connected || !profile) return;
    void loadHome();
  }, [connected, profile, loadHome]);

  useEffect(() => {
    if (!connected || view !== 'search') return;
    const timer = window.setTimeout(() => void loadSearch(search), 350);
    return () => window.clearTimeout(timer);
  }, [connected, view, search, loadSearch]);

  useEffect(() => {
    if (!now || paused) return;
    const timer = window.setInterval(() => {
      const next = Math.min(duration, positionBaseRef.current + (performance.now() - positionAtRef.current));
      setPosition(next);
    }, 500);
    return () => window.clearInterval(timer);
  }, [now, paused, duration]);

  const connect = useCallback(async () => {
    const cid = clientId.trim();
    if (!cid) {
      setError('Paste your Spotify Client ID first.');
      return;
    }
    setError('');
    clientIdRef.current = cid;
    window.localStorage.setItem('asr_spotify_client_id', cid);
    const verifier = randomString(64);
    const state = randomString(32);
    const challenge = base64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    window.sessionStorage.setItem('asr_spotify_verifier', verifier);
    window.sessionStorage.setItem('asr_spotify_state', state);
    const query = new URLSearchParams({
      client_id: cid,
      response_type: 'code',
      redirect_uri: window.location.origin + '/player',
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
    });
    window.location.href = AUTH + '?' + query.toString();
  }, [clientId]);

  const disconnect = useCallback(() => {
    sdkRef.current?.disconnect?.();
    sdkRef.current = null;
    accessTokenRef.current = '';
    expiresAtRef.current = 0;
    refreshTokenRef.current = '';
    deviceIdRef.current = null;
    window.localStorage.removeItem('asr_spotify_refresh');
    setConnected(false);
    setProfile(null);
    setPlaylists([]);
    setSections([]);
    setNow(null);
    setDeviceId(null);
    setMessage('Spotify disconnected from ASR.');
  }, []);

  const createPlaylist = useCallback(async () => {
    const name = newPlaylist.trim();
    if (!name || !profile?.id) return;
    try {
      await api('/users/' + profile.id + '/playlists', {
        method: 'POST',
        body: { name: name.slice(0, 100), public: false },
      });
      setNewPlaylist('');
      await loadPlaylists();
      setMessage('Playlist created.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create playlist.');
    }
  }, [api, loadPlaylists, newPlaylist, profile]);

  const seekConnected = useCallback(async (value: number) => {
    try {
      await sdkRef.current?.seek?.(value);
      positionBaseRef.current = value;
      positionAtRef.current = performance.now();
      setPosition(value);
    } catch {}
  }, []);

  const setConnectedVolume = useCallback(async (value: number) => {
    const safe = Math.max(0, Math.min(1, value));
    setVolumeState(safe);
    window.localStorage.setItem('asr_spotify_volume', String(safe));
    await sdkRef.current?.setVolume?.(safe);
  }, []);

  const toggleShuffle = useCallback(async () => {
    try {
      const next = !shuffle;
      await api('/me/player/shuffle?state=' + String(next) + (deviceIdRef.current ? '&device_id=' + encodeURIComponent(deviceIdRef.current) : ''), { method: 'PUT' });
      setShuffle(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change shuffle.');
    }
  }, [api, shuffle]);

  const cycleRepeat = useCallback(async () => {
    const next = repeat === 'off' ? 'context' : repeat === 'context' ? 'track' : 'off';
    try {
      await api('/me/player/repeat?state=' + next + (deviceIdRef.current ? '&device_id=' + encodeURIComponent(deviceIdRef.current) : ''), { method: 'PUT' });
      setRepeat(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change repeat.');
    }
  }, [api, repeat]);

  const transferDevice = useCallback(async (id: string) => {
    try {
      await api('/me/player', { method: 'PUT', body: { device_ids: [id], play: true } });
      setMessage('Playback moved to selected device.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not transfer playback.');
    }
  }, [api]);

  if (connecting) {
    return <section className="connected-setup">
      <div className="eyebrow">CONNECTED MUSIC</div>
      <h2>Connecting…</h2>
      <p>ASR is checking your connected music session.</p>
    </section>;
  }

  if (!connected) {
    return <section className="connected-setup">
      <div className="eyebrow">CONNECTED MUSIC · SPOTIFY</div>
      <h2>Bring your library into ASR.</h2>
      <p>Connect a Spotify developer app with Authorization Code + PKCE. No client secret is stored in ASR. Browser playback requires Spotify Premium.</p>
      <label className="connected-label">
        Spotify Client ID
        <input className="connected-input" value={clientId} onChange={event => setClientId(event.target.value)} placeholder="Paste Spotify Client ID" autoComplete="off" />
      </label>
      <div className="connected-redirect">
        <span>Redirect URI to register in Spotify</span>
        <code>{redirectUri}</code>
      </div>
      <button className="play connected-connect" onClick={() => void connect()}>Connect Spotify</button>
      {error && <div className="connected-alert">{error}</div>}
    </section>;
  }

  return <section className="connected-shell">
    <aside className="connected-sidebar">
      <div>
        <div className="eyebrow">CONNECTED MUSIC</div>
        <h3>{profile?.display_name || 'Spotify'}</h3>
      </div>
      <button className={view === 'home' ? 'connected-nav active' : 'connected-nav'} onClick={() => void loadHome()}>Home</button>
      <button className={view === 'search' ? 'connected-nav active' : 'connected-nav'} onClick={() => { setView('search'); setTitle('Search'); setSubtitle('Songs, albums, artists and playlists'); setSections([]); }}>Search</button>
      <button className={view === 'liked' ? 'connected-nav active' : 'connected-nav'} onClick={() => void loadLiked()}>Liked Songs</button>

      <div className="connected-playlist-list">
        <div className="connected-side-label">PLAYLISTS</div>
        {playlists.map(playlist => <button key={playlist.id} className="connected-nav compact" onClick={() => void loadPlaylist(playlist)}>{playlist.name}</button>)}
      </div>

      <div className="connected-create">
        <input value={newPlaylist} onChange={event => setNewPlaylist(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void createPlaylist(); }} placeholder="New playlist" />
        <button onClick={() => void createPlaylist()}>＋</button>
      </div>
      <button className="connected-nav danger" onClick={disconnect}>Disconnect</button>
    </aside>

    <div className="connected-main">
      <header className="connected-head">
        <div>
          <div className="eyebrow">SPOTIFY · INSIDE ASR</div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="connected-device">
          <span>{deviceId ? 'PLAYER READY' : 'STARTING PLAYER'}</span>
          <select defaultValue="" onChange={event => { if (event.target.value) void transferDevice(event.target.value); }}>
            <option value="">Choose device</option>
            {devices.map(device => <option key={device.id} value={device.id}>{device.name}{device.is_active ? ' · active' : ''}</option>)}
          </select>
          <button onClick={() => void refreshDevices()}>↻</button>
        </div>
      </header>

      {view === 'search' && <div className="connected-search-wrap">
        <input className="connected-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search Spotify from ASR" autoFocus />
      </div>}

      {error && <div className="connected-alert"><span>{error}</span><button onClick={() => setError('')}>×</button></div>}
      {message && <div className="connected-message"><span>{message}</span><button onClick={() => setMessage('')}>×</button></div>}
      {loading && <p className="connected-loading">Loading…</p>}

      {!loading && sections.length === 0 && <div className="connected-empty">Nothing to show yet.</div>}

      {sections.map((section, sectionIndex) => <div className="connected-section" key={section.title + sectionIndex}>
        <h3>{section.title}</h3>
        {section.type === 'tracks' ? <div className="connected-track-list">
          {section.tracks.map((track, index) => <div className={now?.uri === track.uri ? 'connected-track active' : 'connected-track'} key={track.uri}>
            {track.image ? <img src={track.image} alt="" /> : <div className="connected-art-fallback">ASR</div>}
            <button className="connected-track-main" onClick={() => void playTrackList(section.tracks, index, section.contextUri)}>
              <strong>{track.name}</strong>
              <span>{track.artist}{track.album ? ' · ' + track.album : ''}</span>
            </button>
            <span className="connected-time">{formatMs(track.durationMs)}</span>
            <button title="Save to Liked Songs" onClick={() => void saveTrack(track)}>♥</button>
            <button title="Add to queue" onClick={() => void addToQueue(track)}>＋</button>
            <button className="connected-row-play" onClick={() => void playTrackList(section.tracks, index, section.contextUri)}>▶</button>
          </div>)}
        </div> : <div className="connected-card-grid">
          {section.cards.map(card => <button className="connected-card" key={card.kind + card.id} onClick={() => void openCard(card)}>
            {card.image ? <img src={card.image} alt="" /> : <div className="connected-card-fallback">ASR</div>}
            <strong>{card.name}</strong>
            <span>{card.subtitle}</span>
          </button>)}
        </div>}
      </div>)}
    </div>

    <footer className="connected-footer">
      <div className="connected-now">
        {now?.image ? <img src={now.image} alt="" /> : <div className="connected-art-fallback">ASR</div>}
        <div>
          <strong>{now?.name || 'Nothing playing'}</strong>
          <span>{now?.artist || 'Pick a song'}</span>
        </div>
      </div>

      <div className="connected-controls">
        <div className="connected-buttons">
          <button className={shuffle ? 'active' : ''} onClick={() => void toggleShuffle()}>⇄</button>
          <button onClick={() => sdkRef.current?.previousTrack?.()}>⏮</button>
          <button className="connected-main-play" onClick={() => { native.pause(); sdkRef.current?.togglePlay?.(); }}>{paused ? '▶' : '❚❚'}</button>
          <button onClick={() => sdkRef.current?.nextTrack?.()}>⏭</button>
          <button className={repeat !== 'off' ? 'active' : ''} onClick={() => void cycleRepeat()}>{repeat === 'track' ? '↻1' : '↻'}</button>
        </div>
        <div className="connected-seek">
          <span>{formatMs(position)}</span>
          <input type="range" min={0} max={Math.max(duration, 1)} value={Math.min(position, Math.max(duration, 1))} onChange={event => void seekConnected(Number(event.target.value))} />
          <span>{formatMs(duration)}</span>
        </div>
      </div>

      <div className="connected-tools">
        <button onClick={() => { setQueueOpen(!queueOpen); if (!queueOpen) void refreshQueue(); }}>QUEUE</button>
        <label>
          VOL
          <input type="range" min={0} max={1} step={0.01} value={volume} onChange={event => void setConnectedVolume(Number(event.target.value))} />
        </label>
      </div>

      {queueOpen && <div className="connected-queue">
        <div className="connected-queue-head"><strong>UP NEXT</strong><button onClick={() => setQueueOpen(false)}>×</button></div>
        {queue.length ? queue.slice(0, 30).map((track, index) => <div className="connected-queue-row" key={track.uri + index}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{track.name}</strong><small>{track.artist}</small></div></div>) : <p>Nothing queued.</p>}
      </div>}
    </footer>
  </section>;
}
