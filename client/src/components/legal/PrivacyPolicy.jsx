import { Link } from 'react-router-dom';
import Footer from '../common/Footer';

export default function PrivacyPolicy() {
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
            <h1 className="text-3xl font-bold mb-2 text-gray-900">Privacy Policy</h1>
            <p className="text-gray-500 text-sm mb-8">Last updated: March 1, 2026</p>

            <div className="space-y-6 text-[15px] leading-relaxed">
              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">1. Introduction</h2>
                <p>
                  BandChat ("we", "our", "us") is a communication and management application for bands
                  and musicians. This Privacy Policy explains how we collect, use, and protect your personal
                  information when you use our service.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">2. Information We Collect</h2>
                <p className="mb-2">We collect the following information when you use BandChat:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Account information:</strong> Email address, display name, and password (or Google account ID if using Google Sign-In)</li>
                  <li><strong>Profile information:</strong> Profile picture and bio (optional)</li>
                  <li><strong>Messages and content:</strong> Messages you send in channels and direct messages, including text, images, and file attachments</li>
                  <li><strong>Band data:</strong> Songs, setlists, gig details, calendar events, contacts, and financial records you create within your workspaces</li>
                  <li><strong>Usage data:</strong> Device information and access logs necessary to provide and secure the service</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">3. How We Use Your Information</h2>
                <p className="mb-2">Your information is used solely to provide and improve the BandChat service:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>To create and manage your account</li>
                  <li>To deliver messages and notifications to you and your bandmates</li>
                  <li>To store and display your band's songs, setlists, gigs, and other data</li>
                  <li>To send transactional emails (account verification, password reset, workspace invitations)</li>
                  <li>To maintain the security and integrity of the service</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">4. What We Do NOT Do</h2>
                <p className="mb-2">We are committed to protecting your privacy:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>We do <strong>not</strong> sell, rent, or share your personal data with any third party for commercial purposes</li>
                  <li>We do <strong>not</strong> use your data for advertising or marketing purposes</li>
                  <li>We do <strong>not</strong> track you across other websites or applications</li>
                  <li>We do <strong>not</strong> use your data to build advertising profiles</li>
                  <li>We will <strong>never</strong> monetize your personal information</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">5. Third-Party Services</h2>
                <p className="mb-2">We use the following third-party services to operate BandChat:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Cloudinary:</strong> For hosting uploaded images and files</li>
                  <li><strong>Resend:</strong> For sending transactional emails (verification, password reset, invitations)</li>
                  <li><strong>Google OAuth:</strong> For optional Google Sign-In authentication</li>
                  <li><strong>Railway:</strong> For hosting our application and database</li>
                </ul>
                <p className="mt-2">
                  These services only receive the minimum data necessary to perform their function.
                  We do not share your messages, band data, or personal information with these services
                  beyond what is required for their operation.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">6. Data Storage and Security</h2>
                <p>
                  Your data is stored securely in a PostgreSQL database hosted on Railway.
                  Passwords are hashed using bcrypt. Authentication uses JWT tokens stored in your
                  browser's local storage. All data is transmitted over HTTPS.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">7. Data Retention and Deletion</h2>
                <p className="mb-2">
                  Your data is retained for as long as your account is active. You have the right to:
                </p>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Export your data:</strong> Download all your personal data as a JSON file from your account settings</li>
                  <li><strong>Delete your account:</strong> Permanently delete your account from the Security settings. When you delete your account, your personal information is removed and your messages are anonymized (attributed to "Deleted User")</li>
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">8. Cookies and Local Storage</h2>
                <p>
                  BandChat does not use tracking cookies. We use browser local storage solely to store
                  authentication tokens (JWT) that keep you logged in. No third-party cookies or
                  tracking pixels are used.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">9. Children's Privacy</h2>
                <p>
                  BandChat is not directed at children under 13. We do not knowingly collect personal
                  information from children under 13. If you believe a child under 13 has provided us
                  with personal information, please contact us so we can delete it.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">10. Changes to This Policy</h2>
                <p>
                  We may update this Privacy Policy from time to time. We will notify users of any
                  material changes by posting a notice within the application. Your continued use of
                  BandChat after changes are posted constitutes acceptance of the updated policy.
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">11. Contact Us</h2>
                <p>
                  If you have any questions about this Privacy Policy or your data, please contact us at{' '}
                  <a href="mailto:surista@gmail.com" className="text-slack-purple hover:underline">
                    surista@gmail.com
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
