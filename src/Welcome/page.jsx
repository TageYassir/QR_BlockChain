import React from 'react';

export default function WelcomePage({ onNavigate, user }) {
  return (
    <div className="w-full max-w-2xl bg-white p-8 rounded-2xl shadow-lg text-center mx-auto mt-10">
      <div className="mb-6">
        <svg className="w-20 h-20 mx-auto text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      </div>
      <h1 className="text-3xl font-bold text-gray-800 mb-4">Welcome to ChainClaim</h1>
      <p className="text-gray-600 mb-8 leading-relaxed">
        The ultimate Supply Chain Tracking System with QR Codes for secure and immutable incident reporting. 
        Track vehicles, machinery, and user claims effectively through the blockchain.
      </p>
      
      <div className="space-y-4 sm:space-y-0 sm:space-x-4 flex flex-col sm:flex-row justify-center">
        {user ? (
          <button 
            onClick={() => onNavigate('claim')} 
            className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors shadow-md"
          >
            Start a Claim
          </button>
        ) : (
          <button 
            onClick={() => onNavigate('login')} 
            className="w-full sm:w-auto px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors shadow-md"
          >
            Login to Report
          </button>
        )}
        <button 
          onClick={() => onNavigate('global')} 
          className="w-full sm:w-auto px-6 py-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg font-semibold transition-colors shadow-sm"
        >
          View Global Ledger
        </button>
      </div>
    </div>
  );
}
