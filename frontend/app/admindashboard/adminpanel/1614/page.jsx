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
  Hourglass,
  ExternalLink,
  Wallet,
  Coins,
  ArrowRightCircle,
  ArrowLeftCircle,
  TrendingUp,
  CreditCard,
  Gift,
  ArrowDownCircle,
  ArrowUpCircle,
  DollarSign,
  Users,
  Store,
} from 'lucide-react';
import QRCode from 'react-qr-code';

// Assumes Tailwind CSS is available
const App = () => {
  const [customerTransactions, setCustomerTransactions] = useState([]);
  const [shopTransactions, setShopTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [transactionType, setTransactionType] = useState(null); // 'customer' or 'shop'
  const [isGettingUpi, setIsGettingUpi] = useState(false);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [upiLink, setUpiLink] = useState(null);

  // Pagination states
  const [currentPageCustomer, setCurrentPageCustomer] = useState(1);
  const [currentPageShop, setCurrentPageShop] = useState(1);
  const [currentPageCustomerAll, setCurrentPageCustomerAll] = useState(1);
  const [currentPageShopAll, setCurrentPageShopAll] = useState(1);
  const transactionsPerPage = 10;

  // State for custom messages
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app';

  // Custom message display component
  const AlertMessage = ({ message, type, onClose }) => {
    if (!message) return null;
    return createPortal(
      <div className="fixed top-4 right-4 z-50 p-3 rounded-xl shadow-lg border animate-slide-in-from-right transition-transform">
        <div className={`flex items-center space-x-2 ${type === 'success' ? 'bg-green-700 border-green-500 text-green-100' : 'bg-red-700 border-red-500 text-red-100'} p-2 rounded-lg`}>
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
   * Fetches all wallet transactions for customers and shops concurrently.
   */
  const fetchAllTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [customerResponse, shopResponse] = await Promise.all([
        fetch(`${API_BASE_URL}/admin/wallet-transactions`),
        fetch(`${API_BASE_URL}/admin/shop-wallet-transactions`)
      ]);

      if (!customerResponse.ok || !shopResponse.ok) {
        throw new Error('Failed to fetch transaction data.');
      }

      const customerData = await customerResponse.json();
      const shopData = await shopResponse.json();

      setCustomerTransactions(customerData);
      setShopTransactions(shopData);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError('Failed to load transaction data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllTransactions();
  }, [fetchAllTransactions]);

  /**
   * Handles the admin's action to get a UPI link for a pending withdrawal.
   */
  const handlePayWithdrawal = async (transaction, type) => {
    setIsGettingUpi(true);
    setSelectedTransaction(transaction);
    setTransactionType(type);
    setUpiLink(null);

    const endpoint = type === 'customer'
      ? `${API_BASE_URL}/admin/pay-withdrawal/${transaction.id}`
      : `${API_BASE_URL}/admin/shop/pay-withdrawal/${transaction.id}`;

    try {
      const response = await fetch(endpoint, { method: 'GET' });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get withdrawal details.');
      }

      const responseData = await response.json();
      setUpiLink(responseData.upiLink);
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
   */
  const handleConfirmPayment = async (transactionId) => {
    setIsConfirmingPayment(true);
    
    const endpoint = transactionType === 'customer'
      ? `${API_BASE_URL}/admin/confirm-withdrawal/${transactionId}`
      : `${API_BASE_URL}/admin/shop/confirm-withdrawal/${transactionId}`;

    try {
      const response = await fetch(endpoint, { method: 'PUT' });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to confirm withdrawal payment.');
      }

      if (transactionType === 'customer') {
        setCustomerTransactions(prevTransactions =>
          prevTransactions.map(tx =>
            tx.id === transactionId ? { ...tx, status: 'Withdrawn' } : tx
          )
        );
      } else {
        setShopTransactions(prevTransactions =>
          prevTransactions.map(tx =>
            tx.id === transactionId ? { ...tx, status: 'Withdrawn' } : tx
          )
        );
      }

      setShowUpiModal(false);
      showMessage('Withdrawal successfully confirmed!', 'success');

    } catch (err) {
      console.error('Error confirming withdrawal:', err);
      showMessage(`Error: ${err.message}`, 'error');
    } finally {
      setIsConfirmingPayment(false);
    }
  };

  /**
   * Renders a section with a table of transactions and pagination.
   */
  const TransactionSection = ({ title, transactions, onPay, type, currentPage, setCurrentPage }) => {
    const getStatusClass = (status) => {
      switch (status) {
        case 'Paid': return 'bg-emerald-700 text-emerald-100';
        case 'Received': return 'bg-emerald-700 text-emerald-100';
        case 'Withdrawn': return 'bg-red-700 text-red-100';
        case 'Requested': return 'bg-yellow-700 text-yellow-100 animate-pulse';
        case 'Refund': return 'bg-blue-700 text-blue-100';
        default: return 'bg-gray-600 text-gray-100';
      }
    };

    const sortedTransactions = [...transactions].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const totalPages = Math.ceil(sortedTransactions.length / transactionsPerPage);
    const startIndex = (currentPage - 1) * transactionsPerPage;
    const endIndex = startIndex + transactionsPerPage;
    const currentTransactions = sortedTransactions.slice(startIndex, endIndex);

    const handleNextPage = () => {
      setCurrentPage(prev => Math.min(prev + 1, totalPages));
    };

    const handlePrevPage = () => {
      setCurrentPage(prev => Math.max(prev - 1, 1));
    };

    const getIconForType = (txType) => {
      switch (txType) {
        case 'bookingfees': return <CreditCard className="h-4 w-4 mr-1 text-emerald-400" />;
        case 'cashback': return <Gift className="h-4 w-4 mr-1 text-purple-400" />;
        case 'refund': return <ArrowLeftCircle className="h-4 w-4 mr-1 text-blue-400" />;
        case 'withdrawal': return <ArrowDownCircle className="h-4 w-4 mr-1 text-red-400" />;
        default: return <Coins className="h-4 w-4 mr-1 text-gray-400" />;
      }
    };

    return (
      <div className="mb-10">
        <h2 className="text-xl font-bold text-gray-100 flex items-center mb-4">
          <Receipt className="h-5 w-5 text-gray-400 mr-2" />
          {title} ({transactions.length})
        </h2>
        <div className="overflow-x-auto border border-gray-700 rounded-2xl shadow-lg">
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gradient-to-r from-gray-800 to-gray-900">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">DATE</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {type === 'customer' ? 'CUSTOMER' : 'SHOP'}
                </th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">PH. NUMBER</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">AMOUNT</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">TYPE</th>
                <th scope="col" className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider">STATUS</th>
                <th scope="col" className="px-6 py-3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {currentTransactions.length > 0 ? (
                currentTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-700 transition-colors duration-150">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{new Date(tx.created_at).toLocaleDateString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-100">
                      {type === 'customer' ? tx.customer_name : tx.shop_name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                      {type === 'customer' ? tx.customer_ph_number : tx.shop_ph_number || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`font-bold tracking-wider ${tx.amount < 0 || ['withdrawal', 'refund'].includes(tx.type) ? 'text-red-400' : 'text-green-400'}`}>
                        ₹{Math.abs(parseFloat(tx.amount)).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 flex items-center">
                      {getIconForType(tx.type)}
                      <span className="capitalize">{tx.type.replace(/([A-Z])/g, ' $1').trim()}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <span className={`px-2 py-1 inline-flex text-[10px] leading-4 font-bold rounded-full uppercase tracking-wider ${getStatusClass(tx.status)}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      {tx.status === 'Requested' && (
                        <button
                          onClick={() => onPay(tx, type)}
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
                      <p className="text-sm font-semibold uppercase tracking-wider">NO TRANSACTIONS FOUND</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex justify-center items-center mt-4 space-x-2">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className="p-2 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowLeftCircle className="h-5 w-5" />
            </button>
            <span className="text-sm text-gray-300 font-medium">Page {currentPage} of {totalPages}</span>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className="p-2 rounded-full bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowRightCircle className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    );
  };
  
  /**
   * Displays key metrics in a card layout.
   */
  const MetricCards = ({ customerTransactions, shopTransactions }) => {
  // Calculate metrics based on the data and user-provided logic
  const totalPlatformRevenueFromBookings = customerTransactions
    .filter(tx => tx.type === 'bookingfees' && tx.status === 'Paid')
    .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

  const totalShopReceivedBookingFees = shopTransactions
    .filter(tx => tx.type === 'bookingfees' && tx.status === 'Received')
    .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

  const totalSubscriptionRevenue = shopTransactions
    .filter(tx => tx.type === 'subscription' && tx.status === 'Paid')
    .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

  const totalCustomerRefunds = customerTransactions
    .filter(tx => tx.type === 'bookingfees' && tx.status === 'Refund')
    .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

  // New calculation for pending withdrawals
  const totalPendingCustomerWithdrawals = customerTransactions
    .filter(tx => tx.type === 'withdrawal' && tx.status === 'Requested')
    .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

  const totalPendingShopWithdrawals = shopTransactions
    .filter(tx => tx.type === 'withdrawal' && tx.status === 'Requested')
    .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
    
  // New calculations for cashback
  const totalCustomerCashback = customerTransactions
    .filter(tx => tx.type === 'cashback' && tx.status === 'Received')
    .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);
  
  const totalShopCashback = shopTransactions
    .filter(tx => tx.type === 'cashback' && tx.status === 'Received')
    .reduce((sum, tx) => sum + parseFloat(tx.amount), 0);

  // Existing metrics
  const totalCashback = totalCustomerCashback + totalShopCashback;
  const shopShares = totalShopReceivedBookingFees;
  const totalOverallRevenue = totalPlatformRevenueFromBookings + totalSubscriptionRevenue;
  const netPlatformRevenue = totalOverallRevenue - totalCashback - shopShares - totalCustomerRefunds;

  const cards = [
    {
      title: 'Net Platform Revenue',
      value: `₹${netPlatformRevenue.toFixed(2)}`,
      icon: <TrendingUp className="h-6 w-6 text-green-400" />,
      color: 'bg-emerald-900',
      description: 'Total revenue minus all expenses.',
    },
    {
      title: 'Total Platform Revenue from Bookings',
      value: `₹${totalPlatformRevenueFromBookings.toFixed(2)}`,
      icon: <TrendingUp className="h-6 w-6 text-green-400" />,
      color: 'bg-emerald-900',
      description: 'Total revenue from booking fees paid by customers.',
    },
    {
      title: 'Total Revenue from Subscriptions',
      value: `₹${totalSubscriptionRevenue.toFixed(2)}`,
      icon: <CreditCard className="h-6 w-6 text-pink-400" />,
      color: 'bg-pink-900',
      description: 'Revenue from monthly or yearly subscriptions.',
    },
    {
      title: 'Total Overall Revenue',
      value: `₹${totalOverallRevenue.toFixed(2)}`,
      icon: <DollarSign className="h-6 w-6 text-yellow-400" />,
      color: 'bg-yellow-900',
      description: 'Sum of subscription and platform booking fees.',
    },
    {
      title: 'Shop Shares',
      value: `₹${shopShares.toFixed(2)}`,
      icon: <Store className="h-6 w-6 text-teal-400" />,
      color: 'bg-teal-900',
      description: 'Total booking fees earned by the shops.',
    },
    {
      title: 'Total Cashback Paid',
      value: `₹${totalCashback.toFixed(2)}`,
      icon: <Gift className="h-6 w-6 text-purple-400" />,
      color: 'bg-purple-900',
      description: 'Combined cashback given to customers and shops.',
    },
    // New cards
    {
      title: 'Pending Customer Withdrawals',
      value: `₹${totalPendingCustomerWithdrawals.toFixed(2)}`,
      icon: <Users className="h-6 w-6 text-indigo-400" />,
      color: 'bg-indigo-900',
      description: 'Total withdrawal requests from customers.',
    },
    {
      title: 'Pending Shop Withdrawals',
      value: `₹${totalPendingShopWithdrawals.toFixed(2)}`,
      icon: <Store className="h-6 w-6 text-teal-400" />,
      color: 'bg-teal-900',
      description: 'Total withdrawal requests from shops.',
    },
    {
      title: 'Total Customer Cashback',
      value: `₹${totalCustomerCashback.toFixed(2)}`,
      icon: <Gift className="h-6 w-6 text-purple-400" />,
      color: 'bg-purple-900',
      description: 'Cashback provided to customers.',
    },
    {
      title: 'Total Shop Cashback',
      value: `₹${totalShopCashback.toFixed(2)}`,
      icon: <Gift className="h-6 w-6 text-purple-400" />,
      color: 'bg-purple-900',
      description: 'Cashback provided to shops.',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {cards.map((card, index) => (
        <div key={index} className={`flex flex-col p-6 ${card.color} rounded-2xl shadow-lg border border-gray-700 transition-transform hover:scale-105 duration-200`}>
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{card.title}</h3>
            <div className="flex-shrink-0 p-2 rounded-full bg-gray-900 shadow-md">
              {card.icon}
            </div>
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-50">{card.value}</p>
          <p className="text-xs text-gray-400 mt-2">{card.description}</p>
        </div>
      ))}
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
  
  const customerRequested = customerTransactions.filter(tx => tx.status === 'Requested');
  const shopRequested = shopTransactions.filter(tx => tx.status === 'Requested');
  const allCustomerTransactions = customerTransactions.filter(tx => tx.status !== 'Requested');
  const allShopTransactions = shopTransactions.filter(tx => tx.status !== 'Requested');
  
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
            onClick={fetchAllTransactions}
            className="px-4 py-2 bg-gray-700 text-gray-200 rounded-full text-sm font-semibold hover:bg-gray-600 transition-colors flex items-center"
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>

        {/* Metric Cards Section */}
        {!isLoading && !error && (
          <MetricCards 
            customerTransactions={customerTransactions}
            shopTransactions={shopTransactions}
          />
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
              {/* Customer Requested Transactions Section */}
              <TransactionSection
                title="Customer Withdrawal Requests"
                transactions={customerRequested}
                onPay={handlePayWithdrawal}
                type="customer"
                currentPage={currentPageCustomer}
                setCurrentPage={setCurrentPageCustomer}
              />
              
              {/* Shop Requested Transactions Section */}
              <TransactionSection
                title="Shop Withdrawal Requests"
                transactions={shopRequested}
                onPay={handlePayWithdrawal}
                type="shop"
                currentPage={currentPageShop}
                setCurrentPage={setCurrentPageShop}
              />

              {/* All Other Customer Transactions Section */}
              <TransactionSection
                title="All Customer Transactions"
                transactions={allCustomerTransactions}
                onPay={handlePayWithdrawal}
                type="customer"
                currentPage={currentPageCustomerAll}
                setCurrentPage={setCurrentPageCustomerAll}
              />
              
              {/* All Other Shop Transactions Section */}
              <TransactionSection
                title="All Shop Transactions"
                transactions={allShopTransactions}
                onPay={handlePayWithdrawal}
                type="shop"
                currentPage={currentPageShopAll}
                setCurrentPage={setCurrentPageShopAll}
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
