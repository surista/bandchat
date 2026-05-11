import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

/**
 * Public booking-request form at /book/:slug.
 *
 * Two phases:
 *   1. Loading — fetch band info (or 404)
 *   2. Form    — collect name, email, phone, venue, date, fee, message
 *   3. Success — confirmation message
 *
 * Submission is rate-limited server-side via `publicFormLimiter` (20/h/IP).
 * Email format + length validation happens both client- and server-side.
 */
function BookingForm() {
  const { slug } = useParams();
  const [band, setBand] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    requesterName: '',
    requesterEmail: '',
    requesterPhone: '',
    venueName: '',
    eventDate: '',
    feeOffer: '',
    message: '',
  });

  const apiBase = (() => {
    const apiUrl = import.meta.env.VITE_API_URL || '/api';
    return apiUrl.endsWith('/api') ? apiUrl : `${apiUrl}/api`;
  })();

  useEffect(() => {
    fetch(`${apiBase}/bookings/public/${encodeURIComponent(slug)}`)
      .then((r) => {
        if (!r.ok) throw new Error('Booking page not found.');
        return r.json();
      })
      .then(setBand)
      .catch((err) => setLoadError(err.message || 'Failed to load'))
      .finally(() => setLoading(false));
  }, [slug, apiBase]);

  useEffect(() => {
    if (band) document.title = `Book ${band.bandName} · BandChat`;
  }, [band]);

  const handleChange = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);

    // Light client-side validation; server has the authoritative checks.
    if (form.requesterName.trim().length < 2) return setSubmitError('Please enter your name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.requesterEmail)) return setSubmitError('Please enter a valid email address.');
    if (form.message.trim().length < 5) return setSubmitError('Please tell us a bit about the event.');

    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/bookings/public/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to submit');
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err.message || 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center">
        <div className="text-[var(--color-text-muted)]">Loading…</div>
      </div>
    );
  }

  if (loadError || !band) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)] mb-2">Booking page not found</h1>
          <p className="text-[var(--color-text-muted)]">
            This band doesn&apos;t have a booking page set up, or the link is incorrect.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-primary)] flex items-center justify-center p-6 text-[var(--color-text-primary)]">
        <div className="max-w-md text-center">
          <div className="text-5xl mb-4" aria-hidden="true">✓</div>
          <h1 className="text-2xl font-bold mb-2">Request sent</h1>
          <p className="text-[var(--color-text-secondary)]">
            Thanks for reaching out to {band.bandName}. They&apos;ll get back to you at{' '}
            <strong>{form.requesterEmail}</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <main className="max-w-xl mx-auto px-4 sm:px-6 py-10">
        <header className="mb-8">
          <p className="text-sm uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Book</p>
          <h1 className="text-3xl sm:text-4xl font-bold break-words">{band.bandName}</h1>
          <p className="text-[var(--color-text-secondary)] mt-2">
            Tell the band about your event. They&apos;ll reply directly to your email.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label htmlFor="bk-name" className="block text-sm font-medium mb-1">Your name <span className="text-red-400">*</span></label>
            <input
              id="bk-name"
              type="text"
              required
              autoComplete="name"
              value={form.requesterName}
              onChange={handleChange('requesterName')}
              className="w-full px-3 py-2 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none"
              maxLength={120}
            />
          </div>

          <div>
            <label htmlFor="bk-email" className="block text-sm font-medium mb-1">Email <span className="text-red-400">*</span></label>
            <input
              id="bk-email"
              type="email"
              required
              autoComplete="email"
              value={form.requesterEmail}
              onChange={handleChange('requesterEmail')}
              className="w-full px-3 py-2 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none"
              maxLength={200}
            />
          </div>

          <div>
            <label htmlFor="bk-phone" className="block text-sm font-medium mb-1">Phone <span className="text-[var(--color-text-muted)] text-xs">(optional)</span></label>
            <input
              id="bk-phone"
              type="tel"
              autoComplete="tel"
              value={form.requesterPhone}
              onChange={handleChange('requesterPhone')}
              className="w-full px-3 py-2 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none"
              maxLength={40}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="bk-venue" className="block text-sm font-medium mb-1">Venue <span className="text-[var(--color-text-muted)] text-xs">(optional)</span></label>
              <input
                id="bk-venue"
                type="text"
                value={form.venueName}
                onChange={handleChange('venueName')}
                className="w-full px-3 py-2 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none"
                maxLength={200}
              />
            </div>
            <div>
              <label htmlFor="bk-date" className="block text-sm font-medium mb-1">Event date <span className="text-[var(--color-text-muted)] text-xs">(optional)</span></label>
              <input
                id="bk-date"
                type="date"
                value={form.eventDate}
                onChange={handleChange('eventDate')}
                className="w-full px-3 py-2 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="bk-fee" className="block text-sm font-medium mb-1">Fee offer <span className="text-[var(--color-text-muted)] text-xs">(optional — &quot;$500&quot;, &quot;negotiable&quot;, etc.)</span></label>
            <input
              id="bk-fee"
              type="text"
              value={form.feeOffer}
              onChange={handleChange('feeOffer')}
              className="w-full px-3 py-2 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none"
              maxLength={60}
            />
          </div>

          <div>
            <label htmlFor="bk-message" className="block text-sm font-medium mb-1">Details <span className="text-red-400">*</span></label>
            <textarea
              id="bk-message"
              required
              value={form.message}
              onChange={handleChange('message')}
              rows={5}
              maxLength={4000}
              placeholder="What's the event? How long is the set? What time? Any other details that'd help us decide."
              className="w-full px-3 py-2 rounded bg-[var(--color-bg-secondary)] border border-[var(--color-border)] focus:border-[var(--color-primary)] outline-none resize-y"
            />
          </div>

          {submitError && (
            <div role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-2.5 rounded bg-[var(--color-primary)] text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Sending…' : 'Send request'}
          </button>
        </form>

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

export default BookingForm;
