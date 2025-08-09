"use client";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import duration from "dayjs/plugin/duration";
import Image from "next/image";
// --- React Toastify imports ---
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  ScissorsIcon,
  MapPinIcon,
  PhoneIcon,
  UserCircleIcon,
  ClockIcon,
  UsersIcon,
  XCircleIcon,
  BuildingStorefrontIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  WifiIcon,
  CurrencyRupeeIcon,
  BellIcon,
  ArrowRightOnRectangleIcon,
  MicrophoneIcon,
  EyeIcon,
  CalendarDaysIcon,
  SparklesIcon,
  StarIcon,
  ReceiptPercentIcon,
  LockClosedIcon,
  CheckCircleIcon,
  ShieldCheckIcon,
  TagIcon
} from "@heroicons/react/24/outline";
import {
  LogOut,
  Scissors,
  ReceiptIcon,
  StoreIcon,
  TimerIcon,
  PowerIcon,
  HourglassIcon,
  AlarmClockIcon,
  CheckCircle2Icon,
  LoaderIcon,
  Loader
} from "lucide-react";
import dayjs from "dayjs"; // Import dayjs for date formatting
dayjs.extend(duration);
import isSameOrBefore from "dayjs/plugin/isSameOrBefore"; // Import if not already

dayjs.extend(isSameOrBefore);
const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app';


import axios from "axios";
import WalletAndSyncUI from "./WalletAndSyncUI";
import ShopCard from "./ShopCard";
import ShopBanners from "./ShopBanner";
import AdCard from "./AdCard";
import ShopDetailsModal from "./ShopDetailsModal";

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance * 1.15; // Apply scaling factor
}

async function calculateDistance(lat1, lon1, lat2, lon2, retries = 3) {
  const TOMTOM_API_KEY = '5Q9lucwONUWC0yrXWheR16oZtjdBxE0H';
  const url = `https://api.tomtom.com/routing/1/calculateRoute/${lat1},${lon1}:${lat2},${lon2}/json?key=${TOMTOM_API_KEY}&routeType=fastest&travelMode=car&traffic=true`;

  try {
    const response = await axios.get(url);
    const data = response.data;

    if (data.routes && data.routes.length > 0) {
      const distanceInMeters = data.routes[0].summary.lengthInMeters;
      const distanceInKm = (distanceInMeters / 1000).toFixed(1);
      return parseFloat(distanceInKm);
    } else {
      console.error('No routes found in TomTom API response. Using fallback.');
      return parseFloat(haversineDistance(lat1, lon1, lat2, lon2).toFixed(1));
    }
  } catch (error) {
    if (error.response && error.response.status === 429 && retries > 0) {
      const delay = Math.pow(2, 3 - retries) * 1000;
      console.warn(`Rate limit hit (429). Retrying in ${delay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return calculateDistance(lat1, lon1, lat2, lon2, retries - 1);
    }
    
    // If all retries fail or a different error occurs, use fallback
    console.error(`Error fetching TomTom data: ${error.message}. Using fallback.`);
    return parseFloat(haversineDistance(lat1, lon1, lat2, lon2).toFixed(1));
  }
}
const searchQuery = ""; // Or a search query from state
const isFetchingShops = false; // A state to manage loading status
// === SearchBar component defined OUTSIDE UserDashboard ===
function SearchBar({ searchQuery, setSearchQuery }) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (typeof window !== "undefined" && "webkitSpeechRecognition" in window) {
      const SpeechRecognition = window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-IN";

      recognition.onstart = () => {
        setIsListening(true);
        console.log("Speech recognition started");
      };

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setSearchQuery(transcript);
        setIsListening(false);
        console.log("Speech result:", transcript);
      };

      recognition.onerror = (event) => {
        setIsListening(false);
        console.error("Speech recognition error:", event.error);
        if (event.error === "no-speech") {
          // Optional: Provide feedback to the user
          // Using a custom modal or message box would be better than alert in production
          // alert('No speech detected. Please try again.');
        } else if (event.error === "not-allowed") {
          // Using a custom modal or message box would be better than alert in production
          alert(
            "Microphone permission denied. Please enable it in your browser settings."
          );
        } else {
          alert(`Speech recognition error: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        console.log("Speech recognition ended");
      };

      recognitionRef.current = recognition;

      return () => {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
      };
    } else {
      console.warn("Web Speech API not supported in this browser.");
    }
  }, [setSearchQuery]);

  const toggleListening = () => {
    if (!("webkitSpeechRecognition" in window)) {
      alert("Your browser does not support Web Speech API for voice search.");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setSearchQuery("");
      recognitionRef.current.start();
    }
  };

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
        <MagnifyingGlassIcon className="h-5 w-5 text-[#a62b16]" />
      </div>
      <input
        type="text"
        placeholder={
          isListening ? "Listening..." : "Search by shop name or services..."
        }
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full pl-10 pr-12 py-3 border bg-amber-50 border-white rounded-3xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#cb3a1e] focus:border-transparent text-[12px] uppercase tracking-wider"
      />
      <button
        onClick={toggleListening}
        className={`absolute inset-y-0 right-0 flex items-center pr-3 transition-colors duration-200 ${
          isListening
            ? "text-red-500 animate-pulse"
            : "text-[#a62b16] hover:text-[#cb3a1e]"
        }`}
        title={isListening ? "Stop listening" : "Start voice search"}
        disabled={!("webkitSpeechRecognition" in window)}
      >
        <MicrophoneIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
// === BookingModal Component ===

function BookingModal({
  shopId,
  empId,
  customerId,
  services,
  onClose,
  onBookingComplete,
  session
}) {
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bookingFeeAmount, setBookingFeeAmount] = useState(0);
  const [originalFeeAmount, setOriginalFeeAmount] = useState(0);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [isFeeLoading, setIsFeeLoading] = useState(true);
  const [isRazorpayReady, setIsRazorpayReady] = useState(false);

  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setIsRazorpayReady(true);
    script.onerror = () => {
      toast.error("Payment gateway unavailable");
      setIsRazorpayReady(false);
    };
    document.body.appendChild(script);
    return () => document.body.removeChild(script);
  }, []);

  // Fetch booking fee
  useEffect(() => {
    const fetchBookingFee = async () => {
      if (shopId && customerId > 0) {
        setIsFeeLoading(true);
        try {
          const response = await axios.get(`${API_BASE_URL}/shops/${shopId}/booking-fee`);
          setBookingFeeAmount(response.data.fee);
          setDiscountPercent(response.data.discount_percent);
          
          if (response.data.discount_percent > 0) {
            const originalFee = Math.round(response.data.fee / (1 - response.data.discount_percent / 100));
            setOriginalFeeAmount(originalFee);
          } else {
            setOriginalFeeAmount(response.data.fee);
          }
        } catch (error) {
          console.error("Error fetching booking fee:", error);
          toast.error("Unable to fetch booking fee");
          setBookingFeeAmount(0);
          setOriginalFeeAmount(0);
          setDiscountPercent(0);
        } finally {
          setIsFeeLoading(false);
        }
      } else {
        setBookingFeeAmount(0);
        setOriginalFeeAmount(0);
        setDiscountPercent(0);
        setIsFeeLoading(false);
      }
    };

    fetchBookingFee();
  }, [shopId, customerId]);

  const handleServiceToggle = (serviceId) => {
    setSelectedServiceIds(prev =>
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const processBooking = async (bookingFeePaid) => {
    setIsProcessing(true);
    
    const payload = {
      shop_id: shopId,
      emp_id: empId,
      customer_id: customerId,
      service_ids: selectedServiceIds,
      booking_fee_paid: bookingFeePaid,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/bookings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Booking confirmed successfully");
        onBookingComplete(true, data.booking);
        setTimeout(() => onClose(), 1000);
      } else {
        const errorMessage = data.error || "Booking failed";
        toast.error(errorMessage);
        onBookingComplete(false, null, errorMessage);
      }
    } catch (error) {
      toast.error("Connection error. Please try again.");
      onBookingComplete(false, null, "Network error");
      console.error("Booking error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePayment = async () => {
    if (selectedServiceIds.length === 0) {
      toast.error("Please select at least one service");
      return;
    }

    if (!isRazorpayReady || typeof window.Razorpay === 'undefined') {
      toast.error("Payment gateway not ready");
      return;
    }

    if (customerId <= 0) {
      toast.error("Payment required for registered customers only");
      return;
    }

    if (!session?.user?.name && !session?.user?.phone) {
      toast.error("Customer details missing. Please log in again.");
      return;
    }

    if (bookingFeeAmount <= 0) {
      await processBooking(true);
      return;
    }

    setIsProcessing(true);

    try {
      const orderResponse = await axios.post(`${API_BASE_URL}/create-razorpay-order`, { shop_id: shopId });
      const { id: order_id, amount, currency } = orderResponse.data;

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: amount,
        currency: currency,
        name: "Booking Fee",
        description: "Service booking confirmation fee",
        order_id: order_id,
        handler: async () => await processBooking(true),
        prefill: {
          name: session.user.name || "",
          contact: session.user.phone || "",
        },
        theme: { color: "#1f2937" },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", () => {
        toast.error("Payment failed");
        setIsProcessing(false);
      });
      rzp.open();
    } catch (error) {
      toast.error("Unable to process payment");
      setIsProcessing(false);
      console.error("Payment error:", error);
    }
  };

  const totalSelectedServices = selectedServiceIds.length;
  const isFormValid = totalSelectedServices > 0;
  const isButtonDisabled = isProcessing || isFeeLoading || !isFormValid;

  return (
    <div className="fixed  inset-0 bg-black backdrop-blur-sm flex items-center justify-center z-50 p-4 uppercase tracking-wider">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 pb-0  border-b border-gray-100">
          <h2 className="text-xl font-bold text-gray-900">Book Service</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-80px)]">
          {/* Service Selection */}
          <div className="p-6">
            <p className="text-sm text-gray-600 mb-4">
              Select services for your styling
            </p>

            {services && services.length > 0 ? (
              <div className="space-y-2">
                {services.map((service) => (
                  <label
                    key={service.service_id}
                    className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedServiceIds.includes(service.service_id)}
                      onChange={() => handleServiceToggle(service.service_id)}
                      className="w-4 h-4 text-gray-900 rounded border-gray-300 focus:ring-gray-900"
                    />
                    <div className="ml-3 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">
                          {service.service_name}
                        </span>
                        {service.price && (
                          <span className="text-sm font-medium text-gray-900 flex items-center">
                            <CurrencyRupeeIcon className="h-3 w-3" />
                            {service.price}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center text-xs text-gray-500 mt-1">
                        <ClockIcon className="h-3 w-3 mr-1" />
                        {service.service_duration_minutes} minutes
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-500 py-8">
                No services available
              </p>
            )}
          </div>

         {bookingFeeAmount > 0 && !isFeeLoading && (
  <div className="flex flex-col justify-center text-[12px] text-gray-500  mt-[-10px] mb-[30px] mx-6 border-b pb-4 border-gray-300">
    {/* Terms and Conditions with horizontal lines */}
    <div className="flex items-center w-full mb-2">
      <div className="flex-1 border-t border-gray-300"></div>
      <span className="px-2 text-[12px] font-semibold text-black whitespace-nowrap">
        Terms and Conditions apply
      </span>
      <div className="flex-1 border-t border-gray-300"></div>
    </div>

    {/* Points */}
    <div className="flex flex-col items-start gap-y-1.5">
      <div className="flex items-center font-medium">
        <ShieldCheckIcon className="h-3 w-3 mr-1" />
        Secure payment
      </div>
      <div className="font-medium">• Booking fees is non-refundable</div>
      <div className="font-medium">• Refundable only if cancelled by shop</div>
    </div>
  </div>
)}


          {/* Payment Section */}
          {customerId > 0 && totalSelectedServices > 0 && (
            <div className=" p-6 pt-0 mt-[-20px]">
              <div className="bg-gray-50 p-2 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-900 text-[12px]">Booking Fee -  ₹{bookingFeeAmount}</span>
                  {discountPercent > 0 && (
                    <span className="bg-green-100 text-green-800 text-xs font-medium px-2 py-1 rounded-full">
                      {discountPercent}% OFF
                    </span>
                  )}
                </div>

                {isFeeLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-300 border-t-gray-900"></div>
                    <span className="ml-2 text-sm text-gray-600">Calculating...</span>
                  </div>
                ) : (
                  <div className="text-center">
                    {discountPercent > 0 && originalFeeAmount > bookingFeeAmount ? (
                      <div className="space-y-1">
                        <span className="text-sm text-gray-500 line-through">₹{originalFeeAmount}</span>
                        <div className="text-2xl font-bold text-gray-900 flex items-center justify-center">
                          <CurrencyRupeeIcon className="h-5 w-5" />
                          {bookingFeeAmount}
                        </div>
                        <p className="text-xs font-semibold text-green-600">Save ₹{originalFeeAmount - bookingFeeAmount}</p>
                      </div>
                    ) : (
                      <div className="text-2xl font-bold text-gray-900 flex items-center justify-center">
                        <CurrencyRupeeIcon className="h-5 w-5" />
                        {bookingFeeAmount}
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handlePayment}
                  disabled={isButtonDisabled || !isRazorpayReady}
                  className={`w-full mt-4 bg-gray-900 text-white font-medium py-3 px-4 rounded-lg transition-colors ${
                    isButtonDisabled 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:bg-gray-800'
                  }`}
                >
                  {isProcessing ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                      Processing...
                    </div>
                  ) : bookingFeeAmount === 0 ? (
                    "Confirm Booking"
                  ) : (
                    `Pay ₹${bookingFeeAmount}`
                  )}
                </button>

                


              </div>
            </div>
          )}

          
        </div>
      </div>
    </div>
  );
}


// === END BookingModal Component ===

export default function UserDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [shops, setShops] = useState([]);
  const [userLocation, setUserLocation] = useState(null);
  const [isFetchingShops, setIsFetchingShops] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [selectedShop, setSelectedShop] = useState(null);
  const [shopDetails, setShopDetails] = useState(null);
  const [isFetchingShopDetails, setIsFetchingShopDetails] = useState(false);
  const [showShopDetailsModal, setShowShopDetailsModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [openBarberId, setOpenBarberId] = useState(null);
  const [userCity, setUserCity] = useState("Detecting Location...");
  const [activeBooking, setActiveBooking] = useState(null); // New state for active booking

  // New states for booking
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [selectedBarberForBooking, setSelectedBarberForBooking] =
    useState(null);
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingErrorDetails, setBookingErrorDetails] = useState("");
  const [bookingConfirmation, setBookingConfirmation] = useState(null);

  // New states for cancellation
  const [isCancellingBooking, setIsCancellingBooking] = useState(false);
  const [cancelMessage, setCancelMessage] = useState("");
  const [cancelErrorDetails, setCancelErrorDetails] = useState("");

  const shopsIntervalRef = useRef(null);
  const shopDetailsIntervalRef = useRef(null);
  const activeBookingIntervalRef = useRef(null); // New ref for active booking polling
  // New state for push notifications
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [swRegistration, setSwRegistration] = useState(null);
 const [isLoadingNotification, setIsLoadingNotification] = useState(false);
 const [isSigningOut, setIsSigningOut] = useState(false);
  // Function to convert VAPID public key from Base64 to Uint8Array
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY; 

function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
// This runs once on component mount
  // Function to handle push notification subscription
  const registerServiceWorker = useCallback(async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Push messaging is not supported.');
      return null;
    }

    try {
      // *** IMPORTANT CHANGE HERE ***
      const registration = await navigator.serviceWorker.register('/service-worker.js'); // Updated path
      console.log('Service Worker registered successfully:', registration);
      setSwRegistration(registration); // Store registration for later use
      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
      return null;
    }
  }, []);




    const checkSubscriptionStatus = useCallback(async () => {
  if (!session?.user?.id) return;
  try {
    const response = await fetch(`${API_BASE_URL}/customers/${session.user.id}/subscription-status`);
    if (response.ok) {
      const data = await response.json();
      setIsPushSubscribed(data.isSubscribed);
    }
  } catch (error) {
    console.error('Error checking subscription status:', error);
  }
}, [session?.user?.id]);

const subscribeUser = useCallback(async () => {
  setIsLoadingNotification(true); // Start loading

  if (!swRegistration || !session?.user?.id || !VAPID_PUBLIC_KEY) {
    const warningMessage = 'Cannot subscribe: Service Worker not registered, User not logged in, or VAPID Public Key missing.';
    console.warn(warningMessage);
    toast.warn('Push notifications are not available at the moment.', {
      position: "top-right",
      autoClose: 4000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
    setIsLoadingNotification(false); // Stop loading on early exit
    return;
  }

  if (isPushSubscribed) {
    toast.info('You are already subscribed to push notifications!', {
      position: "top-right",
      autoClose: 3000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
    setIsLoadingNotification(false); // Stop loading on early exit
    return;
  }

  try {
    const pushSubscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    console.log('Push Subscription:', pushSubscription);

    // Send subscription to your backend
    const response = await fetch(`${API_BASE_URL}/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customerId: session.user.id,
        subscription: pushSubscription,
      }),
    });

    if (response.ok) {
      toast.success('Successfully subscribed to push notifications!', {
        position: "top-right",
        autoClose: 4000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      setIsPushSubscribed(true);
    } else {
      const errorData = await response.json();
      const errorMessage = `Failed to subscribe: ${errorData.error || response.statusText}`;
      toast.error(errorMessage, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      await pushSubscription.unsubscribe();
    }
  } catch (error) {
    console.error('Error subscribing to push:', error);
    toast.error('An error occurred during subscription. Please try again.', {
      position: "top-right",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
  } finally {
    setIsLoadingNotification(false); // Stop loading
  }
}, [swRegistration, session?.user?.id, isPushSubscribed, VAPID_PUBLIC_KEY, setIsPushSubscribed]);

const unsubscribeUser = useCallback(async () => {
  setIsLoadingNotification(true); // Start loading

  if (!swRegistration || !session?.user?.id) {
    const warningMessage = 'Cannot unsubscribe: Service Worker not registered or User not logged in.';
    console.warn(warningMessage);
    toast.warn('Unable to unsubscribe at the moment.', {
      position: "top-right",
      autoClose: 4000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
    setIsLoadingNotification(false); // Stop loading on early exit
    return;
  }

  if (!isPushSubscribed) {
    toast.info('You are not subscribed to push notifications.', {
      position: "top-right",
      autoClose: 3000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
    setIsLoadingNotification(false); // Stop loading on early exit
    return;
  }

  try {
    const subscription = await swRegistration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      console.log('Browser subscription removed.');
    }

    // Tell your backend to remove the subscription
    const response = await fetch(`${API_BASE_URL}/unsubscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ customerId: session.user.id }),
    });

    if (response.ok) {
      toast.success('Successfully unsubscribed from push notifications.', {
        position: "top-right",
        autoClose: 4000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      setIsPushSubscribed(false);
    } else {
      const errorData = await response.json();
      const errorMessage = `Failed to unsubscribe from backend: ${errorData.error || response.statusText}`;
      toast.error(errorMessage, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    }
  } catch (error) {
    console.error('Error unsubscribing:', error);
    toast.error('An error occurred during unsubscription. Please try again.', {
      position: "top-right",
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
    });
  } finally {
    setIsLoadingNotification(false); // Stop loading
  }
}, [swRegistration, session?.user?.id, isPushSubscribed, setIsPushSubscribed]);

// Initial setup for service worker and subscription status
useEffect(() => {
  registerServiceWorker(); // Register SW on component mount
  if (session?.user?.id) {
    checkSubscriptionStatus(); // Check backend status
  }
}, [session?.user?.id, registerServiceWorker, checkSubscriptionStatus]);
const fetchShops = useCallback(
  async (lat, long) => {
    if (shops.length === 0) {
      setIsFetchingShops(true);
    }
    setFetchError(null);
    try {
      const queryParams = new URLSearchParams();
      if (lat !== null && long !== null) {
        queryParams.append("lat", lat);
        queryParams.append("long", long);
      }
      const url = `${API_BASE_URL}/shops/simple?${queryParams.toString()}`;
      console.log("Fetching shops from:", url);

      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      console.log("Shops fetch response status:", res.status);

      if (!res.ok) {
        const errorText = await res.text();
        const parsedError = JSON.parse(errorText);
        throw new Error(parsedError.message || `Server error: ${res.status}`);
      }

      const data = await res.json();
      console.log("Shops data received:", data);

      // Create an array of promises for distance calculation
      const distancePromises = data.shops.map(async (shop) => {
        let distance = Infinity;
        if (shop.location?.distance_from_you) {
          const parsedBackendDistance = parseFloat(
            shop.location.distance_from_you.split(" ")[0]
          );
          if (!isNaN(parsedBackendDistance)) {
            distance = parsedBackendDistance;
          }
        }

        if (
          lat !== null &&
          long !== null &&
          shop.location?.coordinates &&
          (distance === Infinity || isNaN(distance))
        ) {
          // Await the asynchronous calculateDistance function
          distance = await calculateDistance(
            lat,
            long,
            shop.location.coordinates.lat,
            shop.location.coordinates.long
          );
        }
        return { ...shop, distance_from_you: distance };
      });

      // Wait for all distance calculations to complete
      let processedShops = await Promise.all(distancePromises);

      processedShops = processedShops.sort(
        (a, b) => a.distance_from_you - b.distance_from_you
      );

      setShops(processedShops);
    } catch (error) {
      console.error("Error fetching shops:", error);
      setFetchError(error.message || "Failed to fetch shops. Please try again.");
    } finally {
      setIsFetchingShops(false);
    }
  },
  [shops.length, API_BASE_URL]
);

  const fetchShopDetails = useCallback(
    async (shopId) => {
      setIsFetchingShopDetails(true);
      setFetchError(null);
      try {
        const payload = {
          shop_id: shopId,
          customer_id: session?.user?.id,
          lat: userLocation?.lat,
          long: userLocation?.long,
        };
        console.log(
          "Fetching shop details for shop_id:",
          shopId,
          "with payload:",
          payload
        );

        const res = await fetch(`${API_BASE_URL}/shop_status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });

        console.log("Shop details fetch response status:", res.status);

        if (!res.ok) {
          const errorText = await res.text();
          let parsedError = {};
          try {
            parsedError = JSON.parse(errorText);
          } catch (jsonError) {
            parsedError.message = errorText;
          }
          console.error(
            "Error response from shop_status API:",
            parsedError.message
          );
          throw new Error(parsedError.message || `Server error: ${res.status}`);
        }

        const data = await res.json();
        console.log("Shop details data received:", data);
        if (data.shops && data.shops.length > 0) {
          setShopDetails(data.shops[0]);
          setShowShopDetailsModal(true);
        } else {
          setFetchError("Shop details not found.");
          setShowShopDetailsModal(false);
        }
      } catch (error) {
        console.error("Error fetching shop details:", error);
        setFetchError(
          error.message || "Failed to fetch shop details. Please try again."
        );
        setShowShopDetailsModal(false);
      } finally {
        setIsFetchingShopDetails(false);
      }
    },
    [session?.user?.id, userLocation?.lat, userLocation?.long]
  );

  // New function to fetch active bookings
  const fetchActiveBooking = useCallback(async (customerId) => {
    if (!customerId) return;

    try {
      const payload = {
        customer_id: customerId,
        // Removed status filter here, as backend doesn't handle array correctly
        // The backend route provided in the prompt expects a single string status or no status filter.
        // We will fetch all bookings for the customer and filter client-side.
      };
      const res = await fetch(`${API_BASE_URL}/getBookingsbycustomer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        let parsedError = {};
        try {
          parsedError = JSON.parse(errorText);
        } catch (jsonError) {
          parsedError.message = errorText;
        }
        console.error(
          "Error response from getBookingsbycustomer API:",
          parsedError.message
        );
        throw new Error(parsedError.message || `Server error: ${res.status}`);
      }

      const data = await res.json();
      console.log(
        "All bookings for customer received (for client-side filtering):",
        data
      );

      if (data.bookings && data.bookings.length > 0) {
        // Filter client-side for 'booked' or 'in_service' statuses
        const activeBookings = data.bookings.filter(
          (b) => b.status === "booked" || b.status === "in_service"
        );
        if (activeBookings.length > 0) {
          setActiveBooking(activeBookings[0]); // Take the first active one
        } else {
          setActiveBooking(null);
        }
      } else {
        setActiveBooking(null);
      }
    } catch (error) {
      console.error("Error fetching active booking:", error);
      setActiveBooking(null);
    }
  }, []);


    const onCloseShopDetailsModal = useCallback(() => {
    setShowShopDetailsModal(false);
    setSelectedShop(null);
    setShopDetails(null);
    setOpenBarberId(null);
  }, []);
  // Function to handle booking cancellation
 const handleCancelBooking = async () => {
    if (!activeBooking || !session?.user?.id) {
      const errorMessage = "No active booking to cancel.";
      setCancelMessage(errorMessage);
      toast.warn(errorMessage, {
        position: "top-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      return;
    }

    setIsCancellingBooking(true);
    setCancelMessage("");
    setCancelErrorDetails("");

    const payload = {
      customer_id: session.user.id,
      booking_id: activeBooking.booking_id,
    };

    try {
      const response = await fetch(`${API_BASE_URL}/bookings/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        const successMessage = data.message || "Booking cancelled successfully!";
        setCancelMessage(successMessage);
        setCancelErrorDetails("");
        
        // Show success toast
        toast.success(successMessage, {
          position: "top-right",
          autoClose: 4000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });

        setActiveBooking(null); // Clear active booking from state
        
        // Optionally, refresh shops to reflect queue changes
        if (userLocation && fetchShops) {
          fetchShops(userLocation.lat, userLocation.long);
        }
        if (selectedShop && fetchShopDetails) {
          fetchShopDetails(selectedShop.shop_id);
        }

        // Close modal after successful cancellation
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        const errorMessage = data.error || "Failed to cancel booking.";
        const errorDetails = data.details || "";
        
        setCancelMessage(errorMessage);
        setCancelErrorDetails(errorDetails);
        
        // Show error toast with details if available
        toast.error(
          errorDetails 
            ? `${errorMessage}: ${errorDetails}` 
            : errorMessage,
          {
            position: "top-right",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
          }
        );
      }
    } catch (error) {
      const errorMessage = "An unexpected error occurred during cancellation.";
      setCancelMessage(errorMessage);
      setCancelErrorDetails(error.message);
      
      // Show network error toast
      toast.error(`${errorMessage} Please check your connection and try again.`, {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
      
      console.error("Cancellation fetch error:", error);
    } finally {
      setIsCancellingBooking(false);
      // Auto-hide cancellation message after a few seconds
      setTimeout(() => {
        setCancelMessage("");
        setCancelErrorDetails("");
      }, 8000); // Message disappears after 8 seconds
    }
  };

  const getCityFromCoordinates = useCallback(async (lat, long) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${long}&format=json&accept-language=en`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch city name");
      }
      const data = await response.json();
      const city =
        data.address.city ||
        data.address.town ||
        data.address.village ||
        data.address.county ||
        "Unknown Location";
      setUserCity(city);
    } catch (error) {
      console.error("Error fetching city name:", error);
      setUserCity("Unknown Location");
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }

    if (status === "authenticated" && session?.user?.role !== "customer") {
      signOut({ callbackUrl: "/" });
      return;
    }

    if (
      status === "authenticated" &&
      session?.user?.role === "customer" &&
      userLocation === null
    ) {
      console.log("Attempting to get user location...");
      if (!navigator.geolocation) {
        setFetchError("Geolocation is not supported by this browser.");
        setIsFetchingShops(false);
        setUserLocation({ lat: null, long: null });
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          console.log("User location obtained:", { latitude, longitude });
          setUserLocation({ lat: latitude, long: longitude });
          getCityFromCoordinates(latitude, longitude);
        },
        (error) => {
          console.error("Error getting user location:", error);
          setFetchError(
            "Unable to retrieve your location. Shops may not be sorted by distance, or some may not appear."
          );
          setUserLocation({ lat: null, long: null });
          setUserCity("Location Access Denied");
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 60000,
        }
      );
    }
  }, [session, status, router, userLocation, getCityFromCoordinates]);

  // Effect for polling shops (always fetch shops)
  useEffect(() => {
    if (userLocation !== null) {
      console.log("Setting up shops polling interval...");
      if (shopsIntervalRef.current) {
        clearInterval(shopsIntervalRef.current);
      }

      fetchShops(userLocation.lat, userLocation.long);

      shopsIntervalRef.current = setInterval(() => {
        console.log("Polling for shops...");
        fetchShops(userLocation.lat, userLocation.long);
      }, 5000);
    } else {
      // Clear interval if location is null
      if (shopsIntervalRef.current) {
        console.log("Clearing shops polling interval due to no location.");
        clearInterval(shopsIntervalRef.current);
        shopsIntervalRef.current = null;
      }
    }

    return () => {
      console.log("Clearing shops polling interval on unmount.");
      if (shopsIntervalRef.current) {
        clearInterval(shopsIntervalRef.current);
        shopsIntervalRef.current = null;
      }
    };
  }, [userLocation, fetchShops]);

  useEffect(() => {
    if (showShopDetailsModal && selectedShop) {
      console.log(
        "Setting up shop details polling interval for shop:",
        selectedShop.shop_id
      );
      if (shopDetailsIntervalRef.current) {
        clearInterval(shopDetailsIntervalRef.current);
      }

      fetchShopDetails(selectedShop.shop_id);

      shopDetailsIntervalRef.current = setInterval(() => {
        console.log("Polling for shop details for shop:", selectedShop.shop_id);
        fetchShopDetails(selectedShop.shop_id);
      }, 5000);
    } else {
      if (shopDetailsIntervalRef.current) {
        console.log("Clearing shop details polling interval.");
        clearInterval(shopDetailsIntervalRef.current);
        shopDetailsIntervalRef.current = null;
      }
    }

    return () => {
      if (shopDetailsIntervalRef.current) {
        clearInterval(shopDetailsIntervalRef.current);
      }
    };
  }, [showShopDetailsModal, selectedShop, fetchShopDetails]);

  // Effect for polling active booking
  useEffect(() => {
    if (session?.user?.id) {
      console.log("Setting up active booking polling interval...");
      if (activeBookingIntervalRef.current) {
        clearInterval(activeBookingIntervalRef.current);
      }

      fetchActiveBooking(session.user.id); // Initial fetch

      activeBookingIntervalRef.current = setInterval(() => {
        console.log("Polling for active booking...");
        fetchActiveBooking(session.user.id);
      }, 5000); // Poll every 5 seconds for active booking updates
    } else {
      if (activeBookingIntervalRef.current) {
        console.log("Clearing active booking polling interval.");
        clearInterval(activeBookingIntervalRef.current);
        activeBookingIntervalRef.current = null;
      }
    }

    return () => {
      if (activeBookingIntervalRef.current) {
        clearInterval(activeBookingIntervalRef.current);
      }
    };
  }, [session?.user?.id, fetchActiveBooking]);
  const [expandedServicesShopId, setExpandedServicesShopId] = useState(null);
const [expandedStylistsShopId, setExpandedStylistsShopId] = useState(null);

const toggleStylistsExpansion = (shopId) => {
  setExpandedStylistsShopId((prevId) => (prevId === shopId ? null : shopId));
};
  
  const toggleServicesExpansion = (shopId) => {
   
    setExpandedServicesShopId((prevId) => (prevId === shopId ? null : shopId));
  };
  const filteredShops = Array.isArray(shops)
    ? shops.filter((shop) => {
        const query = searchQuery.toLowerCase();
        const matchesName = shop.shop_name?.toLowerCase().includes(query);
        const matchesService = shop.barbers?.some((barber) =>
          barber.services?.some((service) =>
            service.service_name?.toLowerCase().includes(query)
          )
        );
        return matchesName || matchesService;
      })
    : [];

const shopsWithinRange = filteredShops.filter(shop => shop.distance_from_you <= 6);
const shopsOutsideRange = filteredShops.filter(shop => shop.distance_from_you > 6);

const sortedShopsWithinRange = shopsWithinRange.sort((a, b) => {
  // Priority 1: Top rated shops first
  if (a.top_rated && !b.top_rated) return -1;
  if (!a.top_rated && b.top_rated) return 1;

  // Priority 2: Subscribed shops after top rated
  if (a.is_subscribed && !b.is_subscribed) return -1;
  if (!a.is_subscribed && b.is_subscribed) return 1;

  return 0;
});

const sortedShops = [...sortedShopsWithinRange, ...shopsOutsideRange];


// 3. Filter ads to include only those from shops within a 4km range
const adsWithinRange = sortedShopsWithinRange.flatMap(shop =>
  shop.ads.map(ad => ({ ...ad, shop_id: shop.shop_id, shop_name: shop.shop_name }))
);


// 4. Interleave ads into the sorted shop list
const combinedList = [];
let adIndex = 0;
const adInterval = 3;

sortedShops.forEach((shop, index) => {
  combinedList.push({ type: 'shop', data: shop });
  if ((index + 1) % adInterval === 0 && adIndex < adsWithinRange.length) {
    combinedList.push({ type: 'ad', data: adsWithinRange[adIndex] });
    adIndex++;
  }
});
while (adIndex < adsWithinRange.length) {
  combinedList.push({ type: 'ad', data: adsWithinRange[adIndex] });
  adIndex++;
}

// 5. Setup references for scrolling to shops from ads
const shopRefs = useRef({});
const scrollToShop = (shopId) => {
  const shopCard = shopRefs.current[shopId];
  if (shopCard) {
    shopCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};



  const getStatusBadgeColor = (status) => {
    switch (status) {
      case "Available":
        return "bg-emerald-500 text-white";
      case "Serving":
        return "bg-amber-500 text-white";
      case "Break":
        return "bg-blue-500 text-white";
      case "Unavailable":
        return "bg-red-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const getQueueHighlightColor = (queuePosition) => {
    if (queuePosition === 0 || queuePosition === "0") {
      return "border-emerald-400 bg-emerald-50 text-emerald-800";
    } else if (queuePosition > 0 && queuePosition <= 3) {
      return "border-amber-400 bg-amber-50 text-amber-800";
    } else {
      return "border-blue-400 bg-blue-50 text-blue-800";
    }
  };

  const overallLoading =
    status === "loading" || (isFetchingShops && shops.length === 0);

  // Function to handle opening the booking modal
  const handleJoinQueueClick = (barber) => {
    setSelectedBarberForBooking(barber);
    setShowBookingModal(true);
    setBookingMessage(""); // Clear previous messages
    setBookingErrorDetails("");
    setBookingConfirmation(null);
  };



  // Callback function for when booking is complete (from BookingModal)
  const handleBookingComplete = (success, bookingData, errorMessage) => {
    setShowBookingModal(false); // Close the booking modal
    setSelectedBarberForBooking(null); // Clear selected barber

    if (success) {
      setBookingMessage("Booking successful!");
      setBookingConfirmation(bookingData);
      setBookingErrorDetails("");
      // After successful booking, immediately fetch active booking to update the UI
      fetchActiveBooking(session.user.id);
      // Optionally, refresh shop details to show updated queue
      if (selectedShop) {
        fetchShopDetails(selectedShop.shop_id);
      }
    } else {
      setBookingMessage("Booking failed!");
      setBookingErrorDetails(errorMessage || "Unknown error.");
      setBookingConfirmation(null);
    }

    // Auto-hide booking message after a few seconds
    setTimeout(() => {
      setBookingMessage("");
      setBookingErrorDetails("");
      setBookingConfirmation(null);
    }, 8000); // Message disappears after 8 seconds
  };

   

    const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut({ callbackUrl: "/" });
    } catch (error) {
      console.error("Sign out failed:", error);
      setIsSigningOut(false); // Re-enable if error occurs
    }
  };

  if (overallLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#f6c76d] to-[#cb3a1e] font-sans relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div
            className="absolute top-0 left-0 w-full h-full bg-cover bg-center opacity-10"
            style={{ backgroundImage: 'url("/trimtadka-bg-pattern.png")' }}
          ></div>
          <ScissorsIcon className="absolute top-1/4 left-1/4 h-32 w-32 text-white opacity-5 animate-float-slow transform -translate-x-1/2 -translate-y-1/2" />
          <ScissorsIcon className="absolute bottom-1/4 right-1/4 h-28 w-28 text-white opacity-5 animate-float-slow-alt transform translate-x-1/2 -translate-y-1/2" />
        </div>
        <div className="text-center relative z-10 p-8 rounded-xl">
          <Image
            src="/trimtadka.png"
            alt="TrimTadka logo"
            width={200}
            height={100}
            className="mx-auto  animate-fade-in-up"
          />
          <div className="mt-4 text-white text-[13px] uppercase tracking-wider ">
            Finding the perfect cut for you...
          </div>
        </div>
        <style jsx global>{`
          @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap");
          body {
            font-family: "Inter", sans-serif;
          }
          .animate-float-slow {
            animation: float-slow 8s ease-in-out infinite;
          }
          .animate-float-slow-alt {
            animation: float-slow-alt 9s ease-in-out infinite;
          }
          @keyframes float-slow {
            0%,
            100% {
              transform: translate(0, 0) rotate(15deg);
            }
            50% {
              transform: translate(-20px, -20px) rotate(20deg);
            }
          }
          @keyframes float-slow-alt {
            0%,
            100% {
              transform: translate(0, 0) rotate(-15deg);
            }
            50% {
              transform: translate(20px, 20px) rotate(-20deg);
            }
          }
          .animate-fade-in-up {
            animation: fade-in-up 0.8s ease-out forwards;
          }
          @keyframes fade-in-up {
            from {
              opacity: 0;
              transform: translateY(20px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    );
  }

  if (status === "authenticated" && session?.user?.role === "customer") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f6c76d] to-[#cb3a1e] font-inter">
        <style jsx global>{`
          @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap");
          body {
            font-family: "Inter", sans-serif;
          }
          .animate-fade-in {
            animation: fadeIn 0.3s ease-out forwards;
          }
          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }
          .animate-scale-up {
            animation: scaleUp 0.3s ease-out forwards;
          }
          @keyframes scaleUp {
            from {
              transform: scale(0.95);
              opacity: 0;
            }
            to {
              transform: scale(1);
              opacity: 1;
            }
          }
          .animate-fade-in-down {
            animation: fadeInDown 0.3s ease-out forwards;
          }
          @keyframes fadeInDown {
            from {
              opacity: 0;
              transform: translateY(-10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>

        <header className="backdrop-blur shadow-lg border-b border-white/20 sticky top-0 z-40">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-[5px]">
    <div className="flex items-center justify-between">
      {/* Logo */}
      <div className="flex items-center space-x-4">
        <Image
          src="/trimtadka.png"
          alt="TrimTadka logo"
          width={70}
          height={48}
        />
      </div>

      {/* Right Side: User Info + Buttons */}
      <div className="flex items-center space-x-4">
        {/* User Info */}
        <div className="hidden sm:flex items-center space-x-4 mt-[18px]">
          <div className="text-right">
            <h1 className="text-[#cb3a1e] text-lg font-bold text-left tracking-tighter">
              {session.user.name || session.user.phone}
            </h1>
            <div className="flex items-center justify-end space-x-1 text-white text-[12px] font-semibold uppercase tracking-wider">
              <MapPinIcon className="h-4 w-4 text-[#cb3a1e]" />
              <span>{userCity}</span>
            </div>
          </div>
        </div>

        {/* Notification Bell */}
        <div className="flex flex-col items-center mt-[-5px]">
          <button
    onClick={isPushSubscribed ? unsubscribeUser : subscribeUser}
    className={`p-2 rounded-full transition-colors duration-200 ${
        isPushSubscribed
            ? 'bg-green-500 text-white'
            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
    } ${isLoadingNotification ? 'cursor-not-allowed opacity-50' : ''}`}
    title={
        isLoadingNotification
            ? "Processing..."
            : isPushSubscribed
            ? "Unsubscribe from Push Notifications"
            : "Subscribe to Push Notifications"
    }
    disabled={isLoadingNotification}
>
    {isLoadingNotification ? (
        <Loader className="animate-spin h-4 w-4 text-white" />
    ) : (
        <BellIcon className="h-4 w-4" />
    )}
</button>
          {/* <span className="text-[10px] text-white tracking-wider uppercase mt-1">Enable Notifications</span> */}
        </div>
 <div className="flex flex-col items-center mt-[-5px]">
        
        <WalletAndSyncUI customerId={session.user.id} />
     
        </div>



        {/* Logout Icon Only */}
   <button
      onClick={handleSignOut}
      className={`p-2 bg-[#cb3a1e] hover:bg-[#a62b16] rounded-4xl mt-[-7px] ${
        isSigningOut ? "cursor-not-allowed opacity-50" : ""
      }`}
      disabled={isSigningOut}
      title={isSigningOut ? "Signing out..." : "Sign Out"}
    >
      {isSigningOut ? (
        <Loader className="animate-spin h-4 w-4 text-white" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
    </button>
      </div>
    </div>
  </div>
</header>

 <ToastContainer
  position="top-right"
  autoClose={3000}
  hideProgressBar={false}
  newestOnTop={false}
  closeOnClick
  rtl={false}
  pauseOnFocusLoss
  draggable
  pauseOnHover
  theme="light"
  toastClassName="custom-toast"
  progressClassName="custom-progress"
/>

        <div className="max-w-7xl mx-auto ">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-6">
              <div className="flex items-center justify-center lg:hidden">
                 <div className="text-center space-y-3 mt-4">
                  {/* <h1 className="text-[#cb3a1e] text-3xl font-bold tracking-tighter">
                    {session.user.name || session.user.phone}
                  </h1> */}
                  <div className="flex items-center justify-center space-x-1 text-sm tracking-wider uppercase mb-[-10px]">
                    <MapPinIcon className="h-5 w-5 text-[#cb3a1e]" />
                    <span className="text-white text-[15px] font-semibold">
                      {userCity}
                    </span>
                  </div>
                </div>
              </div>


            <div className="mb-[10px] lg:mt-0 px-4">
  <SearchBar
    searchQuery={searchQuery}
    setSearchQuery={setSearchQuery}
  />
</div>

{/* Conditionally render ShopBanners only if searchQuery is empty */}
{searchQuery === '' && (
  <ShopBanners shops={shops} userLocation={userLocation} scrollToShop={scrollToShop} />
)}

             
            </div>

            <div className="lg:col-span-3 px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
              <div className=" md:mt-0 mt-[-30px] px-3 mb-4">
                <div className="flex items-center justify-center w-full gap-4 mb-4">
                  <div className="flex-grow border-t border-white"></div>
                  <h2
                    className="text-sm font-light text-white tracking-wide uppercase whitespace-nowrap"
                    style={{ fontFamily: "Poppins" }}
                  >
                    {activeBooking
                      ? "Your Current Booking"
                      : `Recommended ${filteredShops.length} shops for you`}
                  </h2>
                  <div className="flex-grow border-t border-white"></div>
                </div>
              </div>

              {/* Booking Confirmation/Error Message Display */}
              {bookingMessage && (
                <div
                  className={`mb-6 p-4 rounded-lg text-center ${
                    bookingConfirmation
                      ? "bg-green-100 text-green-800 border border-green-200"
                      : "bg-red-100 text-red-800 border border-red-200"
                  }`}
                >
                  <p className="font-semibold tracking-wider uppercase">
                    {bookingMessage}
                  </p>
                  {bookingErrorDetails && (
                    <p className="text-sm mt-1">
                      Details: {bookingErrorDetails}
                    </p>
                  )}
                  {bookingConfirmation && (
                    <div className="mt-2 text-sm tracking-wider uppercase">
                      <p>
                        <strong>Booking ID:</strong>{" "}
                        {bookingConfirmation.booking_id}
                      </p>
                      <p>
                        <strong>Employee:</strong>{" "}
                        {bookingConfirmation.emp_name}
                      </p>
                      <p>
                        <strong>Join Time:</strong>{" "}
                        {bookingConfirmation.formatted_times?.join_time_display}
                      </p>
                      <p>
                        <strong>Estimated Wait:</strong>{" "}
                        {bookingConfirmation.estimated_wait_time}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Cancellation Message Display */}
              {cancelMessage && (
                <div
                  className={`mb-6 p-4 rounded-lg text-center tracking-wider uppercase ${
                    cancelErrorDetails
                      ? "bg-red-100 text-red-800 border border-red-200"
                      : "bg-green-100 text-green-800 border border-green-200"
                  }`}
                >
                  <p className="font-semibold">{cancelMessage}</p>
                  {cancelErrorDetails && (
                    <p className="text-sm mt-1">
                      Details: {cancelErrorDetails}
                    </p>
                  )}
                </div>
              )}

              {fetchError && (
                <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6 text-center">
                  {fetchError}
                </div>
              )}

              {/* Always show active booking if present */}
              {activeBooking && (
                <div className="bg-white rounded-xl shadow-lg p-6 animate-fade-in mb-6">
                  <h3 className="text-xl mb-4 font-bold tracking-wide uppercase text-gray-900 mb-4 flex justify-center items-center">
                    <CalendarDaysIcon className="h-7 w-7 mr-3 text-[#cb3a1e]" />
                    Your Active Booking
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-4 text-gray-700 text-base">
                    <p className="flex items-center gap-2 uppercase tracking-wider text-[15px]">
                      <ReceiptIcon className="h-5 w-5 text-[#cb3a1e]" />
                      <strong>Booking ID:</strong> {activeBooking.booking_id}
                    </p>
                    <p className="flex items-center gap-2 uppercase tracking-wider text-[15px]">
                      <StoreIcon className="h-5 w-5 text-[#cb3a1e]" />
                      <strong>Shop:</strong> {activeBooking.shop_name}
                    </p>
                    <p className="flex items-center gap-2 uppercase tracking-wider text-[15px]">
                      <ScissorsIcon className="h-5 w-5 text-[#cb3a1e]" />
                      <strong>Stylist:</strong> {activeBooking.emp_name}
                    </p>
                    <p className="flex items-center gap-2 uppercase tracking-wider text-[15px]">
                      <ScissorsIcon className="h-5 w-5 text-[#cb3a1e]" />
                      <strong>Service:</strong>{" "}
                      {activeBooking.service_type
                        ?.map((s) => s.name)
                        .join(", ") || "N/A"}
                    </p>
                    <p className="flex items-center gap-2 uppercase tracking-wider text-[15px]">
                      <TimerIcon className="h-5 w-5 text-[#cb3a1e]" />
                      <strong>Duration:</strong>{" "}
                      {activeBooking.service_duration_minutes
                        ? `${activeBooking.service_duration_minutes} mins`
                        : "N/A"}
                    </p>
                    <p className="flex text-[15px] items-center gap-2 uppercase tracking-wide">
                      <ClockIcon className="h-5 w-5 text-[#cb3a1e]" />
                      <strong>Arrival Time:</strong>{" "}
                      {activeBooking.formatted_times?.join_time_display ||
                        "N/A"}
                    </p>
                    <p className="flex text-[15px] items-center gap-2 uppercase tracking-wide ">
                      <ClockIcon className="h-5 w-5 text-[#cb3a1e]" />
                      <strong>Expected End:</strong>{" "}
                      {activeBooking.formatted_times?.end_time_display || "N/A"}
                    </p>

                    <p className="flex items-center gap-2 uppercase tracking-wider text-[15px]">
                      {activeBooking.status === "in_service" ? (
                        <LoaderIcon className="h-5 w-5 text-yellow-700 animate-spin" />
                      ) : (
                        <CheckCircle2Icon className="h-5 w-5 text-green-700" />
                      )}
                      <strong>Status:</strong>{" "}
                      <span
                        className={`font-semibold rounded-xl px-2 py-1 uppercase
                          ${
                            activeBooking.status === "in_service"
                              ? "bg-yellow-200 text-yellow-800"
                              : ""
                          }
                          ${
                            activeBooking.status === "booked"
                              ? "bg-green-200 text-green-800"
                              : ""
                          }`}
                      >
                        {activeBooking.status}
                      </span>
                    </p>

                    <p className="flex items-center gap-2 uppercase tracking-wider text-[15px]">
                      <HourglassIcon className="h-5 w-5 text-[#cb3a1e]" />
                      <strong>Time Until Service:</strong>{" "}
                      {activeBooking.time_until_service || "In Service"}
                    </p>
                    <p className="flex items-center gap-2 uppercase tracking-wider text-[15px]">
                      <AlarmClockIcon className="h-5 w-5 text-[#cb3a1e]" />
                      <strong>Estimated Start:</strong>{" "}
                      {activeBooking.estimated_start || "Already Started"}
                    </p>
                  </div>

                  
                  {/* Cancel Booking Button */}
                  <div className="mt-6 text-center">
                    <button
                      onClick={handleCancelBooking}
                      disabled={isCancellingBooking}
                      className="w-full sm:w-auto bg-red-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-red-700 transition-colors duration-200 flex items-center justify-center mx-auto shadow-md tracking-wider uppercase"
                    >
                      {isCancellingBooking ? (
                        <svg
                          className="animate-spin h-5 w-5 text-white mr-3"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                      ) : (
                        <XMarkIcon className="h-5 w-5 mr-2 " />
                      )}
                      {isCancellingBooking ? "Cancelling..." : "Cancel Booking"}
                    </button>
                  </div>
                </div>
              )}

              {/* Show shops always, but disable booking button if active booking exists */}
  {combinedList.length === 0 && !isFetchingShops ? (
      <div className="text-center py-12">
        <p className="text-gray-500 text-sm tracking-wider uppercase">
          NO SHOPS FOUND MATCHING YOUR SEARCH.
        </p>
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {combinedList.map((item, index) => {
          if (item.type === 'shop') {
            const shop = item.data;
            return (
              <ShopCard
                key={shop.shop_id}
                shop={shop}
                ref={el => (shopRefs.current[shop.shop_id] = el)}
                 
       
        expandedServicesShopId={expandedServicesShopId}
        expandedStylistsShopId={expandedStylistsShopId}
        isFetchingShopDetails={isFetchingShopDetails}
        toggleServicesExpansion={toggleServicesExpansion}
        toggleStylistsExpansion={toggleStylistsExpansion}
        setSelectedShop={setSelectedShop}
        fetchShopDetails={fetchShopDetails}
              />
            );
          } else {
            const ad = item.data;
            return (
              <AdCard
                key={`ad-${index}`}
                ad={ad}
                onClick={() => scrollToShop(ad.shop_id)}
              />
            );
          }
        })}
      </div>
    )}
            </div>
          </div>
        </div>

       {showShopDetailsModal && shopDetails && !showBookingModal && (
      <ShopDetailsModal
        shopDetails={shopDetails}
        onClose={onCloseShopDetailsModal} // Pass the new onClose function
        isFetchingShopDetails={isFetchingShopDetails}
        openBarberId={openBarberId}
        setOpenBarberId={setOpenBarberId}
        handleJoinQueueClick={handleJoinQueueClick}
        activeBooking={activeBooking}
      />
    )}
        {showBookingModal &&
  selectedBarberForBooking &&
  session?.user?.id &&
  selectedShop && (
          <BookingModal
  shopId={selectedShop.shop_id}
  empId={selectedBarberForBooking.emp_id}
  customerId={session.user.id}
  services={selectedBarberForBooking.services}
  onClose={() => setShowBookingModal(false)}
  onBookingComplete={handleBookingComplete}
  session={session} // Add the session object here
/>
          )}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-700 font-inter">
      <p>Loading user data or redirecting...</p>
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap");
        body {
          font-family: "Inter", sans-serif;
        }
      `}</style>
    </div>
  );

}


