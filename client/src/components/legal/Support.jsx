import { Link } from 'react-router-dom';
import Footer from '../common/Footer';

const FAQ_SECTIONS = [
  {
    title: 'Getting Started',
    items: [
      {
        q: 'How do I create a workspace for my band?',
        a: 'After signing in, tap "Create Workspace" and follow the setup wizard. You\'ll name your workspace, create channels (like #general, #gig-chat, #setlists), and get an invite link to share with your bandmates.',
      },
      {
        q: 'How do I join an existing workspace?',
        a: 'Ask your band admin for an invite link. Click the link to join automatically. You can also enter an invite code from the workspace list screen. Invite links expire after 24 hours by default.',
      },
      {
        q: 'How do I invite my bandmates?',
        a: 'Go to workspace Settings (gear icon) and find the Invite section. You can copy the invite link to share, or send email invites directly. Admins can regenerate the invite code and set expiration times.',
      },
    ],
  },
  {
    title: 'For Admins',
    items: [
      {
        q: 'How do I make someone else an admin?',
        a: 'Go to Settings > Members tab. Next to the member\'s name, change the role dropdown from "Member" to "Admin". Admins can manage members, channels, workspace settings, and invite codes.',
      },
      {
        q: 'How do I manage channels?',
        a: 'Admins can create channels from the sidebar (+ button), rename or delete channels via right-click context menu, and organize them into collapsible groups. You can also set channel descriptions that appear in the header.',
      },
      {
        q: 'How do I remove someone from the workspace?',
        a: 'Go to Settings > Members tab and click the remove button next to their name. You can also remove members from individual channels via the members panel.',
      },
      {
        q: 'What\'s the difference between Free and Pro?',
        a: 'Free workspaces have limits on storage, members, songs, and some features like the gig archive and timeline. Pro workspaces unlock everything with no limits. Check Settings > Plan for details.',
      },
    ],
  },
  {
    title: 'Features',
    items: [
      {
        q: 'How do songs, setlists, and gigs work?',
        a: 'Use the Songs tab to build your repertoire (bulk import supported). Create setlists by dragging songs into order. Schedule gigs and rehearsals in the Calendar, then assign setlists to gigs. Track attendance and mark gigs as completed.',
      },
      {
        q: 'Can I format messages?',
        a: 'Yes! Use **bold**, *italic*, ~~strikethrough~~, `code`, and ```code blocks```. Start a line with > for blockquotes or - for bullet lists. On desktop, use the formatting toolbar or keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+E).',
      },
      {
        q: 'What are slash commands?',
        a: 'Type / at the start of a message to share band items in chat. Available commands: /setlist, /song, /gig, and /poll. Select an item from the picker and it will appear as a rich card in the conversation.',
      },
      {
        q: 'How is the setlist length calculated?',
        a: 'We show two numbers. "Actual" is the sum of each song\'s recorded duration — how long the songs would run back-to-back with no gaps. "With gaps" adds 15 seconds between each song to account for realistic transitions (tuning, banter, gear changes). The last song isn\'t padded because there\'s no transition after it. "With gaps" is what we use to compute the gig end time because it matches what a band actually takes on stage.',
      },
    ],
  },
  {
    title: 'Account & Security',
    items: [
      {
        q: 'How do I delete my account?',
        a: 'Go to Settings > Security > Delete My Account. You\'ll need to confirm with your password. Your account will be recoverable for 30 days, after which your data is permanently removed.',
      },
      {
        q: 'How do I change my password?',
        a: 'Go to Settings > Security > Change Password. If you signed up with Google, you can set a password to enable email/password login alongside Google sign-in.',
      },
      {
        q: 'How do I report a problem or inappropriate content?',
        a: 'Long-press (mobile) or right-click (desktop) any message to report it. For general issues, email us at admin@bandchat.app with a description.',
      },
    ],
  },
];

export default function Support() {
  return (
    <div className="min-h-screen bg-slack-purple flex flex-col">
      <div className="flex-1 p-4 sm:p-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-6">
            <Link to="/" className="text-gray-400 hover:text-white transition-colors text-sm">
              &larr; Back to BandChat
            </Link>
          </div>
          <div className="bg-white rounded-xl p-6 sm:p-10 text-gray-800">
            <h1 className="text-3xl font-bold mb-2 text-gray-900">Support</h1>
            <p className="text-gray-500 text-sm mb-8">Everything you need to know about BandChat</p>

            <div className="space-y-8 text-[15px] leading-relaxed">
              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Contact Us</h2>
                <p>
                  If you have questions, feedback, or need help with BandChat, reach out to us at:
                </p>
                <p className="mt-3">
                  <a
                    href="mailto:admin@bandchat.app?subject=BandChat Support"
                    className="text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    admin@bandchat.app
                  </a>
                </p>
                <p className="mt-1 text-gray-500 text-sm">We typically respond within 24 hours.</p>
              </section>

              {FAQ_SECTIONS.map((section) => (
                <section key={section.title}>
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">{section.title}</h2>
                  <div className="space-y-4">
                    {section.items.map((item) => (
                      <div key={item.q}>
                        <h3 className="font-medium text-gray-900">{item.q}</h3>
                        <p className="text-gray-600 mt-1">{item.a}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Policies</h2>
                <p>
                  <Link to="/privacy" className="text-indigo-600 hover:text-indigo-800">Privacy Policy</Link>
                  {' · '}
                  <Link to="/terms" className="text-indigo-600 hover:text-indigo-800">Terms of Service</Link>
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
