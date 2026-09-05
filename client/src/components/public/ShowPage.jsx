import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { format } from 'date-fns';

/**
 * Public-facing show page for a single gig the band has explicitly made
 * public (Gig.isPublic) — including an upcoming one, used to promote a show
 * before it happens. No authentication required. Renders the band name, gig
 * title/date/venue, setlist (titles + artists only — internal fields like
 * key/bpm/notes are stripped server-side), and any photos/videos from the
 * gig gallery.
 *
 * The setlist is withheld server-side (`setlistRevealed: false`) until the
 * gig is marked completed, so an upcoming show's page doesn't spoil what's
 * about to be played — a "posted after the show" note renders in its place.
 *
 * Fetches from /api/public/shows/:gigId. Returns a 404-style "not found"
 * card if the gig doesn't exist or isn't public. No band-internal data is
 * ever exposed on a 404 — the message is the same in either case.
 */
function ShowPage() {
  const { gigId } = useParams();
  const [show, setShow] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || '/api';
    const base = apiUrl.endsWith('/api') ? apiUrl : `${apiUrl}/api`;
    fetch(`${base}/public/shows/${encodeURIComponent(gigId)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Show not found or not public.');
        return r.json();
      })
      .then(setShow)
      .catch((err) => setError(err.message || 'Failed to load show'))
      .finally(() => setLoading(false));
  }, [gigId]);

  useEffect(() => {
    if (show) {
      document.title = `${show.title} — ${show.bandName} · BandChat`;
    }
  }, [show]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // best-effort; some browsers without clipboard permission silently fail
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <div className="text-[var(--color-text-muted)]">Loading…</div>
      </div>
    );
  }

  if (error || !show) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">Show not found</h1>
          <p className="text-[var(--color-text-muted)]">
            This show page isn&apos;t available. The band may have unpublished it, or the link may be incorrect.
          </p>
        </div>
      </div>
    );
  }

  const dateLabel = (() => {
    try {
      const d = new Date(show.date);
      const e = show.endDate ? new Date(show.endDate) : null;
      const sameDay = !e || format(d, 'yyyy-MM-dd') === format(e, 'yyyy-MM-dd');
      return sameDay ? format(d, 'EEEE, d MMMM yyyy') : `${format(d, 'd MMM')} – ${format(e, 'd MMM yyyy')}`;
    } catch {
      return show.date;
    }
  })();

  const songs = show.setlist.filter((i) => i.type === 'song');
  const images = show.media.filter((m) => m.type === 'image');
  const videos = show.media.filter((m) => m.type === 'video' || m.type === 'youtube');

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* Header */}
        <header className="mb-8">
          <p className="text-sm uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
            {show.bandName}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold mb-2 break-words">{show.title}</h1>
          <p className="text-[var(--color-text-secondary)]">{dateLabel}</p>
          {show.venue && (
            <p className="text-[var(--color-text-secondary)] mt-1">
              <span aria-hidden="true">📍 </span>
              {show.venue}
              {show.address ? ` · ${show.address}` : ''}
            </p>
          )}
          <div className="mt-4">
            <button
              onClick={copyLink}
              className="text-sm px-3 py-1.5 rounded bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]"
              aria-label="Copy link to this show page"
            >
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </header>

        {/* Setlist */}
        {show.setlistRevealed === false ? (
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-3">Setlist</h2>
            <p className="text-[var(--color-text-muted)] italic">Setlist will be posted after the show.</p>
          </section>
        ) : show.setlist.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-3">Setlist</h2>
            <ol className="space-y-1">
              {(() => {
                let songNum = 0;
                return show.setlist.map((item, idx) => {
                  if (item.type === 'set_break') {
                    return (
                      <li key={`break-${idx}`} className="pt-3 pb-1 text-sm uppercase tracking-wider text-[var(--color-text-muted)]">
                        — {item.label} —
                      </li>
                    );
                  }
                  if (item.type === 'mc') {
                    return (
                      <li key={`mc-${idx}`} className="py-1 italic text-[var(--color-text-muted)]">
                        {item.label}
                      </li>
                    );
                  }
                  songNum++;
                  return (
                    <li
                      key={`song-${idx}`}
                      className="flex items-baseline gap-3 py-1 border-b border-[var(--color-border)]/50"
                    >
                      <span className="text-[var(--color-text-muted)] w-6 text-right tabular-nums">{songNum}.</span>
                      <span className="flex-1 min-w-0">
                        <span className="font-medium">{item.title}</span>
                        {item.artist && (
                          <span className="text-[var(--color-text-muted)]"> — {item.artist}</span>
                        )}
                      </span>
                    </li>
                  );
                });
              })()}
            </ol>
            {songs.length === 0 && (
              <p className="text-[var(--color-text-muted)] italic">No songs recorded for this show.</p>
            )}
          </section>
        )}

        {/* Photos */}
        {images.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-3">Photos</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {images.map((m) => (
                <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" className="block aspect-square overflow-hidden rounded bg-[var(--color-bg-tertiary)]">
                  <img
                    src={m.thumbnailUrl || m.url}
                    alt={m.caption || 'Show photo'}
                    loading="lazy"
                    className="w-full h-full object-cover hover:scale-105 transition-transform"
                  />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Videos */}
        {videos.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold mb-3">Video</h2>
            <ul className="space-y-2">
              {videos.map((m) => (
                <li key={m.id}>
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block p-3 rounded bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-tertiary)] border border-[var(--color-border)]"
                  >
                    <span aria-hidden="true">▶ </span>
                    {m.caption || (m.type === 'youtube' ? 'Watch on YouTube' : 'Watch video')}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Footer */}
        <footer className="mt-16 pt-6 border-t border-[var(--color-border)] text-center text-sm text-[var(--color-text-muted)]">
          <p>
            Powered by{' '}
            <a href="/" className="text-[var(--color-primary)] hover:underline">
              BandChat
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

export default ShowPage;
