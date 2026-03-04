import { Link } from 'react-router-dom';
import Footer from '../common/Footer';

export default function TermsOfService() {
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
            <h1 className="text-3xl font-bold mb-2 text-gray-900">Terms of Service</h1>
            <p className="text-gray-500 text-sm mb-8">Last updated: March 4, 2026</p>

            <div className="space-y-6 text-[15px] leading-relaxed">
              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h2>
                <p>
                  By creating an account or using BandChat ("the Service"), you agree to be bound by
                  these Terms of Service. If you do not agree to these terms, do not use the Service.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">2. Description of Service</h2>
                <p>
                  BandChat is a communication and management platform designed for bands and musicians.
                  It provides real-time messaging, song and setlist management, gig scheduling, and other
                  tools to help bands organize and collaborate.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">3. Account Registration</h2>
                <ul className="list-disc pl-6 space-y-1">
                  <li>You must provide accurate and complete information when creating an account</li>
                  <li>You are responsible for maintaining the security of your account credentials</li>
                  <li>You must notify us immediately of any unauthorized access to your account</li>
                  <li>You may not create accounts for the purpose of spamming or harassing others</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">4. Acceptable Use</h2>
                <p className="mb-2">You agree not to use BandChat to:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Send or share content that is illegal, harmful, threatening, abusive, harassing, defamatory, or otherwise objectionable</li>
                  <li>Impersonate any person or entity</li>
                  <li>Upload viruses, malware, or other harmful code</li>
                  <li>Attempt to gain unauthorized access to other users' accounts or data</li>
                  <li>Use the Service for any commercial purpose unrelated to band management</li>
                  <li>Interfere with or disrupt the Service or its infrastructure</li>
                  <li>Harvest or collect information about other users without their consent</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">5. Content Ownership</h2>
                <p className="mb-2">
                  You retain ownership of all content you create or upload to BandChat, including
                  messages, images, songs, setlists, and other data. By using the Service, you grant
                  us a limited license to store, display, and transmit your content solely for the
                  purpose of providing the Service to you and your workspace members.
                </p>
                <p>
                  We do not claim ownership of your content and will not use it for any purpose
                  other than operating the Service.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">6. Content Moderation & Zero Tolerance Policy</h2>
                <p className="mb-3 font-medium text-red-700 bg-red-50 p-3 rounded-lg">
                  BandChat has zero tolerance for objectionable content or abusive users. Violations
                  will result in immediate account suspension or termination.
                </p>
                <p className="mb-2">Objectionable content includes, but is not limited to:</p>
                <ul className="list-disc pl-6 space-y-1 mb-3">
                  <li>Hate speech, discrimination, or content promoting violence</li>
                  <li>Harassment, bullying, or threats directed at other users</li>
                  <li>Sexually explicit or pornographic material</li>
                  <li>Content that exploits or endangers minors</li>
                  <li>Spam, scams, or fraudulent content</li>
                  <li>Content that infringes on intellectual property rights</li>
                </ul>
                <p className="mb-2"><strong>Reporting:</strong> Users can report objectionable content by long-pressing
                  (mobile) or right-clicking (web) on any message and selecting "Report". All reports
                  are reviewed by our team within 24 hours.</p>
                <p className="mb-2"><strong>Blocking:</strong> Users can block abusive users via their profile.
                  Blocked users' content is immediately hidden from your view.</p>
                <p><strong>Enforcement:</strong> We will remove objectionable content and take action against
                  violating accounts within 24 hours of a valid report. Actions may include content removal,
                  temporary suspension, or permanent account termination.</p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">7. Account Termination</h2>
                <p className="mb-2">
                  You may delete your account at any time through the Security settings. When you
                  delete your account:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Your personal information (email, display name, avatar) is permanently deleted</li>
                  <li>Your messages are anonymized and attributed to "Deleted User"</li>
                  <li>This action cannot be undone</li>
                </ul>
                <p className="mt-2">
                  We reserve the right to suspend or terminate accounts that violate these terms,
                  with or without notice.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">8. Disclaimer of Warranties</h2>
                <p>
                  BandChat is provided "as is" and "as available" without warranties of any kind,
                  either express or implied. We do not warrant that the Service will be uninterrupted,
                  error-free, or secure. You use the Service at your own risk.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">9. Limitation of Liability</h2>
                <p>
                  To the maximum extent permitted by law, BandChat and its operators shall not be
                  liable for any indirect, incidental, special, consequential, or punitive damages,
                  including loss of data, revenue, or profits, arising out of your use of or inability
                  to use the Service.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">10. Changes to Terms</h2>
                <p>
                  We may update these Terms of Service from time to time. We will notify users of
                  material changes by posting a notice within the application. Your continued use of
                  BandChat after changes are posted constitutes acceptance of the updated terms.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">11. Contact</h2>
                <p>
                  If you have questions about these Terms of Service, please contact us at{' '}
                  <a href="mailto:admin@bandchat.app" className="text-slack-purple hover:underline">
                    admin@bandchat.app
                  </a>.
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
      <Footer theme="dark" />
    </div>
  );
}
