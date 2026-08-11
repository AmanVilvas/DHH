import React, { useState, useRef, useEffect, useCallback } from 'react';
import './index.css';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const PLAYLIST_ID  = "PLyj8pcPC5up7pGVgAbrMb6f0cgSpVe_Ig";
const YT_API_KEY   = "AIzaSyB7JqLvT-mVyqIG6JCYk06fcLs0KNUU8_U";
const DEFAULT_THUMB = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop";

// ── Fetch every video ID in the playlist (handles pagination) ──────────────
async function fetchPlaylistVideoIds(): Promise<string[]> {
  const ids: string[] = [];
  let pageToken = '';
  do {
    const url =
      `https://www.googleapis.com/youtube/v3/playlistItems` +
      `?part=contentDetails&maxResults=50&playlistId=${PLAYLIST_ID}&key=${YT_API_KEY}` +
      (pageToken ? `&pageToken=${pageToken}` : '');
    try {
      const res  = await fetch(url);
      const data = await res.json();
      for (const item of data.items ?? []) ids.push(item.contentDetails.videoId);
      pageToken = data.nextPageToken ?? '';
    } catch { break; }
  } while (pageToken);
  return ids;
}

function formatTime(s: number) {
  if (!s || isNaN(s) || s < 0) return '0:00';
  return `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function useClock() {
  const fmt = () => {
    const d  = new Date();
    let h    = d.getHours();
    const m  = d.getMinutes().toString().padStart(2, '0');
    const ap = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return { hm: `${h}:${m}`, ap };
  };
  const [time, setTime] = useState(fmt);
  useEffect(() => {
    const id = setInterval(() => setTime(fmt()), 10000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export default function App() {
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const [trackTitle,  setTrackTitle]  = useState('Loading...');
  const [trackArtist, setTrackArtist] = useState('DHH Playlist');
  const [thumbUrl,    setThumbUrl]    = useState(DEFAULT_THUMB);
  const [isReady,     setIsReady]     = useState(false);
  const [isBgMuted,   setIsBgMuted]   = useState(false);

  const ytRef       = useRef<any>(null);
  const videoRef    = useRef<HTMLVideoElement>(null);
  const timerRef    = useRef<number | null>(null);
  const videoIds    = useRef<string[]>([]);   // all playlist video IDs
  const idx         = useRef(0);              // current position — WE own this
  const transitioning = useRef(false);        // suppress false PAUSED during switch
  const clock       = useClock();

  // ── Background video autoplay ─────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.play().catch(() => { v.muted = true; setIsBgMuted(true); v.play().catch(() => {}); });
  }, []);

  // ── Timer ─────────────────────────────────────────────────────────────────
  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const startTimer = () => {
    stopTimer();
    timerRef.current = window.setInterval(() => {
      try { setCurrentTime(ytRef.current?.getCurrentTime() || 0); setDuration(ytRef.current?.getDuration() || 0); } catch {}
    }, 500);
  };

  // ── Metadata sync ─────────────────────────────────────────────────────────
  const syncMeta = useCallback(() => {
    try {
      const d = ytRef.current?.getVideoData?.();
      if (d?.title)    setTrackTitle(d.title);
      if (d?.author)   setTrackArtist(d.author);
      if (d?.video_id) setThumbUrl(`https://img.youtube.com/vi/${d.video_id}/hqdefault.jpg`);
    } catch {}
  }, []);

  // ── Core: load a specific video by our own index ──────────────────────────
  const forcePlay = useCallback((retries = 6) => {
    if (!ytRef.current || !transitioning.current) return; // stop if already playing or not transitioning
    const state = ytRef.current.getPlayerState?.();
    if (state === 1) { transitioning.current = false; return; } // already playing ✔
    if (state !== 3) ytRef.current.playVideo?.();              // not buffering → kick it
    if (retries > 0) setTimeout(() => forcePlay(retries - 1), 400);
    else transitioning.current = false;                        // give up after ~2.4s
  }, []);

  const loadIdx = useCallback((i: number, direction: 'next' | 'prev' = 'next') => {
    if (!ytRef.current) return;
    const ids = videoIds.current;
    if (ids.length === 0) {
      // IDs not fetched yet — fall back to YouTube's own next/prev
      transitioning.current = true;
      direction === 'next' ? ytRef.current.nextVideo() : ytRef.current.previousVideo();
      setTimeout(() => forcePlay(), 600); // still retry-force for fallback
      return;
    }
    idx.current = ((i % ids.length) + ids.length) % ids.length;
    transitioning.current = true;
    ytRef.current.loadVideoById(ids[idx.current]);
    setTimeout(() => forcePlay(), 400); // start retry loop 400ms after load
  }, [forcePlay]);

  // ── Bootstrap: fetch IDs + init YT API ───────────────────────────────────
  useEffect(() => {
    // Fetch playlist IDs immediately; player falls back to nextVideo/previousVideo until ready
    fetchPlaylistVideoIds().then(ids => {
      if (ids.length) {
        videoIds.current = ids;
        console.log(`[DHH] Loaded ${ids.length} playlist tracks`);
      } else {
        console.warn('[DHH] Playlist fetch returned 0 IDs — will use YouTube native navigation');
      }
    });

    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src   = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    window.onYouTubeIframeAPIReady = () => {
      ytRef.current = new window.YT.Player('yt-player', {
        host:   'https://www.youtube.com',
        height: '200',
        width:  '200',
        videoId: 'wLP2NzE2uw4',          // first song
        playerVars: {
          listType: 'playlist',
          list: PLAYLIST_ID,
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          modestbranding: 1,
          rel: 0,
          origin: window.location.origin,
          enablejsapi: 1,
        },
        events: {
          onReady: () => { setIsReady(true); syncMeta(); },
          onStateChange: (e: any) => {
            const S = window.YT.PlayerState;
            if (e.data === S.PLAYING) {
              transitioning.current = false;
              setIsBgMuted(true);
              setIsPlaying(true);
              startTimer();
              setTimeout(syncMeta, 300);
            } else if (e.data === S.PAUSED) {
              if (!transitioning.current) { setIsPlaying(false); stopTimer(); }
            } else if (e.data === S.ENDED) {
              loadIdx(idx.current + 1);   // auto-advance uses our own index
            }
          },
        },
      });
    };

    return () => stopTimer();
  }, [syncMeta, loadIdx]);

  // ── Controls ──────────────────────────────────────────────────────────────
  const goNext = () => loadIdx(idx.current + 1, 'next');
  const goPrev = () => loadIdx(idx.current - 1, 'prev');

  const togglePlay = () => {
    if (!ytRef.current || !isReady) return;
    ytRef.current.getPlayerState?.() === 1
      ? ytRef.current.pauseVideo()
      : ytRef.current.playVideo();
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = (parseFloat(e.target.value) / 1000) * duration;
    ytRef.current?.seekTo?.(t, true);
    setCurrentTime(t);
  };

  const seekVal = duration > 0 ? (currentTime / duration) * 1000 : 0;

  return (
    <>
      <div className="yt-hidden"><div id="yt-player"></div></div>

      <div className="hero-bg" aria-hidden="true">
        <video ref={videoRef} className="hero-video" loop muted={isBgMuted} playsInline>
          <source src="/dhh.mp4" type="video/mp4" />
        </video>
        <div className="scrim"></div>
      </div>

      <main>
        <div className="clock" aria-hidden="true">
          {clock.hm}<span className="meridiem">{clock.ap}</span>
        </div>

        <div className="links">
          <a className="pill" href="https://open.spotify.com/playlist/4ZzKtefHWa1GMCJZsv75Te"
            target="_blank" rel="noopener noreferrer" aria-label="Open on Spotify">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white" aria-hidden="true">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
            <span className="pill-label">Spotify</span>
            <span className="pill-arrow" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6"/>
              </svg>
            </span>
          </a>
        </div>

        <section className="player" aria-label="Now playing">
          <div className={`disc ${isPlaying ? 'playing' : ''}`}>
            <img src={thumbUrl} alt="" width="64" height="64" />
            <span className="disc-hole" aria-hidden="true"></span>
          </div>

          <div className="meta">
            <div className="track-title">{trackTitle}</div>
            <div className="track-artist">{trackArtist}</div>
            <div className="seek-row">
              <input className="seek" type="range" min="0" max="1000" step="1"
                value={seekVal} onChange={onSeek} aria-label="Seek" />
              <div className="time-row">
                <span>{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>
            </div>
          </div>

          <div className="controls">
            <button className="ctl" onClick={goPrev} aria-label="Previous track">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14l-11-7z"/></svg>
            </button>
            <button className="ctl play" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying
                ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>
                : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>
              }
            </button>
            <button className="ctl" onClick={goNext} aria-label="Next track">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5l11 7-11 7z"/></svg>
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
