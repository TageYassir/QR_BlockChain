import React, { useState } from 'react';
import ClaimPage from './claim/page.jsx';
import WelcomePage from './Welcome/page.jsx';
import LoginPage from './Login/page.jsx';
import HistoryPage from './History/page.jsx';
import GlobalClaimsPage from './GlobalClaims/page.jsx';

export default function App() {
  const [currentPage, setCurrentPage] = useState('welcome');
  const [userAddress, setUserAddress] = useState(null);

  const navigate = (page) => setCurrentPage(page);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800">
      <header className="bg-indigo-600 text-white p-4 shadow-md flex justify-between items-center">
        <h1 className="text-xl font-bold cursor-pointer" onClick={() => navigate('welcome')}>ChainClaim</h1>
        <nav className="flex space-x-4 text-sm font-medium">
          {userAddress && (
            <>
              <button onClick={() => navigate('claim')} className="hover:text-indigo-200">New Claim</button>
              <button onClick={() => navigate('history')} className="hover:text-indigo-200">My History</button>
            </>
          )}
          <button onClick={() => navigate('global')} className="hover:text-indigo-200">Global Ledger</button>
          {!userAddress ? (
            <button onClick={() => navigate('login')} className="hover:text-indigo-200">Login</button>
          ) : (
            <button onClick={() => { setUserAddress(null); navigate('welcome'); }} className="hover:text-indigo-200">Logout</button>
          )}
        </nav>
      </header>

      <main className="flex-grow p-4 md:p-8 flex justify-center items-start">
        {currentPage === 'welcome' && <WelcomePage onNavigate={navigate} user={userAddress} />}
        {currentPage === 'login' && <LoginPage onNavigate={navigate} onLogin={setUserAddress} />}
        {currentPage === 'claim' && <ClaimPage onNavigate={navigate} userAddress={userAddress} />}
        {currentPage === 'history' && <HistoryPage userAddress={userAddress} />}
        {currentPage === 'global' && <GlobalClaimsPage />}
      </main>
      
      <footer className="bg-gray-200 text-center p-4 text-xs text-gray-500 mt-auto">
        &copy; {new Date().getFullYear()} Supply Chain Tracking System with QR Codes.
      </footer>
    </div>
  );
}
