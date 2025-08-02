"use client"
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader,
  AlertCircle,
  Receipt,
  IndianRupee,
  X,
  CheckCircle,
  BarChart,
  RefreshCcw,
  ArrowUpCircle,
  ArrowDownCircle,
  Hourglass,
  ExternalLink,
  Users,
  CreditCard,
  TrendingUp,
  Briefcase,
  Percent,
} from 'lucide-react';
import QRCode from 'react-qr-code';

// Use this to style the page and modal with Tailwind CSS.
// Tailwind is assumed to be available.
const App = () => {
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [isGettingUpi, setIsGettingUpi] = useState(false);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [upiLink, setUpiLink] = useState(null);

  // State for custom messages (to replace alert())
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success'); // 'success' or 'error'

  const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app';

  // Custom message display component
  const AlertMessage = ({ message, type, onClose }) => {
    if (!message) return null;
    return createPortal(
      <div className="fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg border animate-slide-in-from-right transition-transform">
        <div className={`flex items-center space-x-3 ${type === 'success' ? 'bg-green-700 border-green-500 text-green-100' : 'bg-red-700 border-red-500 text-red-100'}`}>
          {type === 'success' ? <CheckCircle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          <span className="text-sm font-medium">{message}</span>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-600 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>,
      document.body
    );
  };

  const showMessage = (msg, type) => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 5000);
  };

  /**
   * Fetches all wallet transactions for the admin dashboard.
   */
  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/wallet-transactions`);
      if (!response.ok) {
        throw new Error('Failed to fetch admin transactions');
      }
      const data = await response.json();
      setTransactions(data);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError('Failed to load transaction data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch transactions on initial component load
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  /**
   * Handles the admin's action to get a UPI link for a pending withdrawal.
   * This function does not update the database.
   * @param {object} transaction The transaction object to process.
   */
  const handlePayWithdrawal = async (transaction) => {
    setIsGettingUpi(true);
    setSelectedTransaction(transaction);
    setUpiLink(null);

    try {
      // The API endpoint should return a full UPI payment link
      const response = await fetch(`${API_BASE_URL}/admin/pay-withdrawal/${transaction.id}`, {
        method: 'GET',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process withdrawal payment.');
      }

      const responseData = await response.json();
      setUpiLink(responseData.upiLink);

      // Show the UPI modal with the link
      setShowUpiModal(true);

    } catch (err) {
      console.error('Error getting withdrawal details:', err);
      showMessage(`Error: ${err.message}`, 'error');
    } finally {
      setIsGettingUpi(false);
    }
  };

  /**
   * Confirms the payment and updates the transaction status in the database.
   * This is called from the modal after the admin has manually paid.
   * @param {string} transactionId The ID of the transaction to confirm.
   */
  const handleConfirmPayment = async (transactionId) => {
    setIsConfirmingPayment(true);
    try {
      const response = await fetch(`${API_BASE_URL}/admin/confirm-withdrawal/${transactionId}`, {
        method: 'PUT',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to confirm withdrawal payment.');
      }

      // Update the transaction status in the local state
      setTransactions(prevTransactions => {
        const updatedTransactions = prevTransactions.map(tx =>
          tx.id === transactionId ? { ...tx, status: 'Withdrawn' } : tx
        );
        // Add a new transaction for the debit
        const confirmedTx = prevTransactions.find(tx => tx.id === transactionId);
        if (confirmedTx) {
          const newTx = {
            ...confirmedTx,
            amount: -confirmedTx.amount,
            type: 'withdrawal',
            status: 'Withdrawn',
            id: Date.now(), // Use a temporary id for client-side rendering
            created_at: new Date().toISOString()
          };
          return [newTx, ...updatedTransactions];
        }
        return updatedTransactions;
      });

      // Close the modal and show a success message
      setShowUpiModal(false);
      showMessage('Withdrawal successfully confirmed and customer wallet updated!', 'success');

    } catch (err) {
      console.error('Error confirming withdrawal:', err);
      showMessage(`Error: ${err.message}`, 'error');
    } finally {
      setIsConfirmingPayment(false);
    }
  };

  /**
   * Displays key metrics in a card layout.
   */
  const MetricCards = ({ transactions }) => {
    // New metrics calculations
    const totalRevenue = transactions
      .filter(tx => tx.type === 'bookingfees' && tx.status === 'Paid')
      .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

    const totalPaidBookings = transactions
      .filter(tx => tx.type === 'bookingfees' && tx.status === 'Paid')
      .length;
    
    const totalSkippedBookings = transactions
      .filter(tx => tx.type === 'bookingfees' && tx.status === 'Skipped')
      .length;

    const bookingSuccessRate = totalPaidBookings + totalSkippedBookings > 0
      ? (totalPaidBookings / (totalPaidBookings + totalSkippedBookings)) * 100
      : 0;

    const totalConfirmedWithdrawals = transactions
      .filter(tx => tx.type === 'withdrawal' && tx.status === 'Withdrawn')
      .reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount)), 0);

    const netProfit = totalRevenue - totalConfirmedWithdrawals;

    const netProfitPercentage = totalRevenue > 0
      ? (netProfit / totalRevenue) * 100
      : 0;

    const pendingRequests = transactions
      .filter(tx => tx.status === 'Requested')
      .length;

    const uniqueCustomers = new Set(transactions.map(tx => tx.customer_id)).size;

    const cards = [
      {
        title: 'Total Revenue',
        value: `₹${totalRevenue.toFixed(2)}`,
        icon: <TrendingUp className="h-6 w-6 text-green-400" />,
        color: 'bg-green-900'
      },
      {
        title: 'Net Profit',
        value: `₹${netProfit.toFixed(2)}`,
        percentage: `${netProfitPercentage.toFixed(2)}%`,
        icon: <Briefcase className="h-6 w-6 text-purple-400" />,
        color: 'bg-purple-900'
      },
      {
        title: 'Booking Success',
        value: `${totalPaidBookings} / ${totalPaidBookings + totalSkippedBookings}`,
        percentage: `${bookingSuccessRate.toFixed(2)}%`,
        icon: <CheckCircle className="h-6 w-6 text-emerald-400" />,
        color: 'bg-emerald-900'
      },
      {
        title: 'Total Withdrawals',
        value: `₹${totalConfirmedWithdrawals.toFixed(2)}`,
        icon: <ArrowDownCircle className="h-6 w-6 text-red-400" />,
        color: 'bg-red-900'
      },
      {
        title: 'Pending Requests',
        value: pendingRequests,
        icon: <Hourglass className="h-6 w-6 text-yellow-400" />,
        color: 'bg-yellow-900'
      },
      {
        title: 'Unique Customers',
        value: uniqueCustomers,
        icon: <Users className="h-6 w-6 text-blue-400" />,
        color: 'bg-blue-900'
      },
    ];

    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {cards.map((card, index) => (
          <div key={index} className={`flex items-center p-6 ${card.color} rounded-2xl shadow-lg border border-gray-700 transition-transform hover:scale-105 duration-200`}>
            <div className="flex-shrink-0 mr-4 p-3 rounded-full bg-gray-900 shadow-md">
              {card.icon}
            </div>
            <div className="flex flex-col justify-center">
              <p className="text-sm font-semibold uppercase tracking-wide text-gray-400">{card.title}</p>
              <p className="mt-1 text-2xl font-bold text-gray-50">{card.value}</p>
              {card.percentage && (
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-300 flex items-center">
                  <Percent className="h-3 w-3 mr-1 text-gray-400" />
                  {card.percentage}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };


  /**
   * Renders a section with a table of transactions filtered by status.
   */
  const TransactionSection = ({ title, transactions, onPay }) => {
    const getStatusClass = (status) => {
      switch (status) {
        case 'Paid': return 'bg-emerald-700 text-emerald-100';
        case 'Withdrawn': return 'bg-red-700 text-red-100';
        case 'Requested': return 'bg-yellow-700 text-yellow-100 animate-pulse';
        case 'Skipped': return 'bg-gray-500 text-gray-100';
        default: return 'bg-gray-600 text-gray-100';
      }
    };
    
    // Sort transactions by date descending
    const sortedTransactions = [...transactions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return (
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-100 flex items-center mb-4">
          <Receipt className="h-5 w-5 text-gray-400 mr-2" />
          {title} ({transactions.length})
        </h2>
        <div className="overflow-x-auto border border-gray-700 rounded-2xl shadow-lg">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gradient-to-r from-gray-800 to-gray-900">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  DATE
                </th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  CUSTOMER
                </th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  PH. NUMBER
                </th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  AMOUNT
                </th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  TYPE
                </th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  STATUS
                </th>
                <th scope="col" className="px-6 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {sortedTransactions.length > 0 ? (
                sortedTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-700 transition-colors duration-150">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {new Date(tx.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-100">
                      {tx.customer_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {tx.customer_ph_number || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`font-bold tracking-wider ${tx.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>
                        ₹{Math.abs(parseFloat(tx.amount)).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                        <span className="capitalize">{tx.type}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <span className={`px-2 py-1 inline-flex text-[10px] leading-4 font-bold rounded-full uppercase tracking-wider ${getStatusClass(tx.status)}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      {tx.status === 'Requested' && (
                        <button
                          onClick={() => onPay(tx)}
                          disabled={isGettingUpi}
                          className={`inline-flex items-center px-4 py-2 border border-transparent rounded-full shadow-sm text-xs font-bold text-white transition-colors
                            ${isGettingUpi && selectedTransaction?.id === tx.id
                              ? 'bg-emerald-600 cursor-not-allowed'
                              : 'bg-emerald-700 hover:bg-emerald-800'
                            }`}
                        >
                          {isGettingUpi && selectedTransaction?.id === tx.id ? (
                            <>
                              <Loader className="animate-spin h-3 w-3 mr-2" />
                              PAYING
                            </>
                          ) : (
                            <>
                              <IndianRupee className="h-3 w-3 mr-1" />
                              PAY
                            </>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center space-y-2">
                      <Receipt className="h-10 w-10 text-gray-600" />
                      <p className="text-sm font-semibold uppercase tracking-wider">
                        NO TRANSACTIONS FOUND
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  /**
   * Modal to display UPI QR code and link for payment.
   */
  const UpiPaymentModal = ({ transaction, upiLink, onClose, onConfirm }) => {
    return createPortal(
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-70 flex items-center justify-center p-4 animate-fade-in">
        <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-scale-up text-gray-100">
          <div className="flex justify-between items-center pb-4 border-b border-gray-700">
            <h2 className="text-xl font-bold">Complete Withdrawal</h2>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-700 transition-colors">
              <X className="h-5 w-5 text-gray-400" />
            </button>
          </div>
          <div className="py-6 text-center">
            <h3 className="text-lg font-semibold text-emerald-400 mb-2">Payment Required</h3>
            <p className="text-sm text-gray-300 mb-4">
              Please use your UPI app to complete the payment manually.
            </p>
            {upiLink ? (
              <div className="flex flex-col items-center space-y-4">
                <div className="bg-gray-900 p-4 rounded-lg shadow-inner mb-4">
                  <QRCode value={upiLink} size={150} fgColor="#FFFFFF" bgColor="#1F2937" />
                </div>
                <a
                  href={upiLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-bold rounded-xl shadow-md hover:bg-blue-700 transition-colors"
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open in UPI App
                </a>
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <Loader className="animate-spin h-8 w-8 text-emerald-500" />
              </div>
            )}
            
            <button
              onClick={() => onConfirm(transaction.id)}
              disabled={isConfirmingPayment}
              className={`w-full mt-6 py-3 rounded-xl font-bold uppercase tracking-wider flex items-center justify-center transition-all text-white
                ${isConfirmingPayment
                  ? 'bg-emerald-600 cursor-not-allowed'
                  : 'bg-emerald-700 hover:bg-emerald-800'
                }`}
            >
              {isConfirmingPayment ? (
                <>
                  <Loader className="animate-spin h-4 w-4 mr-2" />
                  SAVING...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  SAVE & CONFIRM PAYMENT
                </>
              )}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const allTransactions = transactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const requestedTransactions = allTransactions.filter(tx => tx.status === 'Requested');
  const paidTransactions = allTransactions.filter(tx => tx.status === 'Paid');
  const withdrawnTransactions = allTransactions.filter(tx => tx.status === 'Withdrawn' || tx.type === 'withdrawal');
  
  return (
    <div className="p-4 sm:p-8 min-h-screen bg-gray-900 font-sans antialiased text-gray-100">
      <div className="max-w-7xl mx-auto">
        {/* Dashboard Header */}
        <div className="bg-gray-800 rounded-2xl shadow-lg p-6 sm:p-8 mb-8 flex flex-col sm:flex-row items-center justify-between">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-100 flex items-center mb-4 sm:mb-0">
            <BarChart className="h-6 w-6 sm:h-8 sm:w-8 text-emerald-400 mr-3" />
            Admin Dashboard
          </h1>
          <button
            onClick={fetchTransactions}
            className="px-4 py-2 bg-gray-700 text-gray-200 rounded-full text-sm font-semibold hover:bg-gray-600 transition-colors flex items-center"
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>

        {/* Metric Cards Section */}
        {!isLoading && !error && (
          <MetricCards transactions={transactions} />
        )}

        {/* Content Section */}
        <div className="bg-gray-800 rounded-2xl shadow-lg p-4 sm:p-6">
          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400">
              <div className="relative">
                <Loader className="animate-spin mb-3 h-10 w-10 text-emerald-400" />
                <div className="absolute inset-0 h-10 w-10 border-4 border-emerald-700 rounded-full animate-pulse"></div>
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider">
                LOADING TRANSACTIONS...
              </p>
            </div>
          )}

          {error && (
            <div className="py-12 flex flex-col items-center justify-center text-red-400">
              <AlertCircle className="mb-3 h-10 w-10" />
              <p className="text-xs font-semibold uppercase tracking-wider text-center px-6">
                {error}
              </p>
            </div>
          )}

          {!isLoading && !error && (
            <>
              {/* Requested Transactions Section */}
              <TransactionSection
                title="Requested Transactions"
                transactions={requestedTransactions}
                onPay={handlePayWithdrawal}
              />

              {/* Paid Transactions Section */}
              <TransactionSection
                title="Paid Transactions"
                transactions={paidTransactions}
                onPay={handlePayWithdrawal}
              />
              
              {/* Withdrawn Transactions Section */}
              <TransactionSection
                title="Withdrawn Transactions"
                transactions={withdrawnTransactions}
                onPay={handlePayWithdrawal}
              />
            </>
          )}
        </div>
      </div>
      
      {showUpiModal && selectedTransaction && (
        <UpiPaymentModal
          transaction={selectedTransaction}
          upiLink={upiLink}
          onClose={() => setShowUpiModal(false)}
          onConfirm={handleConfirmPayment}
        />
      )}

      <AlertMessage message={message} type={messageType} onClose={() => setMessage('')} />
    </div>
  );
};

export default App;
