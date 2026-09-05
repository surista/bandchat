import express from 'express';
import prisma from '../lib/prisma.js';

const router = express.Router();

/**
 * GET /api/public/shows/:gigId
 *
 * Public-facing "show page" for any gig the band has explicitly marked
 * public (`Gig.isPublic = true`) — including an upcoming one, since bands
 * also use this to promote a show before it happens. No auth required.
 *
 * The setlist itself is withheld (`setlistRevealed: false`, empty `setlist`)
 * until the gig's `status` is COMPLETED, so a setlist attached ahead of time
 * doesn't spoil an upcoming show. Everything else — title/date/venue/media —
 * is shown regardless, since that's the promotional use case.
 *
 * Sanitizes the response to expose only what a fan would care about — band
 * name, gig title/date/venue, setlist song titles + artists (no key/bpm),
 * and public media (image/youtube/video URLs already stored in R2/YouTube,
 * already public). Strips workspace IDs, member IDs, attendee lists, notes,
 * pay, internal status — all band-internal data.
 *
 * Rate-limited via the global `apiLimiter` mounted on `/api/*` in app.js,
 * which falls back to req.ip for anonymous requests.
 */
router.get('/:gigId', async (req, res) => {
  try {
    const gig = await prisma.gig.findUnique({
      where: { id: req.params.gigId },
      include: {
        workspace: { select: { name: true } },
        setlists: {
          include: {
            setlist: {
              include: {
                songs: {
                  orderBy: { position: 'asc' },
                  include: {
                    song: { select: { title: true, artist: true } },
                  },
                },
              },
            },
          },
        },
        media: {
          where: { type: { in: ['image', 'youtube', 'video'] } },
          orderBy: { createdAt: 'asc' },
          // GigMedia has no thumbnailUrl column — selecting one threw a Prisma
          // validation error that the catch below turned into a blanket 500, so
          // every show page was unreachable. ShowPage.jsx already falls back to
          // the full-size url. Add the column here (and to the upload path) if
          // gig media ever grows thumbnails.
          select: { id: true, type: true, url: true, caption: true },
        },
      },
    });

    if (!gig || !gig.isPublic) {
      return res.status(404).json({ error: 'Show not found' });
    }

    // Withhold the setlist until the show has actually happened — a band may
    // publicize a show page ahead of time to promote the gig, and a setlist
    // attached in advance shouldn't spoil what's about to be played. `status`
    // only flips to COMPLETED via the explicit "complete gig" action
    // (gigs.js), which is a more reliable signal than comparing `date` to now
    // (a gig can run late, or a band may complete it a day after).
    const setlistRevealed = gig.status === 'COMPLETED';

    // Flatten setlist songs across all sets, preserving order. Each item is
    // either a real song (title + artist), a SET_BREAK marker, or an MC
    // section. Internal fields (key, bpm, attachments, notes) are dropped.
    const setlistItems = setlistRevealed
      ? gig.setlists.flatMap((gs) =>
          (gs.setlist?.songs || []).map((s) => {
            if (s.type === 'SET_BREAK') {
              return { type: 'set_break', label: s.label || 'Set Break' };
            }
            if (s.type === 'MC') {
              return { type: 'mc', label: s.label || 'MC' };
            }
            return {
              type: 'song',
              title: s.song?.title || 'Unknown',
              artist: s.song?.artist || null,
            };
          })
        )
      : [];

    res.json({
      gigId: gig.id,
      bandName: gig.workspace.name,
      title: gig.title,
      date: gig.date,
      endDate: gig.endDate,
      venue: gig.venue,
      address: gig.address,
      setlist: setlistItems,
      setlistRevealed,
      media: gig.media,
    });
  } catch (error) {
    console.error('Get public show error:', error);
    res.status(500).json({ error: 'Failed to load show' });
  }
});

export default router;
