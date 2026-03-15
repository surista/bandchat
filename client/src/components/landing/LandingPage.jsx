import { Link } from 'react-router-dom';
import Footer from '../common/Footer';

const FEATURES = [
  { icon: '\uD83D\uDCAC', title: 'Real-Time Messaging', desc: 'Channels, DMs, threads, reactions, and voice messages. Like Slack, but for your band.' },
  { icon: '\uD83C\uDFB5', title: 'Song Library', desc: 'Build your repertoire with automatic metadata from iTunes, Spotify, and YouTube. Lyrics, BPM, key \u2014 all in one place.' },
  { icon: '\uD83D\uDCCB', title: 'Setlist Builder', desc: 'Drag-and-drop setlists with MC notes, medleys, and PDF export. Take them on stage with Live Mode.' },
  { icon: '\uD83D\uDCC5', title: 'Gig Calendar', desc: 'Schedule gigs and rehearsals, track attendance, sync to your phone calendar, and share iCal feeds.' },
  { icon: '\uD83C\uDFB8', title: 'Live Mode', desc: 'On-stage setlist display optimized for performers. See what\u2019s next, track your set in real time.' },
  { icon: '\uD83D\uDCCA', title: 'Band Tools', desc: 'Announcements, polls, shared finances, contacts, achievements, and practice tracking.' },
  { icon: '\uD83D\uDD14', title: 'Push Notifications', desc: 'Never miss a gig update, new message, or last-minute setlist change.' },
  { icon: '\uD83C\uDFA8', title: '20+ Themes', desc: 'Customize your workspace with dark mode, light mode, and over 20 color themes.' },
  { icon: '\uD83D\uDCF1', title: 'iOS, Android & Web', desc: 'Native mobile apps plus a full web experience. Your band\u2019s always in your pocket.' },
];

const STEPS = [
  { num: '1', title: 'Create your workspace', desc: 'Sign up free and name your band\u2019s workspace. It takes 30 seconds.' },
  { num: '2', title: 'Invite your bandmates', desc: 'Share an invite link. They join instantly \u2014 no app download required for web.' },
  { num: '3', title: 'Start jamming', desc: 'Chat, build setlists, schedule gigs, and keep everyone on the same page.' },
];

const FREE_FEATURES = [
  'Up to 3 members',
  '20 songs, 3 setlists',
  '90-day message history',
  '500 MB storage',
  '3 themes',
];

const PRO_FEATURES = [
  'Unlimited members',
  'Unlimited songs & setlists',
  'Full message history',
  '10 GB storage',
  '20+ themes',
  'Band kitty, stats, practice tracker',
  'PDF setlist export',
];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#0f1117] text-white">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-40 bg-[#0f1117]/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/bc_icon_06.png" alt="BandChat" className="w-8 h-8 rounded-lg" />
            <span className="text-xl font-bold text-white">BandChat</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="px-4 py-2 text-sm font-medium text-white border border-white/30 rounded-lg hover:bg-white/10 transition-colors">
              Log In
            </Link>
            <Link to="/signup" className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors">
              Sign Up Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="min-h-screen flex flex-col items-center justify-center text-center px-6 pt-16 bg-gradient-to-b from-[#1a1d2e] to-[#0f1117]">
        <h1 className="text-5xl sm:text-7xl font-bold mb-6 tracking-tight text-white">
          Your band's <span className="landing-gradient-text">HQ</span>
        </h1>
        <p className="text-xl sm:text-2xl text-gray-200 max-w-2xl mx-auto mb-10 leading-relaxed">
          Chat, plan setlists, manage gigs, and keep your band in sync &mdash; all in one app built for musicians.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 mb-16">
          <Link to="/signup" className="px-8 py-4 text-lg font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors">
            Get Started Free
          </Link>
          <button
            onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
            className="px-8 py-4 text-lg font-semibold text-white border border-white/30 hover:bg-white/10 rounded-xl transition-colors"
          >
            See Features
          </button>
        </div>
        <div className="max-w-4xl w-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-[#1a1d2e] aspect-video flex items-center justify-center">
          <div className="text-center">
            <img src="/bc_icon_06.png" alt="BandChat" className="w-24 h-24 mx-auto mb-4 rounded-2xl" />
            <p className="text-gray-400 text-lg">App screenshot coming soon</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6 bg-[#0f1117]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4 text-white">
            Everything your band needs
          </h2>
          <p className="text-gray-300 text-lg text-center mb-16 max-w-2xl mx-auto">
            From rehearsal to stage, BandChat keeps your band organized and connected.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="landing-fade-up bg-[#1a1d2e] rounded-2xl p-6 border border-white/10 hover:border-green-500/50 transition-colors"
              >
                <div className="text-4xl mb-4">{f.icon}</div>
                <h3 className="text-xl font-semibold mb-2 text-white">{f.title}</h3>
                <p className="text-gray-300 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 px-6 bg-[#141722]">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16 text-white">
            Up and running in minutes
          </h2>
          <div className="landing-steps flex flex-col md:flex-row gap-12 items-start">
            {STEPS.map((s) => (
              <div key={s.num} className="flex-1 text-center relative z-10">
                <div className="w-16 h-16 rounded-full bg-green-600 text-white text-2xl font-bold flex items-center justify-center mx-auto mb-4">
                  {s.num}
                </div>
                <h3 className="text-xl font-semibold mb-2 text-white">{s.title}</h3>
                <p className="text-gray-300">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 px-6 bg-[#0f1117]">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4 text-white">Simple pricing</h2>
          <p className="text-gray-300 text-lg text-center mb-12">Start free. Upgrade when you're ready.</p>
          <div className="flex flex-col md:flex-row gap-8 max-w-3xl mx-auto">
            {/* Free */}
            <div className="flex-1 bg-[#1a1d2e] rounded-2xl p-8 border border-white/10">
              <h3 className="text-2xl font-bold mb-2 text-white">Free</h3>
              <div className="text-4xl font-bold mb-6 text-white">$0 <span className="text-lg text-gray-400 font-normal">/ month</span></div>
              <ul className="space-y-3 text-gray-200 mb-8">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="text-green-400">{'\u2713'}</span> {f}
                  </li>
                ))}
              </ul>
              <Link to="/signup" className="block text-center py-3 rounded-xl font-semibold text-white border border-white/20 hover:bg-white/10 transition-colors">
                Get Started
              </Link>
            </div>
            {/* Pro */}
            <div className="flex-1 bg-[#1a1d2e] rounded-2xl p-8 border-2 border-green-500 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full">
                MOST POPULAR
              </div>
              <h3 className="text-2xl font-bold mb-2 text-white">Pro</h3>
              <div className="text-4xl font-bold mb-6 text-white">$4.99 <span className="text-lg text-gray-400 font-normal">/ month</span></div>
              <ul className="space-y-3 text-gray-200 mb-8">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <span className="text-green-400">{'\u2713'}</span> {f}
                  </li>
                ))}
              </ul>
              <Link to="/signup" className="block text-center py-3 rounded-xl font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors">
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Download CTA */}
      <section className="py-24 px-6 bg-[#141722]">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-white">Take your band on the go</h2>
          <p className="text-gray-200 text-lg mb-8">
            Download BandChat and get push notifications, live mode, and your setlists on stage.
          </p>
          <a
            href="https://apps.apple.com/app/id6759870253"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mb-6"
          >
            <div className="inline-flex items-center gap-3 bg-black border border-white/20 rounded-xl px-6 py-3 hover:bg-gray-900 transition-colors">
              <svg className="w-8 h-8" viewBox="0 0 24 24" fill="white">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
              </svg>
              <div className="text-left">
                <div className="text-[10px] text-gray-300 leading-none">Download on the</div>
                <div className="text-xl font-semibold leading-tight text-white">App Store</div>
              </div>
            </div>
          </a>
          <p className="text-gray-300">
            Or <Link to="/signup" className="text-green-400 hover:text-green-300 underline">use BandChat on the web</Link> &mdash; no download needed.
          </p>
        </div>
      </section>

      {/* Footer - always visible at bottom */}
      <div className="mt-auto bg-[#0a0c12] border-t border-white/10">
        <Footer theme="dark" />
      </div>
    </div>
  );
}
