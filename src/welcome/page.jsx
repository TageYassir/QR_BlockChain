import Link from 'next/link';

export default function WelcomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center p-6">
      <div className="max-w-xl w-full bg-white shadow-lg rounded-xl p-6">
        <h1 className="text-2xl font-semibold text-slate-800 mb-2">Welcome to Report Incident</h1>
        <p className="text-sm text-slate-600 mb-4">
          Use this app to submit incident reports, upload images (IDs, handwritten notes), capture the location,
          and keep a QR-backed record linked to your account.
        </p>

        <div className="space-y-3">
          <Link href="/claim">
            <a className="w-full inline-flex items-center justify-center px-4 py-3 bg-indigo-600 text-white rounded-md shadow hover:bg-indigo-700">
              Start a Claim
            </a>
          </Link>

          <Link href="/claims/history">
            <a className="w-full inline-flex items-center justify-center px-4 py-3 border border-slate-200 rounded-md text-slate-700 hover:bg-slate-50">
              My Claims
            </a>
          </Link>

          <Link href="/claims/all">
            <a className="w-full text-sm text-slate-500 underline">View transactions (all claims)</a>
          </Link>
        </div>
      </div>
    </div>
  );
}