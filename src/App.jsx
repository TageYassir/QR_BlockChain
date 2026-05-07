import React, { useEffect, useState } from 'react';
import ClaimPage from './claim/page.jsx';
import WelcomePage from './Welcome/page.jsx';
import LoginPage from './Login/Page.jsx';
import HistoryPage from './History/page.jsx';
import GlobalClaimsPage from './GlobalClaims/page.jsx';
import EvidencePage from './Evidence/page.jsx';
import EvidenceUploadPage from './EvidenceUpload/page.jsx';

export default function App() {
  const initialEvidenceId = new URLSearchParams(window.location.search).get('evidence');
  const [currentPage, setCurrentPage] = useState(initialEvidenceId ? 'evidence' : 'welcome');
  const [userAddress, setUserAddress] = useState(null);
  const [currentClaimId, setCurrentClaimId] = useState(initialEvidenceId || null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const evidenceId = new URLSearchParams(window.location.search).get('evidence');
    if (evidenceId) {
      setCurrentClaimId(evidenceId);
      setCurrentPage('evidence');
    }
  }, []);

  const navigate = (page, opts) => {
    setMobileMenuOpen(false);
    setCurrentPage(page);
    if (opts && opts.claimId && page === 'evidence') {
      setCurrentClaimId(opts.claimId);
      const url = new URL(window.location.href);
      url.searchParams.set('evidence', opts.claimId);
      window.history.pushState({}, '', url);
    } else if (opts && opts.claimId && page === 'evidence-upload') {
      setCurrentClaimId(opts.claimId);
      const url = new URL(window.location.href);
      url.searchParams.delete('evidence');
      window.history.pushState({}, '', url);
    } else if (page !== 'evidence') {
      const url = new URL(window.location.href);
      url.searchParams.delete('evidence');
      window.history.pushState({}, '', url);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
      <header className="bg-indigo-600 text-white p-4 shadow-md relative">
        <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold cursor-pointer" onClick={() => navigate('welcome')}>ChainClaim</h1>
        <nav className="hidden md:flex space-x-4 text-sm font-medium">
          {userAddress && (
            <>
              <button onClick={() => navigate('claim')} className="hover:text-indigo-200">New Claim</button>
              <button onClick={() => navigate('history')} className="hover:text-indigo-200">My History</button>
              <button onClick={() => navigate('evidence-upload')} className="hover:text-indigo-200">Add Evidence</button>
            </>
          )}
          <button onClick={() => navigate('global')} className="hover:text-indigo-200">Global Ledger</button>
          {!userAddress ? (
            <button onClick={() => navigate('login')} className="hover:text-indigo-200">Login</button>
          ) : (
            <button onClick={() => { setUserAddress(null); navigate('welcome'); }} className="hover:text-indigo-200">Logout</button>
          )}
        </nav>
        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          className="md:hidden inline-flex items-center justify-center rounded-md border border-indigo-300 px-3 py-2 text-white"
          aria-label="Toggle menu"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden mt-3 rounded-lg bg-indigo-700/95 p-3 space-y-2 text-sm font-medium">
            {userAddress && (
              <>
                <button onClick={() => navigate('claim')} className="block w-full text-left px-3 py-2 rounded hover:bg-indigo-600">New Claim</button>
                <button onClick={() => navigate('history')} className="block w-full text-left px-3 py-2 rounded hover:bg-indigo-600">My History</button>
                <button onClick={() => navigate('evidence-upload')} className="block w-full text-left px-3 py-2 rounded hover:bg-indigo-600">Add Evidence</button>
              </>
            )}
            <button onClick={() => navigate('global')} className="block w-full text-left px-3 py-2 rounded hover:bg-indigo-600">Global Ledger</button>
            {!userAddress ? (
              <button onClick={() => navigate('login')} className="block w-full text-left px-3 py-2 rounded hover:bg-indigo-600">Login</button>
            ) : (
              <button onClick={() => { setUserAddress(null); navigate('welcome'); }} className="block w-full text-left px-3 py-2 rounded hover:bg-indigo-600">Logout</button>
            )}
          </div>
        )}
      </header>

      <main className="flex-grow p-4 md:p-8 flex justify-center items-start">
        {currentPage === 'welcome' && <WelcomePage onNavigate={navigate} user={userAddress} />}
        {currentPage === 'login' && <LoginPage onNavigate={navigate} onLogin={setUserAddress} />}
        {currentPage === 'claim' && <ClaimPage onNavigate={navigate} userAddress={userAddress} />}
        {currentPage === 'history' && <HistoryPage userAddress={userAddress} onNavigate={navigate} />}
        {currentPage === 'global' && <GlobalClaimsPage onNavigate={navigate} userAddress={userAddress} />}
        {currentPage === 'evidence' && <EvidencePage claimId={currentClaimId} />}
        {currentPage === 'evidence-upload' && <EvidenceUploadPage onNavigate={navigate} userAddress={userAddress} claimId={currentClaimId} />}
      </main>
      
      <footer className="bg-gray-200 text-center p-4 text-xs text-gray-500 mt-auto">
        &copy; {new Date().getFullYear()} Supply Chain Tracking System with QR Codes.
      </footer>
    </div>
  );
}
