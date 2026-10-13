'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type ASRPlayerTrack = {
  id: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string | null;
  src: string;
  sourceLabel?: string;
};

type RepeatMode = 'off' | 'all' | 'one';

type ASRPlayerContextValue = {
  queue: ASRPlayerTrack[];
  currentIndex: number;
  currentTrack: ASRPlayerTrack | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  repeat: RepeatMode;
  queueOpen: boolean;
  playQueue: (tracks: ASRPlayerTrack[], index?: number) => void;
  selectTrack: (index: number) => void;
  togglePlay: () => void;
  previous: () => void;
  next: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  cycleRepeat: () => void;
  setQueueOpen: (open: boolean) => void;
};

const ASRPlayerContext = createContext<ASRPlayerContextValue | null>(null);

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

export function ASRPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [queue, setQueue] = useState<ASRPlayerTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.85);
  const [repeat, setRepeat] = useState<RepeatMode>('off');
  const [queueOpen, setQueueOpen] = useState(false);

  const currentTrack = currentIndex >= 0 ? queue[currentIndex] ?? null : null;

  useEffect(() => {
    const saved = window.localStorage.getItem('asr-player-volume');
    if (!saved) return;
    const parsed = Number(saved);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
      setVolumeState(parsed);
      if (audioRef.current) audioRef.current.volume = parsed;
    }
  }, []);

  const loadTrack = useCallback((track: ASRPlayerTrack, autoplay = true) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.src !== track.src) {
      audio.src = track.src;
      audio.load();
      setCurrentTime(0);
      setDuration(0);
    }
    if (autoplay) {
      void audio.play().catch(() => setIsPlaying(false));
    }
  }, []);

  const selectTrack = useCallback((index: number) => {
    if (index < 0 || index >= queue.length) return;
    setCurrentIndex(index);
    loadTrack(queue[index], true);
  }, [loadTrack, queue]);

  const playQueue = useCallback((tracks: ASRPlayerTrack[], index = 0) => {
    if (!tracks.length) return;
    const safeIndex = Math.min(Math.max(index, 0), tracks.length - 1);
    setQueue(tracks);
    setCurrentIndex(safeIndex);
    loadTrack(tracks[safeIndex], true);
  }, [loadTrack]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (audio.paused) void audio.play().catch(() => setIsPlaying(false));
    else audio.pause();
  }, [currentTrack]);

  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (!queue.length || !audio) return;
    if (audio.currentTime > 4) {
      audio.currentTime = 0;
      return;
    }
    const index = currentIndex > 0 ? currentIndex - 1 : repeat === 'all' ? queue.length - 1 : 0;
    setCurrentIndex(index);
    loadTrack(queue[index], true);
  }, [currentIndex, loadTrack, queue, repeat]);

  const next = useCallback(() => {
    if (!queue.length) return;
    const hasNext = currentIndex < queue.length - 1;
    if (!hasNext && repeat === 'off') {
      audioRef.current?.pause();
      return;
    }
    const index = hasNext ? currentIndex + 1 : 0;
    setCurrentIndex(index);
    loadTrack(queue[index], true);
  }, [currentIndex, loadTrack, queue, repeat]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  }, []);

  const setVolume = useCallback((value: number) => {
    const nextVolume = Math.min(Math.max(value, 0), 1);
    setVolumeState(nextVolume);
    if (audioRef.current) audioRef.current.volume = nextVolume;
    window.localStorage.setItem('asr-player-volume', String(nextVolume));
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeat(mode => mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off');
  }, []);

  const onEnded = useCallback(() => {
    const audio = audioRef.current;
    if (repeat === 'one' && audio) {
      audio.currentTime = 0;
      void audio.play();
      return;
    }
    next();
  }, [next, repeat]);

  const context = useMemo<ASRPlayerContextValue>(() => ({
    queue,
    currentIndex,
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    repeat,
    queueOpen,
    playQueue,
    selectTrack,
    togglePlay,
    previous,
    next,
    seek,
    setVolume,
    cycleRepeat,
    setQueueOpen,
  }), [
    queue, currentIndex, currentTrack, isPlaying, currentTime, duration, volume,
    repeat, queueOpen, playQueue, selectTrack, togglePlay, previous, next, seek,
    setVolume, cycleRepeat,
  ]);

  return <ASRPlayerContext.Provider value={context}>
    {children}
    <audio
      ref={audioRef}
      preload="metadata"
      onPlay={() => setIsPlaying(true)}
      onPause={() => setIsPlaying(false)}
      onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime)}
      onLoadedMetadata={event => setDuration(event.currentTarget.duration || 0)}
      onDurationChange={event => setDuration(event.currentTarget.duration || 0)}
      onEnded={onEnded}
    />

    {currentTrack && <aside className="asr-player" aria-label="ASR music player">
      {queueOpen && <div className="asr-player-queue">
        <div className="asr-player-queue-head">
          <div>
            <div className="eyebrow">UP NEXT</div>
            <strong>{queue.length} TRACKS</strong>
          </div>
          <button className="asr-icon-btn" onClick={() => setQueueOpen(false)} aria-label="Close queue">×</button>
        </div>
        <div className="asr-player-queue-list">
          {queue.map((track, index) => <button
            key={track.id}
            className={`asr-queue-row ${index === currentIndex ? 'active' : ''}`}
            onClick={() => selectTrack(index)}
          >
            <span className="asr-queue-number">{String(index + 1).padStart(2, '0')}</span>
            <span>
              <strong>{track.title}</strong>
              <small>{track.artist}{track.album ? ` · ${track.album}` : ''}</small>
            </span>
            <span>{index === currentIndex && isPlaying ? '▮▮' : '▶'}</span>
          </button>)}
        </div>
      </div>}

      <div className="asr-player-inner">
        <div className="asr-player-track">
          {currentTrack.artwork
            ? <img src={currentTrack.artwork} alt="" />
            : <div className="asr-player-fallback">ASR</div>}
          <div className="asr-player-meta">
            <strong>{currentTrack.title}</strong>
            <span>{currentTrack.artist}{currentTrack.album ? ` · ${currentTrack.album}` : ''}</span>
            {currentTrack.sourceLabel && <small>{currentTrack.sourceLabel}</small>}
          </div>
        </div>

        <div className="asr-player-center">
          <div className="asr-player-controls">
            <button className="asr-icon-btn" onClick={previous} aria-label="Previous track">◀</button>
            <button className="asr-main-play" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? '❚❚' : '▶'}
            </button>
            <button className="asr-icon-btn" onClick={next} aria-label="Next track">▶</button>
          </div>
          <div className="asr-player-timeline">
            <span>{formatTime(currentTime)}</span>
            <input
              aria-label="Seek"
              type="range"
              min={0}
              max={Math.max(duration, 1)}
              step={0.1}
              value={Math.min(currentTime, Math.max(duration, 1))}
              onChange={event => seek(Number(event.target.value))}
            />
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="asr-player-actions">
          <button
            className={`asr-icon-btn ${repeat !== 'off' ? 'active' : ''}`}
            onClick={cycleRepeat}
            aria-label={`Repeat: ${repeat}`}
            title={`Repeat: ${repeat}`}
          >
            {repeat === 'one' ? '↻1' : '↻'}
          </button>
          <button className="asr-icon-btn" onClick={() => setQueueOpen(!queueOpen)} aria-label="Open queue" title="Queue">☷</button>
          <label className="asr-volume">
            <span>VOL</span>
            <input
              aria-label="Volume"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={event => setVolume(Number(event.target.value))}
            />
          </label>
          <a className="asr-open-player" href="/player">PLAYER</a>
        </div>
      </div>
    </aside>}
  </ASRPlayerContext.Provider>;
}

export function useASRPlayer() {
  const value = useContext(ASRPlayerContext);
  if (!value) throw new Error('useASRPlayer must be used inside ASRPlayerProvider');
  return value;
}
