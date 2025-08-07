"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  XMarkIcon,
  CurrencyRupeeIcon,
} from "@heroicons/react/24/outline";
import {
  Loader,
  CheckCircle,
  AlertCircle,
  IndianRupee,
  Star,
  Sparkles,
  Tag,
  CreditCard,
  Receipt
} from 'lucide-react';

const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app'; // Ensure this matches your backend URL

// Load Razorpay script dynamically
const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

/**
 * Shop Billing Modal for managing subscriptions and payments.
 * Now includes its own trigger button and enhanced UI.
 *
 * @param {object} props - The component props.
 * @param {number} props.shopId - The ID of the shop.
 * @param {function} props.onSubscriptionSuccess - Callback to notify parent on successful subscription.
 */
const ShopBillingModal = ({ shopId, onSubscriptionSuccess }) => {
  const [showModal, setShowModal] = useState(false); // Internal state for modal visibility
  const [shopType, setShopType] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false); // New state for subscription status
  const [credits, setCredits] = useState(0); // New state for remaining credits
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const handleOpenModal = useCallback(() => {
    setShowModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
  }, []);

  const fetchShopDetailsAndPlans = useCallback(async () => { // Renamed function for clarity
    if (!shopId) {
      setError('SHOP ID IS NOT AVAILABLE.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      // Fetch shop details including type, is_subscribed, and credits
      const shopResponse = await fetch(`${API_BASE_URL}/shops/${shopId}`);
      if (!shopResponse.ok) {
        throw new Error('FAILED TO FETCH SHOP DETAILS.');
      }
      const shopData = await shopResponse.json();
      setShopType(shopData.type);
      setIsSubscribed(shopData.is_subscribed); // Set is_subscribed status
      setCredits(shopData.credits); // Set remaining credits

      // Only fetch plans if the shop is not already subscribed
      if (!shopData.is_subscribed) {
        const plansResponse = await fetch(`${API_BASE_URL}/shops/${shopId}/subscription-plans`);
        if (!plansResponse.ok) {
          const errorData = await plansResponse.json();
          throw new Error(errorData.error || 'FAILED TO FETCH SUBSCRIPTION PLANS.');
        }
        const plansData = await plansResponse.json();
        setSubscriptionPlans(plansData.plans);
      } else {
        setSubscriptionPlans([]); // Clear plans if already subscribed
      }

    } catch (err) {
      console.error('ERROR FETCHING SUBSCRIPTION PLANS:', err);
      setError(err.message || 'FAILED TO LOAD SUBSCRIPTION PLANS.');
      toast.error(err.message || 'ERROR LOADING SUBSCRIPTION PLANS.');
    } finally {
      setIsLoading(false);
    }
  }, [shopId]);

  // Fetch shop details and plans only when the modal is opened
  useEffect(() => {
    if (showModal) {
      fetchShopDetailsAndPlans();
    }
  }, [showModal, fetchShopDetailsAndPlans]);

  const handlePayment = useCallback(async (planId, amount) => {
    setIsProcessingPayment(true);
    const scriptLoaded = await loadRazorpayScript();

    if (!scriptLoaded) {
      toast.error('RAZORPAY SDK FAILED TO LOAD. PLEASE CHECK YOUR INTERNET CONNECTION.');
      setIsProcessingPayment(false);
      return;
    }

    try {
      // 1. Create Razorpay Order on Backend
      const orderResponse = await fetch(`${API_BASE_URL}/shops/${shopId}/create-razorpay-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId }),
      });

      if (!orderResponse.ok) {
        const errorData = await orderResponse.json();
        throw new Error(errorData.error || 'FAILED TO CREATE RAZORPAY ORDER.');
      }

      const orderData = await orderResponse.json();
      // Use the exact amount from the backend for Razorpay, as it's already calculated and rounded for paise
      const { order_id, amount: razorpayAmount, currency, key_id } = orderData; 


      const finalPaymentAmount = Math.round(razorpayAmount);
      
      console.log('Original backend amount:', razorpayAmount);
      console.log('Final payment amount (rounded):', finalPaymentAmount);
      console.log('Final amount for Razorpay in paise:', finalPaymentAmount * 100);
      // 2. Open Razorpay Checkout
      const options = {
        key: key_id, // Your Razorpay Key ID
        amount: finalPaymentAmount * 100, // Amount in paise, rounded for Razorpay's requirement
        currency: currency,
        name: "SHOP SUBSCRIPTION",
        description: `SUBSCRIPTION FOR SHOP ID: ${shopId}`,
        order_id: order_id,
        handler: async function (response) {
          // Payment successful, verify on backend
          try {
            const verifyResponse = await fetch(`${API_BASE_URL}/shops/${shopId}/verify-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                plan_id: planId,
              }),
            });

            if (!verifyResponse.ok) {
              const errorData = await verifyResponse.json();
              throw new Error(errorData.error || 'PAYMENT VERIFICATION FAILED ON SERVER.');
            }

            toast.success('SUBSCRIPTION ACTIVATED SUCCESSFULLY!');
            onSubscriptionSuccess(); // Notify parent to refresh shop data
            handleCloseModal(); // Close modal

          } catch (verifyErr) {
            console.error('PAYMENT VERIFICATION ERROR:', verifyErr);
            toast.error(verifyErr.message || 'PAYMENT VERIFICATION FAILED. PLEASE CONTACT SUPPORT.');
          } finally {
            setIsProcessingPayment(false);
          }
        },
        prefill: {
          // You can prefill customer details here if available
          // name: "Gaurav Kumar",
          // email: "gaurav.kumar@example.com",
          // contact: "9999999999"
        },
        notes: {
          shop_id: shopId,
          plan_id: planId,
        },
        theme: {
          "color": "#6366F1" // Indigo color
        }
      };

      const rzp = new window.Razorpay(options);

      // Handle user closing the Razorpay popup without completing payment - MOVED BEFORE rzp.open()
      rzp.on('payment.dismissed', function() {
        toast.info('PAYMENT PROCESS CANCELLED.');
        setIsProcessingPayment(false);
      });

      // Handle Razorpay payment failure - MOVED BEFORE rzp.open()
      rzp.on('payment.failed', function (response) {
        console.error('RAZORPAY PAYMENT FAILED:', response.error);
        toast.error(`PAYMENT FAILED: ${response.error.description || 'UNKNOWN ERROR'}`);
        setIsProcessingPayment(false);
      });

      rzp.open(); // Open Razorpay checkout after event listeners are attached

    } catch (err) {
      console.error('ERROR DURING PAYMENT PROCESS:', err);
      toast.error(err.message || 'AN ERROR OCCURRED DURING PAYMENT. PLEASE TRY AGAIN.');
      setIsProcessingPayment(false);
    }
  }, [shopId, handleCloseModal, onSubscriptionSuccess]);

  return (
    <>
      {/* THE CIRCULAR TRIGGER BUTTON */}
      <div className="flex flex-col items-center space-y-1">
        <div className="relative flex flex-col items-center">
          <button
            onClick={handleOpenModal}
            className="relative group w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 rounded-full transition-all duration-300 transform hover:scale-105 flex items-center justify-center"
            aria-label="OPEN BILLING"
          >
            <Receipt className="h-4 w-4 text-white group-hover:scale-110 transition-transform duration-200" />
          </button>
        </div>
      </div>

      {/* THE FULL-PAGE MODAL, RENDERED ONLY WHEN SHOWMODAL IS TRUE */}
      {showModal && createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black bg-opacity-70 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden animate-scale-up">
            <div className="sticky top-0 bg-gradient-to-r from-indigo-700 to-purple-800 p-5 flex items-center justify-between shadow-lg">
              <h2 className="text-xl uppercase tracking-widest font-extrabold text-white flex items-center">
                <CreditCard className="h-6 w-6 mr-2 text-indigo-200" />
                SUBSCRIPTION
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-white/80 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full"
                aria-label="CLOSE SUBSCRIPTION MODAL"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[calc(90vh-100px)] p-8">
              {isLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-600">
                  <div className="relative">
                    <Loader className="animate-spin mb-3 h-10 w-10 text-indigo-500" />
                    <div className="absolute inset-0 h-10 w-10 border-4 border-indigo-200 rounded-full animate-pulse"></div>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wider">
                    LOADING SUBSCRIPTION PLANS...
                  </p>
                </div>
              ) : error ? (
                <div className="py-12 flex flex-col items-center justify-center text-red-600">
                  <AlertCircle className="mb-3 h-10 w-10" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-center px-6">
                    {error}
                  </p>
                  <button
                    onClick={fetchShopDetailsAndPlans} // Updated to call the new function
                    className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors uppercase tracking-wider text-sm font-bold"
                  >
                    RETRY
                  </button>
                </div>
              ) : (
                <>
                  {isSubscribed ? ( // Conditional rendering for subscribed shops
                    <div className="py-12 text-center text-green-700  ">
                      <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                      <p className="text-lg font-bold uppercase tracking-wider mb-2">
                        YOU ARE ALREADY A SUBSCRIBED MEMBER!
                      </p>
                      <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                        YOUR SUBSCRIPTION IS ACTIVE FOR THE NEXT <span className="font-extrabold text-green-600">{credits}</span> DAYS.
                      </p>
                      {/* <p className="text-[10px] font-bold text-gray-600 mt-4 uppercase tracking-wide">
                        VISIT AGAIN AFTER YOUR CURRENT SUBSCRIPTION EXPIRES IF YOU WISH TO RENEW.
                      </p> */}
                    </div>
                  ) : (
                    <>
                      <div className="text-center mb-6">
                        
                        <p className="text-sm text-gray-600 mt-[-10px] uppercase tracking-wide">
                         subscription PLANS ARE based on YOUR SHOP'S SEGMENT
                        </p>
                      </div>

                      {subscriptionPlans.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                          {subscriptionPlans.map((plan) => (
                            <div
                              key={plan.id}
                              className={`relative bg-white border-2 rounded-xl p-6 flex flex-col items-center text-center transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl
                                ${plan.segment === shopType ? 'border-indigo-600 shadow-xl' : 'border-gray-200 shadow-md'}`}
                            >
                              {plan.segment === shopType && (
                                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md uppercase tracking-wider">
                                  YOUR plan
                                </span>
                              )}
                              {/* <div className="mb-4 mt-2">
                                {plan.segment === 'premium' && <Star className="h-10 w-10 text-yellow-500" />}
                                {plan.segment === 'mid' && <Sparkles className="h-10 w-10 text-purple-500" />}
                                {plan.segment === 'economy' && <Tag className="h-10 w-10 text-blue-500" />}
                              </div> */}
                              <h3 className="text-2xl font-extrabold text-gray-900 uppercase mb-2 tracking-wide">
                                {plan.segment} PLAN
                              </h3>
                              <p className="text-sm text-gray-600 mb-3 uppercase tracking-wider">
                                {plan.season_type.toUpperCase()} SEASON
                              </p>
                              <div className="flex items-baseline mb-4">
                                <IndianRupee className="h-6 w-6 text-gray-700 mr-1" />
                                <span className="text-5xl font-extrabold text-indigo-700">
                                  {Math.round(plan.final_price).toFixed(0)} {/* Display rounded value */}
                                </span>
                                {plan.discount_percent > 0 && (
                                  <span className="ml-2 text-lg text-gray-500 line-through">
                                    ₹{Math.round(plan.price).toFixed(0)} {/* Display rounded original price */}
                                  </span>
                                )}
                              </div>
                              {plan.discount_percent > 0 && (
                                <p className="text-sm font-bold text-green-600 mb-4 uppercase tracking-wider">
                                  SAVE {plan.discount_percent}%
                                </p>
                              )}
                              <ul className="text-sm text-gray-700 list-disc list-inside text-left mb-6 space-y-2">
                                <li className="uppercase tracking-wide">ACCESS TO ADS, BANNERS, OFFERS</li>
                                <li className="uppercase tracking-wide">TOP-RATED STATUS FOR 31 DAYS</li>
                                <li className="uppercase tracking-wide">{plan.segment === 'premium' ? 'PRIORITY SUPPORT' : 'STANDARD SUPPORT'}</li>
                                <li className="uppercase tracking-wide">EXCITING PERKS & CASHBACKS</li>
                              </ul>
                              <button
                                onClick={() => handlePayment(plan.id, plan.final_price)}
                                disabled={isProcessingPayment}
                                className={`mt-auto w-full py-3 rounded-lg font-bold uppercase tracking-widest flex items-center justify-center transition-all duration-300
                                  ${isProcessingPayment
                                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg hover:shadow-xl'
                                  }`}
                              >
                                {isProcessingPayment ? (
                                  <>
                                    <Loader className="animate-spin h-4 w-4 mr-2" />
                                    PROCESSING...
                                  </>
                                ) : (
                                  <>
                                    <CreditCard className="h-4 w-4 mr-2" />
                                    SUBSCRIBE NOW
                                  </>
                                )}
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="py-12 text-center text-gray-500">
                          <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                          <p className="text-lg font-semibold uppercase tracking-wider">NO ACTIVE SUBSCRIPTION PLANS FOUND.</p>
                          <p className="text-sm mt-2 uppercase tracking-wide">PLEASE CONTACT SUPPORT FOR MORE INFORMATION.</p>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
      
    </>
  );
};

export default ShopBillingModal;

