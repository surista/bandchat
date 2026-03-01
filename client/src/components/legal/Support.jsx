import { Link } from 'react-router-dom';
import Footer from '../common/Footer';

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
            <p className="text-gray-500 text-sm mb-8">We're here to help</p>

            <div className="space-y-6 text-[15px] leading-relaxed">
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

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Common Questions</h2>
                <div className="space-y-4">
                  <div>
                    <h3 className="font-medium text-gray-900">How do I create a workspace?</h3>
                    <p className="text-gray-600 mt-1">
                      After signing in, tap "Create Workspace" and follow the setup wizard. You can name your workspace, create channels, and invite your bandmates.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">How do I join an existing workspace?</h3>
                    <p className="text-gray-600 mt-1">
                      Ask your band admin for an invite code or link. You can enter the code from the workspace list screen.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">How do I delete my account?</h3>
                    <p className="text-gray-600 mt-1">
                      Go to Settings and scroll to the bottom. You'll find the option to export your data and delete your account. This action is permanent.
                    </p>
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">How do I report a problem?</h3>
                    <p className="text-gray-600 mt-1">
                      Email us at{' '}
                      <a href="mailto:admin@bandchat.app?subject=Bug Report" className="text-indigo-600 hover:text-indigo-800">
                        admin@bandchat.app
                      </a>{' '}
                      with a description of the issue and we'll look into it.
                    </p>
                  </div>
                </div>
              </section>

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
