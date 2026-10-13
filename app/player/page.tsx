'use client';

import { useASRPlayer } from '../../components/ASRPlayer';

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

export default function PlayerPage() {
  const player = useASRPlayer();
  const track = player.currentTrack;

  return <main className="player-page">
    <nav className="nav">
      <a className="brand" href="/">ASR<span>.</span></a>
      <div><a href="/listen">Listen</a> · <a href="/search">Search</a> · <a href="/artists/asap-shimmy">ASAP Shimmy</a></div>
    </nav>

    {!track ? <section className="player-empty hero">
      <div className="eyebrow">ASR PLAYER</div>
      <h1>Press play.<br/>Own the room.</h1>
      <p>The independent ASR Player is ready. Start a track from an artist or release page and playback will stay here while navigating ASR.</p>
      <a className="play" href="/artists/asap-shimmy" style={{display:'inline-block',textDecoration:'none',marginTop:20}}>Open Cactus</a>
    </section> : <section className="player-stage">
      <div className="player-now-art">
        {track.artwork
          ? <img src={track.artwork} alt={`${track.title} artwork`} />
          : <div className="player-now-fallback">ASR</div>}
      </div>

      <div className="player-now">
        <div className="eyebrow">NOW PLAYING · ASR PLAYER</div>
        <h1>{track.title}</h1>
        <h2>{track.artist}</h2>
        <p>{track.album || 'ASR Release'}</p>
        {track.sourceLabel && <div className="tag">{track.sourceLabel}</div>}

        <div className="player-page-controls">
          <button className="asr-icon-btn player-big-side" onClick={player.previous} aria-label="Previous">◀</button>
          <button className="asr-main-play player-big-play" onClick={player.togglePlay} aria-label={player.isPlaying ? 'Pause' : 'Play'}>
            {player.isPlaying ? '❚❚' : '▶'}
          </button>
          <button className="asr-icon-btn player-big-side" onClick={player.next} aria-label="Next">▶</button>
        </div>

        <div className="player-page-seek">
          <span>{formatTime(player.currentTime)}</span>
          <input
            aria-label="Seek"
            type="range"
            min={0}
            max={Math.max(player.duration, 1)}
            step={0.1}
            value={Math.min(player.currentTime, Math.max(player.duration, 1))}
            onChange={event => player.seek(Number(event.target.value))}
          />
          <span>{formatTime(player.duration)}</span>
        </div>

        <div className="player-page-tools">
          <button className={`asr-tool-btn ${player.repeat !== 'off' ? 'active' : ''}`} onClick={player.cycleRepeat}>
            Repeat {player.repeat}
          </button>
          <label className="player-page-volume">
            Volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={player.volume}
              onChange={event => player.setVolume(Number(event.target.value))}
            />
          </label>
        </div>
      </div>

      <div className="player-page-queue">
        <div className="eyebrow">QUEUE · {player.queue.length}</div>
        {player.queue.map((item, index) => <button
          key={item.id}
          className={`player-page-row ${index === player.currentIndex ? 'active' : ''}`}
          onClick={() => player.selectTrack(index)}
        >
          <span>{String(index + 1).padStart(2, '0')}</span>
          <span>
            <strong>{item.title}</strong>
            <small>{item.artist}{item.album ? ` · ${item.album}` : ''}</small>
          </span>
          <span>{index === player.currentIndex && player.isPlaying ? '▮▮' : '▶'}</span>
        </button>)}
      </div>
    </section>}
  </main>;
}
