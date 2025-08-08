"use client";
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import {
  Wallet,
  Loader,
  AlertCircle,
  CheckCircle,
  Receipt,
  IndianRupee,
  ChevronLeft,
  ChevronRight,
  Send,
  X,
} from 'lucide-react';
import {
  XMarkIcon,
  BuildingStorefrontIcon, // New icon for shops
} from "@heroicons/react/24/outline";

// =============================================================
// Main Shop Wallet UI Component (Similar to WalletAndSyncUI for customers)
// =============================================================
const ShopWalletAndSyncUI = ({ shopId }) => {
  const [showShopWalletModal, setShowShopWalletModal] = useState(false);
  const [walletBalance, setWalletBalance] = useState(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(true);
  const [errorBalance, setErrorBalance] = useState(null);
  const [showCashbackPopup, setShowCashbackPopup] = useState(false); // New state for cashback popup

  const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app'; // Ensure this matches your backend URL

  const fetchShopWalletBalance = useCallback(async () => {
    if (!shopId) {
      setErrorBalance('SHOP ID NOT AVAILABLE.');
      setIsLoadingBalance(false);
      return;
    }

    try {
      setIsLoadingBalance(true);
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/wallet`);

      if (!response.ok) {
        throw new Error('Failed to fetch shop wallet balance');
      }

      const data = await response.json();
      // Calculate the total balance by summing the 'balance' property of all transactions.
      const totalBalance = data.transactions.reduce((accumulator, transaction) => {
        return accumulator + parseFloat(transaction.balance);
      }, 0); 

      setWalletBalance(totalBalance);
      setErrorBalance(null);

      // --- NEW: CALL THE SHOP CASHBACK CHECK ROUTE ---
      try {
        const cashbackCheckResponse = await fetch(`${API_BASE_URL}/api/check-shop-cashback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ shop_id: shopId }),
        });
        const cashbackData = await cashbackCheckResponse.json();
        
        if (cashbackData.showCashbackPopup) {
          setShowCashbackPopup(true);
          toast.success(`You have received a cashback of ₹${cashbackData.cashbackAmount}!`);
          // Re-fetch the wallet balance to show the updated amount immediately
          fetchShopWalletBalance();
        }

      } catch (cashbackError) {
        console.error('Error checking for shop cashback:', cashbackError);
        // Do not block the main wallet UI, but log the error
      }
      // --- END OF NEW CODE ---

    } catch (err) {
      console.error('Error fetching shop wallet balance:', err);
      setErrorBalance('FAILED TO LOAD BALANCE.');
    } finally {
      setIsLoadingBalance(false);
    }
  }, [shopId]);

  useEffect(() => {
    fetchShopWalletBalance();
  }, [fetchShopWalletBalance]);

  const handleOpenShopWalletModal = () => {
    setShowShopWalletModal(true);
  };

  const handleCloseShopWalletModal = () => {
    setShowShopWalletModal(false);
    fetchShopWalletBalance(); // Refresh balance when modal closes
  };

  return (
    <>
      <div className="flex flex-col items-center space-y-1">
        <div className="relative flex flex-col items-center">
          <button
            onClick={handleOpenShopWalletModal}
            className="relative group w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 rounded-full transition-all duration-300 transform hover:scale-105 flex items-center justify-center"
            aria-label="OPEN SHOP WALLET"
          >
            {isLoadingBalance ? (
              <Loader className="animate-spin h-4 w-4 text-white" />
            ) : errorBalance ? (
              <AlertCircle className="h-4 w-4 text-red-200" />
            ) : (
              <BuildingStorefrontIcon className="h-4 w-4 text-white group-hover:scale-110 transition-transform duration-200" />
            )}
            
            {isLoadingBalance && (
              <div className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-30"></div>
            )}
          </button>

          <div className="absolute top-7 text-white rounded-full min-w-[35px] text-center">
            {isLoadingBalance ? (
              <div className="flex items-center justify-center space-x-0.5">
                <div className="w-0.5 h-0.5 bg-gray-400 rounded-full animate-pulse"></div>
                <div className="w-0.5 h-0.5 bg-gray-400 rounded-full animate-pulse delay-75"></div>
                <div className="w-0.5 h-0.5 bg-gray-400 rounded-full animate-pulse delay-150"></div>
              </div>
            ) : errorBalance ? (
              <span className="text-[8px] font-bold text-red-600 tracking-wide uppercase">
                ERROR
              </span>
            ) : (
              <span className="text-[10px] font-semibold text-white tracking-wide uppercase">
               ₹{Math.abs(parseFloat(walletBalance)).toFixed(2)}

              </span>
            )}
          </div>
        </div>
      </div>

      {showShopWalletModal && (
        <ShopWalletModal
          shopId={shopId}
          onClose={handleCloseShopWalletModal}
          onWalletUpdate={fetchShopWalletBalance}
        />
      )}
      
    </>
  );
};

// =============================================================
// Shop Withdrawal Modal Component
// =============================================================
const ShopWithdrawalModal = ({ shopId, onClose, onWithdrawSuccess, withdrawalAmount }) => {
  const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app';
  const [upiId, setUpiId] = useState('');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const upiInputRef = useRef(null);
  const validateUpiId = (upiId) => {
    const upiPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/;
    return upiPattern.test(upiId);
  };
  useEffect(() => {
    if (upiInputRef.current) {
      setTimeout(() => {
        upiInputRef.current?.focus();
      }, 100);
    }
  }, []);
  const handleWithdraw = async () => {
    if (!upiId.trim() || !validateUpiId(upiId.trim())) {
      toast.error('Please enter a valid UPI ID.');
      return;
    }
    setIsWithdrawing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upi_id: upiId.trim(),
          withdrawalAmount: withdrawalAmount,
        }),
      });
      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || 'Failed to process withdrawal.');
      }
      toast.success('Withdrawal request submitted! Your funds will be processed shortly.');
      onWithdrawSuccess();
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (err) {
      console.error('Withdrawal error:', err);
      toast.error(err.message || 'An unexpected error occurred.');
    } finally {
      setIsWithdrawing(false);
    }
  };
  const isDisabled = isWithdrawing || !upiId.trim() || !validateUpiId(upiId.trim());
  return (
    <div className="absolute inset-0 bg-white z-20 flex flex-col p-5 animate-fade-in min-h-screen">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">
          WITHDRAW EARNINGS
        </h3>
        <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-200 transition-colors" aria-label="Close withdraw form">
          <XMarkIcon className="h-5 w-5 text-gray-600" />
        </button>
      </div>
      <div className="mt-4 flex flex-col flex-grow">
        <p className="text-sm text-gray-600 mb-4">
          Enter your UPI ID to withdraw the amount of ₹{parseFloat(withdrawalAmount).toFixed(2)} instantly to your account.
        </p>
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <IndianRupee className="h-4 w-4 text-gray-400" />
          </div>
          <input
            ref={upiInputRef}
            type="text"
            placeholder="Enter UPI ID (e.g., yourname@bank, 9876543210@ybl)"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            className="pl-8 w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-medium transition-colors text-black bg-white"
            required
            disabled={isWithdrawing}
          />
        </div>
        <div className="text-xs text-gray-500 mb-3">
          <p>Supported formats:</p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li>yourname@paytm</li>
            <li>yourname@gpay</li>
            <li>yourname@phonepe</li>
            <li>9876543210@ybl</li>
          </ul>
        </div>
        
        <button
          type="button"
          onClick={handleWithdraw}
          disabled={isDisabled}
          className={`w-full py-3 rounded-xl mt-[20px] font-bold uppercase tracking-wider flex items-center justify-center transition-all ${
            isDisabled
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700'
          }`}
        >
          {isWithdrawing ? (
            <>
              <Loader className="animate-spin h-4 w-4 mr-2" />
              Submitting Request...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              REQUEST WITHDRAWAL OF ₹{parseFloat(withdrawalAmount).toFixed(2)}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

// =============================================================
// Shop Wallet Modal Component
// =============================================================
const ShopWalletModal = ({ shopId, onClose, onWalletUpdate }) => {
  const [walletData, setWalletData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [hasPendingWithdrawal, setHasPendingWithdrawal] = useState(false);
  
  const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app';
  const TRANSACTIONS_PER_PAGE = 7;
  
  const fetchShopWalletDataOnly = useCallback(async () => {
    if (!shopId) return;
    setIsLoading(true);
    setError(null);

    try {
      const walletResponse = await fetch(`${API_BASE_URL}/shops/${shopId}/wallet`);

      if (!walletResponse.ok) {
        throw new Error('Failed to fetch shop wallet data');
      }

      const data = await walletResponse.json();
      
      const calculatedBalance = data.transactions.reduce((accumulator, transaction) => {
        return accumulator + parseFloat(transaction.balance);
      }, 0); 

      const updatedWalletData = {
        ...data,
        current_balance: calculatedBalance,
      };
      setWalletData(updatedWalletData);

      const isPending = data.transactions.some(tx => tx.status === 'Requested' && tx.type === 'withdrawal');
      setHasPendingWithdrawal(isPending);

    } catch (err) {
      console.error('Error fetching shop wallet data:', err);
      setError('FAILED TO LOAD WALLET DETAILS. PLEASE TRY AGAIN.');
    } finally {
      setIsLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    fetchShopWalletDataOnly();
  }, [fetchShopWalletDataOnly]);
  
  const handleWithdrawalSuccess = async () => {
    setHasPendingWithdrawal(true);
    await fetchShopWalletDataOnly();
    onWalletUpdate();
  }
  
  const TransactionTable = ({ transactions }) => {
    const sortedTransactions = [...transactions].sort((a, b) => b.id - a.id);
    const totalTransactions = sortedTransactions.length;
    const totalPages = Math.ceil(totalTransactions / TRANSACTIONS_PER_PAGE);
    const startIndex = (currentPage - 1) * TRANSACTIONS_PER_PAGE;
    const endIndex = startIndex + TRANSACTIONS_PER_PAGE;
    const currentTransactions = sortedTransactions.slice(startIndex, endIndex);

    const handlePreviousPage = () => {
      setCurrentPage(prev => Math.max(prev - 1, 1));
    };

    const handleNextPage = () => {
      setCurrentPage(prev => Math.min(prev + 1, totalPages));
    };

    const getFormattedAmount = (amount, status) => {
      if (status === 'Received') {
        return <span className="font-bold tracking-wider text-emerald-600">+₹{parseFloat(amount).toFixed(2)}</span>;
      }
      if (status === 'Withdrawn') {
        return <span className="font-bold tracking-wider text-red-600">-₹{parseFloat(amount).toFixed(2)}</span>;
      }
      if (status === 'Paid') {
        return <span className="font-bold tracking-wider text-red-600">-₹{parseFloat(amount).toFixed(2)}</span>;
      }
      if (status === 'Refund') {
        return <span className="font-bold tracking-wider text-red-600">-₹{parseFloat(amount).toFixed(2)}</span>;
      }
      if (status === 'Requested') {
        return <span className="font-bold tracking-wider text-yellow-600">₹{parseFloat(amount).toFixed(2)}</span>;
      }
      return <span>₹{parseFloat(amount).toFixed(2)}</span>;
    };

    return (
      <div className="mt-4">
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider">
                  DATE
                </th>
                <th scope="col" className="px-4 py-3 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider">
                  TYPE
                </th>
                <th scope="col" className="px-4 py-3 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider">
                  AMOUNT
                </th>
                <th scope="col" className="px-4 py-3 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider">
                  STATUS
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {currentTransactions.length > 0 ? (
                currentTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50 transition-colors duration-150">
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-gray-900 tracking-wide">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      {tx.type}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {getFormattedAmount(tx.amount, tx.status)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      <span className={`px-2 py-1 inline-flex text-[10px] leading-4 font-bold rounded-full uppercase tracking-wider ${
                      tx.status === 'Received'
                        ? 'bg-emerald-100 text-emerald-800'
                        : tx.status === 'Withdrawn'
                          ? 'bg-red-100 text-red-800'
                          : tx.status === 'Requested'
                            ? 'bg-yellow-100 text-yellow-800 animate-pulse'
                            : tx.status === 'Paid'
                            ? 'bg-red-800 text-white animate-pulse'
                            : 'bg-emerald-400 text-white'
                    }`}>
                        {tx.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center">
                    <div className="flex flex-col items-center space-y-2">
                      <Receipt className="h-10 w-10 text-gray-300" />
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        NO TRANSACTIONS FOUND
                      </p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                        YOUR TRANSACTION HISTORY WILL APPEAR HERE
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalTransactions > TRANSACTIONS_PER_PAGE && (
          <div className="flex items-center justify-between mt-4 px-2">
            <div className="text-xs text-gray-600 font-medium tracking-wide">
              SHOWING {startIndex + 1}-{Math.min(endIndex, totalTransactions)} OF {totalTransactions} TRANSACTIONS
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handlePreviousPage}
                disabled={currentPage === 1}
                className={`flex items-center p-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors ${
                  currentPage === 1
                    ? 'text-gray-400 bg-gray-100 cursor-not-allowed'
                    : 'text-gray-700 bg-gray-200 hover:bg-gray-300'
                }`}
              >
                <ChevronLeft className="h-3 w-3 mr-1" />
              </button>
              <span className="text-[10px] font-bold text-gray-700 px-2 tracking-wider">
                {currentPage} OF {totalPages}
              </span>
              <button
                onClick={handleNextPage}
                disabled={currentPage === totalPages}
                className={`flex items-center p-2 text-xs font-semibold uppercase tracking-wider rounded-lg transition-colors ${
                  currentPage === totalPages
                    ? 'text-gray-400 bg-gray-100 cursor-not-allowed'
                    : 'text-gray-700 bg-gray-200 hover:bg-gray-300'
                }`}
              >
                <ChevronRight className="h-3 w-3 ml-1" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return createPortal(
  <div className="fixed inset-0 z-50 bg-black bg-opacity-70 flex items-center justify-center animate-fade-in">
  <div className="bg-white w-screen h-screen shadow-none rounded-none animate-scale-up overflow-hidden">
        <div className="sticky top-0 bg-gradient-to-r from-indigo-500 to-purple-600 p-5 flex items-center justify-between">
          <h2 className="text-xl uppercase tracking-wider font-bold text-white flex items-center">
            <BuildingStorefrontIcon className="h-6 w-6 mr-2" />
            SHOP WALLET
          </h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full"
            aria-label="CLOSE SHOP WALLET MODAL"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-100px)] relative">
          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center text-gray-600 min-h-screen">
              <div className="relative">
                <Loader className="animate-spin mb-3 h-10 w-10 text-indigo-500" />
                <div className="absolute inset-0 h-10 w-10 border-4 border-indigo-200 rounded-full animate-pulse"></div>
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider">
                LOADING SHOP WALLET DATA...
              </p>
            </div>
          )}
          
          {error && (
            <div className="py-12 flex flex-col items-center justify-center text-red-600">
              <AlertCircle className="mb-3 h-10 w-10" />
              <p className="text-xs font-semibold uppercase tracking-wider text-center px-6">
                {error}
              </p>
            </div>
          )}

          {walletData && !isLoading && !error && (
            <div className="p-5">
              <div className="mb-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl text-center p-4">
                <p className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2">
                  CURRENT BALANCE
                </p>
                <p className="text-4xl font-extrabold text-indigo-600 tracking-wider">
                 ₹{Math.abs(parseFloat(walletData.current_balance)).toFixed(2)}

                </p>
                <div className="mt-3 flex items-center justify-center space-x-2">
                  <CheckCircle className="h-3 w-3 text-indigo-500" />
                  <span className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wider">
                    BALANCE UPDATED
                  </span>
                </div>
              </div>

              {walletData.current_balance > 0 && (
                <div className="mb-6 flex justify-center">
                  <button
                    onClick={() => setShowWithdrawForm(true)}
                    disabled={hasPendingWithdrawal}
                    className={`flex items-center px-5 py-3 font-bold rounded-full text-sm shadow-lg transition-colors
                      ${hasPendingWithdrawal 
                        ? 'bg-gray-400 text-white cursor-not-allowed' 
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {hasPendingWithdrawal ? 'PENDING WITHDRAWAL' : 'WITHDRAW TO UPI'}
                  </button>
                </div>
              )}

              <div className="border-t-2 border-gray-200 pt-3">
                <div className="flex items-center mb-4">
                  <Receipt className="h-5 w-5 text-gray-600 mr-2" />
                  <h4 className="text-lg font-bold text-gray-800 uppercase tracking-wider">
                    TRANSACTION HISTORY
                  </h4>
                </div>
                <TransactionTable transactions={walletData.transactions} />
              </div>
            </div>
          )}

          {showWithdrawForm && (
            <ShopWithdrawalModal
              shopId={shopId}
              onClose={() => setShowWithdrawForm(false)}
              onWithdrawSuccess={handleWithdrawalSuccess}
              withdrawalAmount={walletData.current_balance}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};


export default ShopWalletAndSyncUI;

