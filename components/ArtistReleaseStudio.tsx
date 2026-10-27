'use client';

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

type TrackRecord = {
  id: string;
  title: string;
  trackNumber: number;
  audioUrl: string | null;
  explicit: boolean;
  isrc: string | null;
  featuredArtists: string | null;
  producerCredits: string | null;
  songwriterCredits: string | null;
  composerCredits: string | null;
};
type ReleaseRecord = {
  id: string;
  title: string;
  type: 'SINGLE' | 'EP' | 'ALBUM';
  genre: string | null;
  language: string | null;
  artworkUrl: string | null;
  releaseDate: string | null;
  status: string;
  exclusive: boolean;
  downloadable: boolean;
  copyrightOwner: string | null;
  masterRightsOwner: string | null;
  publishingRightsOwner: string | null;
  copyrightYear: number | null;
  upc: string | null;
  artist: { stageName: string };
  tracks: TrackRecord[];
};
type ReleaseForm = {
  title: string;
  type: 'SINGLE' | 'EP' | 'ALBUM';
  genre: string;
  language: string;
  releaseDate: string;
  copyrightOwner: string;
  masterRightsOwner: string;
  publishingRightsOwner: string;
  copyrightYear: string;
  upc: string;
  exclusive: boolean;
  downloadable: boolean;
};
type TrackDraft = {
  title: string;
  explicit: boolean;
  isrc: string;
  featuredArtists: string;
  producerCredits: string;
  songwriterCredits: string;
  composerCredits: string;
};

const initialForm: ReleaseForm = {
  title: '', type: 'SINGLE', genre: '', language: 'English', releaseDate: '',
  copyrightOwner: '', masterRightsOwner: '', publishingRightsOwner: '',
  copyrightYear: String(new Date().getFullYear()), upc: '', exclusive: false, downloadable: false,
};
const editableStatuses = new Set(['DRAFT', 'CHANGES_REQUESTED']);
const inputStyle: CSSProperties = { width: '100%', borderRadius: 14, display: 'block', marginTop: 8 };
const labelStyle: CSSProperties = { display: 'grid', gap: 4, color: '#d0d0d0', fontSize: 13, fontWeight: 700 };
const panelStyle: CSSProperties = { display: 'grid', gap: 16, padding: 22, marginBottom: 18 };

function draftFromTrack(track: TrackRecord): TrackDraft {
  return {
    title: track.title, explicit: track.explicit, isrc: track.isrc || '',
    featuredArtists: track.featuredArtists || '', producerCredits: track.producerCredits || '',
    songwriterCredits: track.songwriterCredits || '', composerCredits: track.composerCredits || '',
  };
}
function formFromRelease(release: ReleaseRecord): ReleaseForm {
  return {
    title: release.title, type: release.type, genre: release.genre || '', language: release.language || '',
    releaseDate: release.releaseDate ? release.releaseDate.slice(0, 10) : '',
    copyrightOwner: release.copyrightOwner || '', masterRightsOwner: release.masterRightsOwner || '',
    publishingRightsOwner: release.publishingRightsOwner || '',
    copyrightYear: release.copyrightYear ? String(release.copyrightYear) : '', upc: release.upc || '',
    exclusive: release.exclusive, downloadable: release.downloadable,
  };
}
function inferContentType(file: File, kind: 'audio' | 'artwork') {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().split('.').pop();
  if (kind === 'artwork') return extension === 'png' ? 'image/png' : extension === 'webp' ? 'image/webp' : 'image/jpeg';
  if (extension === 'wav') return 'audio/wav';
  if (extension === 'flac') return 'audio/flac';
  if (extension === 'm4a' || extension === 'mp4') return 'audio/mp4';
  return 'audio/mpeg';
}

export default function ArtistReleaseStudio({ releaseId }: { releaseId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<ReleaseForm>(initialForm);
  const [artistName, setArtistName] = useState('');
  const [trackLines, setTrackLines] = useState('');
  const [release, setRelease] = useState<ReleaseRecord | null>(null);
  const [trackDrafts, setTrackDrafts] = useState<Record<string, TrackDraft>>({});
  const [newTrackTitle, setNewTrackTitle] = useState('');
  const [artworkPreview, setArtworkPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(releaseId));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [rightsAttestation, setRightsAttestation] = useState(false);
  const locked = Boolean(release && !editableStatuses.has(release.status));

  const refreshRelease = useCallback(async () => {
    if (!releaseId) return;
    setLoading(true);
    try {
      const response = await fetch('/api/releases/' + releaseId, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not load this release');
      const nextRelease = payload.release as ReleaseRecord;
      setRelease(nextRelease);
      setForm(formFromRelease(nextRelease));
      setTrackDrafts(Object.fromEntries(nextRelease.tracks.map(track => [track.id, draftFromTrack(track)])));
      if (nextRelease.artworkUrl) {
        const artResponse = await fetch('/api/releases/' + releaseId + '/artwork', { cache: 'no-store' });
        if (artResponse.ok) {
          const artPayload = await artResponse.json();
          setArtworkPreview(artPayload.artworkUrl || null);
        } else setArtworkPreview(null);
      } else setArtworkPreview(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load this release');
    } finally {
      setLoading(false);
    }
  }, [releaseId]);

  useEffect(() => { if (releaseId) void refreshRelease(); }, [releaseId, refreshRelease]);

  function updateForm<K extends keyof ReleaseForm>(key: K, value: ReleaseForm[K]) {
    setForm(current => ({ ...current, [key]: value }));
  }
  function updateTrackDraft(trackId: string, field: keyof TrackDraft, value: string | boolean) {
    setTrackDrafts(current => ({
      ...current,
      [trackId]: { ...(current[trackId] || { title: '', explicit: false, isrc: '', featuredArtists: '', producerCredits: '', songwriterCredits: '', composerCredits: '' }), [field]: value },
    }));
  }

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('Saving draft…');
    try {
      const tracks = trackLines.split('\n').map(title => title.trim()).filter(Boolean);
      const response = await fetch('/api/releases', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...form, artistName, tracks }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not save draft');
      router.push('/artist/releases/' + payload.release.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save draft');
    } finally { setBusy(false); }
  }

  async function saveMetadata() {
    if (!releaseId) return false;
    setBusy(true);
    setMessage('Saving release metadata…');
    try {
      const response = await fetch('/api/releases/' + releaseId, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not save metadata');
      setRelease(current => current ? { ...current, ...payload.release } : payload.release);
      setMessage('Release metadata saved.');
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save metadata');
      return false;
    } finally { setBusy(false); }
  }

  async function saveTrack(trackId: string) {
    const draft = trackDrafts[trackId];
    if (!draft || !releaseId) return;
    setBusy(true);
    setMessage('Saving track metadata…');
    try {
      const response = await fetch('/api/releases/' + releaseId + '/tracks/' + trackId, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not save track');
      setRelease(current => current ? { ...current, tracks: current.tracks.map(track => track.id === trackId ? { ...track, ...payload.track } : track) } : current);
      setMessage('Track metadata saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save track');
    } finally { setBusy(false); }
  }

  async function addTrack() {
    if (!releaseId || !newTrackTitle.trim()) return;
    setBusy(true);
    try {
      const response = await fetch('/api/releases/' + releaseId + '/tracks', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: newTrackTitle.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not add track');
      const track = payload.track as TrackRecord;
      setRelease(current => current ? { ...current, tracks: [...current.tracks, track].sort((a, b) => a.trackNumber - b.trackNumber) } : current);
      setTrackDrafts(current => ({ ...current, [track.id]: draftFromTrack(track) }));
      setNewTrackTitle('');
      setMessage('Track added. Upload its master when ready.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not add track');
    } finally { setBusy(false); }
  }

  async function removeTrack(trackId: string) {
    if (!releaseId || !window.confirm('Remove this track from the draft?')) return;
    setBusy(true);
    try {
      const response = await fetch('/api/releases/' + releaseId + '/tracks/' + trackId, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Could not remove track');
      setRelease(current => current ? { ...current, tracks: current.tracks.filter(track => track.id !== trackId).map((track, index) => ({ ...track, trackNumber: index + 1 })) } : current);
      setTrackDrafts(current => { const next = { ...current }; delete next[trackId]; return next; });
      setMessage('Track removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not remove track');
    } finally { setBusy(false); }
  }

  async function uploadFile(trackId: string, file: File, kind: 'audio' | 'artwork') {
    if (!releaseId) return;
    const contentType = inferContentType(file, kind);
    setUploading(trackId + ':' + kind);
    setMessage('Uploading ' + file.name + '…');
    try {
      const signedResponse = await fetch('/api/uploads', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trackId, fileName: file.name, contentType, fileSizeBytes: file.size, kind }),
      });
      const signed = await signedResponse.json();
      if (!signedResponse.ok) throw new Error(signed.error || 'Upload authorization failed');
      const putResponse = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: file });
      if (!putResponse.ok) throw new Error('Storage upload failed. Check the configured ASR storage bucket and upload permissions.');
      const completeResponse = await fetch('/api/uploads/complete', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trackId, objectKey: signed.objectKey, kind }),
      });
      const completed = await completeResponse.json();
      if (!completeResponse.ok) throw new Error(completed.error || 'Could not attach uploaded media');
      if (kind === 'audio') {
        setRelease(current => current ? { ...current, tracks: current.tracks.map(track => track.id === trackId ? { ...track, audioUrl: completed.objectKey } : track) } : current);
      } else {
        setRelease(current => current ? { ...current, artworkUrl: completed.objectKey } : current);
        const artworkResponse = await fetch('/api/releases/' + releaseId + '/artwork', { cache: 'no-store' });
        if (artworkResponse.ok) {
          const artPayload = await artworkResponse.json();
          setArtworkPreview(artPayload.artworkUrl || null);
        }
      }
      setMessage(kind === 'audio' ? 'Master uploaded and attached to this track.' : 'Cover artwork uploaded and attached to this release.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed');
    } finally { setUploading(null); }
  }

  async function submitRelease() {
    if (!releaseId) return;
    if (!rightsAttestation) {
      setMessage('Confirm that you control or are authorized to distribute this recording and artwork before submitting.');
      return;
    }
    if (!(await saveMetadata())) return;
    setBusy(true);
    try {
      const response = await fetch('/api/releases/' + releaseId + '/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rightsAttestation: true }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const missing = Array.isArray(payload.missing) ? ' Missing: ' + payload.missing.join(', ') + '.' : '';
        throw new Error((payload.error || 'Could not submit release') + missing);
      }
      setRelease(payload.release as ReleaseRecord);
      setMessage('Submitted for ASR review. Track its status from your release list.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not submit release');
    } finally { setBusy(false); }
  }

  if (loading) return <main><nav className="nav"><a className="brand" href="/">ASR<span>.</span></a><a href="/artist/releases">All releases</a></nav><section className="hero"><div className="eyebrow">ARTIST DISTRIBUTION</div><h1>Loading release…</h1></section></main>;

  return (
    <main>
      <nav className="nav"><a className="brand" href="/">ASR<span>.</span></a><div><a href="/artist">Workspace</a> · <a href="/artist/releases">My releases</a> · <a href="/listen">Listen</a></div></nav>
      <section className="hero" style={{ paddingBottom: 28 }}>
        <div className="eyebrow">ASR ARTIST DISTRIBUTION STUDIO</div>
        <h1>{release ? release.title : 'Build your release.'}</h1>
        <p>{release ? 'Prepare metadata, attach masters and cover artwork, and submit a complete package for review.' : 'Create a single, EP or album draft. It remains private until ASR approves it.'}</p>
        {release && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 20 }}><span className="tag" style={{ marginTop: 0 }}>STATUS · {release.status.replaceAll('_', ' ')}</span><span style={{ color: '#999', fontSize: 13 }}>Artist: {release.artist.stageName}</span><a className="play" href="/artist/releases" style={{ textDecoration: 'none' }}>Back to releases</a></div>}
      </section>
      {message && <div style={{ maxWidth: 1000, margin: '0 auto 18px', padding: '0 clamp(20px,5vw,48px)' }}><div className="card" role="status" style={{ borderColor: '#53351e', color: '#ffbd87' }}>{message}</div></div>}

      {!release ? (
        <form onSubmit={createDraft} style={{ maxWidth: 1000, margin: '0 auto', padding: '0 clamp(20px,5vw,48px) 90px' }}>
          <section className="card" style={panelStyle}>
            <h2 style={{ margin: 0 }}>01 · Release details</h2>
            <label style={labelStyle}>Release title<input className="input" style={inputStyle} value={form.title} onChange={event => updateForm('title', event.target.value)} maxLength={120} required placeholder="Title of your single, EP or album" /></label>
            <label style={labelStyle}>Artist / stage name<input className="input" style={inputStyle} value={artistName} onChange={event => setArtistName(event.target.value)} maxLength={100} placeholder="Used if you have not created an artist profile yet" /></label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
              <label style={labelStyle}>Release type<select className="input" style={inputStyle} value={form.type} onChange={event => updateForm('type', event.target.value as ReleaseForm['type'])}><option value="SINGLE">Single</option><option value="EP">EP</option><option value="ALBUM">Album</option></select></label>
              <label style={labelStyle}>Primary genre<input className="input" style={inputStyle} value={form.genre} onChange={event => updateForm('genre', event.target.value)} placeholder="Afrosounds, Afrobeats, Dancehall…" /></label>
              <label style={labelStyle}>Language<input className="input" style={inputStyle} value={form.language} onChange={event => updateForm('language', event.target.value)} placeholder="English, Arabic, Luganda…" /></label>
              <label style={labelStyle}>Planned release date<input className="input" style={inputStyle} type="date" value={form.releaseDate} onChange={event => updateForm('releaseDate', event.target.value)} /></label>
            </div>
          </section>
          <section className="card" style={panelStyle}>
            <h2 style={{ margin: 0 }}>02 · Rights and identifiers</h2>
            <label style={labelStyle}>Copyright owner<input className="input" style={inputStyle} value={form.copyrightOwner} onChange={event => updateForm('copyrightOwner', event.target.value)} placeholder="Person or company owning the composition copyright" /></label>
            <label style={labelStyle}>Master recording rights owner<input className="input" style={inputStyle} value={form.masterRightsOwner} onChange={event => updateForm('masterRightsOwner', event.target.value)} placeholder="Person or company authorized to distribute the recording" /></label>
            <label style={labelStyle}>Publishing rights owner (optional)<input className="input" style={inputStyle} value={form.publishingRightsOwner} onChange={event => updateForm('publishingRightsOwner', event.target.value)} placeholder="Publisher or administrator" /></label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
              <label style={labelStyle}>Copyright year<input className="input" style={inputStyle} type="number" min="1900" max="2200" value={form.copyrightYear} onChange={event => updateForm('copyrightYear', event.target.value)} /></label>
              <label style={labelStyle}>UPC / EAN (optional)<input className="input" style={inputStyle} value={form.upc} onChange={event => updateForm('upc', event.target.value)} maxLength={20} placeholder="Release barcode, if assigned" /></label>
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#ccc' }}><input type="checkbox" checked={form.exclusive} onChange={event => updateForm('exclusive', event.target.checked)} /> ASR exclusive release</label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#ccc' }}><input type="checkbox" checked={form.downloadable} onChange={event => updateForm('downloadable', event.target.checked)} /> Enable authorized downloads after approval</label>
          </section>
          <section className="card" style={panelStyle}>
            <h2 style={{ margin: 0 }}>03 · Tracklist</h2>
            <p style={{ color: '#999', margin: 0 }}>Enter one track title per line. You can add or remove tracks after the draft is created.</p>
            <label style={labelStyle}>Track titles<textarea className="input" style={{ ...inputStyle, borderRadius: 14, minHeight: 150, resize: 'vertical' }} value={trackLines} onChange={event => setTrackLines(event.target.value)} required placeholder={'01 - Opening Track\n02 - Second Track'} /></label>
          </section>
          <button className="btn" type="submit" disabled={busy} style={{ margin: 0 }}>{busy ? 'Saving…' : 'Save release draft'}</button>
        </form>
      ) : (
        <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 clamp(20px,5vw,48px) 100px' }}>
          <section className="card" style={panelStyle}>
            <h2 style={{ margin: 0 }}>01 · Release metadata</h2>
            <label style={labelStyle}>Release title<input className="input" style={inputStyle} value={form.title} disabled={locked} onChange={event => updateForm('title', event.target.value)} maxLength={120} required /></label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
              <label style={labelStyle}>Release type<select className="input" style={inputStyle} value={form.type} disabled={locked} onChange={event => updateForm('type', event.target.value as ReleaseForm['type'])}><option value="SINGLE">Single</option><option value="EP">EP</option><option value="ALBUM">Album</option></select></label>
              <label style={labelStyle}>Primary genre<input className="input" style={inputStyle} value={form.genre} disabled={locked} onChange={event => updateForm('genre', event.target.value)} /></label>
              <label style={labelStyle}>Language<input className="input" style={inputStyle} value={form.language} disabled={locked} onChange={event => updateForm('language', event.target.value)} /></label>
              <label style={labelStyle}>Planned release date<input className="input" style={inputStyle} type="date" value={form.releaseDate} disabled={locked} onChange={event => updateForm('releaseDate', event.target.value)} /></label>
            </div>
            <label style={labelStyle}>Copyright owner<input className="input" style={inputStyle} value={form.copyrightOwner} disabled={locked} onChange={event => updateForm('copyrightOwner', event.target.value)} /></label>
            <label style={labelStyle}>Master recording rights owner<input className="input" style={inputStyle} value={form.masterRightsOwner} disabled={locked} onChange={event => updateForm('masterRightsOwner', event.target.value)} /></label>
            <label style={labelStyle}>Publishing rights owner (optional)<input className="input" style={inputStyle} value={form.publishingRightsOwner} disabled={locked} onChange={event => updateForm('publishingRightsOwner', event.target.value)} /></label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14 }}>
              <label style={labelStyle}>Copyright year<input className="input" style={inputStyle} type="number" min="1900" max="2200" value={form.copyrightYear} disabled={locked} onChange={event => updateForm('copyrightYear', event.target.value)} /></label>
              <label style={labelStyle}>UPC / EAN<input className="input" style={inputStyle} value={form.upc} disabled={locked} onChange={event => updateForm('upc', event.target.value)} maxLength={20} /></label>
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#ccc' }}><input type="checkbox" checked={form.exclusive} disabled={locked} onChange={event => updateForm('exclusive', event.target.checked)} /> ASR exclusive release</label>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#ccc' }}><input type="checkbox" checked={form.downloadable} disabled={locked} onChange={event => updateForm('downloadable', event.target.checked)} /> Enable authorized downloads after approval</label>
            {!locked && <button className="btn" type="button" disabled={busy} onClick={() => void saveMetadata()} style={{ margin: 0, justifySelf: 'start' }}>{busy ? 'Saving…' : 'Save metadata'}</button>}
          </section>
          <section className="card" style={panelStyle}>
            <h2 style={{ margin: 0 }}>02 · Cover artwork</h2>
            <p style={{ color: '#999', margin: 0 }}>JPG, PNG or WebP. Maximum 15 MB. Artwork stays private until the release is approved.</p>
            {artworkPreview && <img src={artworkPreview} alt="Release cover artwork preview" style={{ width: 220, maxWidth: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 16, border: '1px solid #333' }} />}
            {release.artworkUrl && <p style={{ color: '#aaa', margin: 0 }}>Cover artwork attached.</p>}
            {!locked && release.tracks[0] && <label className="play" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: uploading ? 'wait' : 'pointer', width: 'fit-content' }}>{uploading?.endsWith(':artwork') ? 'Uploading artwork…' : 'Choose cover artwork'}<input type="file" hidden accept="image/jpeg,image/png,image/webp" disabled={Boolean(uploading)} onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void uploadFile(release.tracks[0].id, file, 'artwork'); event.currentTarget.value = ''; }} /></label>}
          </section>
          <section className="card" style={panelStyle}>
            <h2 style={{ margin: 0 }}>03 · Track masters and credits</h2>
            <p style={{ color: '#999', margin: 0 }}>MP3, WAV, FLAC or MP4 audio, maximum 100 MB per file. Every track needs a master before submission.</p>
            {release.tracks.map(track => {
              const draft = trackDrafts[track.id] || draftFromTrack(track);
              return <article key={track.id} style={{ display: 'grid', gap: 12, border: '1px solid #303030', borderRadius: 16, padding: 16 }}>
                <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong>{String(track.trackNumber).padStart(2, '0')} · {track.title}</strong>
                  <span style={{ color: track.audioUrl ? '#9ed9a6' : '#ffbd87', fontSize: 12 }}>{track.audioUrl ? 'MASTER ATTACHED' : 'MASTER REQUIRED'}</span>
                </div>
                <label style={labelStyle}>Track title<input className="input" style={inputStyle} value={draft.title} disabled={locked} onChange={event => updateTrackDraft(track.id, 'title', event.target.value)} /></label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
                  <label style={labelStyle}>ISRC (optional)<input className="input" style={inputStyle} value={draft.isrc} disabled={locked} maxLength={12} placeholder="USABC2400001" onChange={event => updateTrackDraft(track.id, 'isrc', event.target.value.toUpperCase())} /></label>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#ccc', alignSelf: 'end', paddingBottom: 14 }}><input type="checkbox" checked={draft.explicit} disabled={locked} onChange={event => updateTrackDraft(track.id, 'explicit', event.target.checked)} /> Explicit content</label>
                </div>
                <label style={labelStyle}>Featured artists<input className="input" style={inputStyle} value={draft.featuredArtists} disabled={locked} onChange={event => updateTrackDraft(track.id, 'featuredArtists', event.target.value)} /></label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
                  <label style={labelStyle}>Producer credits<input className="input" style={inputStyle} value={draft.producerCredits} disabled={locked} onChange={event => updateTrackDraft(track.id, 'producerCredits', event.target.value)} /></label>
                  <label style={labelStyle}>Songwriter credits<input className="input" style={inputStyle} value={draft.songwriterCredits} disabled={locked} onChange={event => updateTrackDraft(track.id, 'songwriterCredits', event.target.value)} /></label>
                  <label style={labelStyle}>Composer credits<input className="input" style={inputStyle} value={draft.composerCredits} disabled={locked} onChange={event => updateTrackDraft(track.id, 'composerCredits', event.target.value)} /></label>
                </div>
                {!locked && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="play" type="button" disabled={busy} onClick={() => void saveTrack(track.id)}>Save track details</button>
                  <label className="play" style={{ cursor: uploading ? 'wait' : 'pointer' }}>{uploading === track.id + ':audio' ? 'Uploading master…' : track.audioUrl ? 'Replace master' : 'Upload master'}<input type="file" hidden accept="audio/mpeg,audio/wav,audio/x-wav,audio/flac,audio/mp4" disabled={Boolean(uploading)} onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void uploadFile(track.id, file, 'audio'); event.currentTarget.value = ''; }} /></label>
                  <button className="play" type="button" disabled={busy || release.tracks.length <= 1} onClick={() => void removeTrack(track.id)}>Remove track</button>
                </div>}
              </article>;
            })}
            {!locked && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}><input className="input" style={{ flex: '1 1 240px', borderRadius: 14 }} value={newTrackTitle} onChange={event => setNewTrackTitle(event.target.value)} placeholder="Add another track title" /><button className="play" type="button" disabled={busy || !newTrackTitle.trim()} onClick={() => void addTrack()}>Add track</button></div>}
          </section>
          <section className="card" style={panelStyle}>
            <h2 style={{ margin: 0 }}>04 · Submit for review</h2>
            <p style={{ color: '#999', margin: 0 }}>ASR checks required metadata, rights ownership, cover artwork and every audio master. Submission does not publish the release automatically.</p>
            {!locked && <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', color: '#ccc', lineHeight: 1.5 }}>
              <input type="checkbox" checked={rightsAttestation} onChange={event => setRightsAttestation(event.target.checked)} style={{ marginTop: 4 }} />
              I confirm that I own or am authorized to distribute the submitted recordings and artwork, and that the credits and rights information are accurate.
            </label>}
            {locked ? <p style={{ color: '#ffbd87', margin: 0 }}>This release is {release.status.replaceAll('_', ' ').toLowerCase()}. Editing and uploads are locked until ASR staff requests changes.</p> : <button className="btn" type="button" disabled={busy || Boolean(uploading) || !rightsAttestation} onClick={() => void submitRelease()} style={{ margin: 0, justifySelf: 'start' }}>{busy ? 'Working…' : 'Save and submit for review'}</button>}
          </section>
        </div>
      )}
    </main>
  );
}
