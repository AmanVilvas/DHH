import React, { useState, useRef, useEffect, useCallback } from 'react';
import './index.css';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const PLAYLIST_ID = "PLyj8pcPC5up7pGVgAbrMb6f0cgSpVe_Ig";
const DEFAULT_THUMB = "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=200&auto=format&fit=crop";

function formatTime(s: number) {
  if (!s || isNaN(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
}

function useClock() {
  const [time, setTime] = useState(() => {
    const d = new Date();
    let h = d.getHours(); const m = d.getMinutes().toString().padStart(2, '0');
    const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
    return { hm: `${h}:${m}`, ap };
  });
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      let h = d.getHours(); const m = d.getMinutes().toString().padStart(2, '0');
      const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
      setTime({ hm: `${h}:${m}`, ap });
    };
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trackTitle, setTrackTitle] = useState("Loading Track...");
  const [trackArtist, setTrackArtist] = useState("...");
  const [thumbUrl, setThumbUrl] = useState(DEFAULT_THUMB);
  
  const [isReady, setIsReady] = useState(false);
  const [isBgMuted, setIsBgMuted] = useState(false);

  const ytRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<number | null>(null);
  const clock = useClock();

  // Attempt to autoplay video on mount. Try unmuted first, fallback to muted if blocked.
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play().catch(() => {
        if (videoRef.current) {
          videoRef.current.muted = true;
          setIsBgMuted(true);
          videoRef.current.play().catch(() => {});
        }
      });
    }
  }, []);

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const startTimer = () => {
    stopTimer();
    timerRef.current = window.setInterval(() => {
      if (!ytRef.current) return;
      try {
        setCurrentTime(ytRef.current.getCurrentTime() || 0);
        setDuration(ytRef.current.getDuration() || 0);
      } catch (_) {}
    }, 500);
  };

  const syncMeta = useCallback(() => {
    try {
      const data = ytRef.current?.getVideoData?.();
      if (data?.title) setTrackTitle(data.title);
      if (data?.author) setTrackArtist(data.author);
      if (data?.video_id) setThumbUrl(`https://img.youtube.com/vi/${data.video_id}/hqdefault.jpg`);
    } catch (_) {}
  }, []);

  useEffect(() => {
    // Load YouTube IFrame API
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }

    window.onYouTubeIframeAPIReady = () => {
      ytRef.current = new window.YT.Player('yt-player', {
        host: 'https://www.youtube.com',
        height: '200',
        width: '200',
        videoId: 'wLP2NzE2uw4', // Explicitly provide the first video ID to ensure loading
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
          onReady: () => {
            setIsReady(true);
            syncMeta();
          },
          onStateChange: (e: any) => {
            if (e.data === window.YT.PlayerState.PLAYING) {
              setIsBgMuted(true);
              setIsPlaying(true);
              startTimer();
              setTimeout(syncMeta, 300);
            } else {
              setIsPlaying(false);
              stopTimer();
              if (e.data === window.YT.PlayerState.ENDED) {
                // Instantly update UI to feel faster
                setTrackTitle("Loading next...");
                ytRef.current?.nextVideo?.();
              }
            }
          },
        },
      });
    };

    return () => stopTimer();
  }, [syncMeta]);

  const togglePlay = () => {
    if (!ytRef.current || !isReady) return;

    const state = ytRef.current.getPlayerState?.();
    if (state === 1) { // playing
      ytRef.current.pauseVideo();
    } else {
      ytRef.current.playVideo();
    }
  };

  const next = () => {
    if (!ytRef.current) return;
    setTrackTitle("Loading..."); // instant UI feedback
    ytRef.current.nextVideo();
  };
  
  const prev = () => {
    if (!ytRef.current) return;
    setTrackTitle("Loading..."); // instant UI feedback
    ytRef.current.previousVideo();
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = (parseFloat(e.target.value) / 1000) * duration;
    ytRef.current?.seekTo?.(t, true);
    setCurrentTime(t);
  };

  const seekVal = duration > 0 ? (currentTime / duration) * 1000 : 0;

  return (
    <>
      {/* YouTube IFrame player — hidden off-screen */}
      <div className="yt-hidden">
        <div id="yt-player"></div>
      </div>

      {/* Background video */}
      <div className="hero-bg" aria-hidden="true">
        <video ref={videoRef} className="hero-video" loop muted={isBgMuted} playsInline>
          <source src="/dhh.mp4" type="video/mp4" />
        </video>
        <div className="scrim"></div>
      </div>

      <main>
        {/* Clock */}
        <div className="clock" aria-hidden="true">
          {clock.hm}<span className="meridiem">{clock.ap}</span>
        </div>

        {/* Top-right Spotify link */}
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

        {/* Player horizontally aligned */}
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
            <button className="ctl" onClick={prev} aria-label="Previous track">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14l-11-7z"/></svg>
            </button>
            <button className="ctl play" onClick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying
                ? <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>
                : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>
              }
            </button>
            <button className="ctl" onClick={next} aria-label="Next track">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5l11 7-11 7z"/></svg>
            </button>
          </div>
        </section>
      </main>
    </>
  );
}
