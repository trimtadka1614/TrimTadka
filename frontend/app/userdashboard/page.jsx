"use client";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import duration from "dayjs/plugin/duration";
import Image from "next/image";
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
} from "lucide-react";
import dayjs from "dayjs"; // Import dayjs for date formatting
dayjs.extend(duration);
import isSameOrBefore from "dayjs/plugin/isSameOrBefore"; // Import if not already

dayjs.extend(isSameOrBefore);
const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app';


function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
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
  return distance;
}

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
// === END SearchBar component ===
const ProgressTimer = ({ joinTime, estimatedStartTime }) => {
  const [progress, setProgress] = useState(0);
  const [showProgressBar, setShowProgressBar] = useState(true);

  useEffect(() => {
    // --- Handle missing estimatedStartTime as before ---
    if (!estimatedStartTime || estimatedStartTime.trim() === "") {
      setShowProgressBar(false);
      setProgress(0);
      return;
    }

    setShowProgressBar(true);

    // Parse estimated time string and normalize 'end'
    const [hourStr, minuteStrPart] = estimatedStartTime.split(":");
    const [minuteStr, meridian] = minuteStrPart.split(" ");
    let hour = parseInt(hourStr, 10);
    const minute = parseInt(minuteStr, 10);

    if (meridian === "PM" && hour !== 12) {
      hour += 12;
    } else if (meridian === "AM" && hour === 12) {
      hour = 0;
    }

    // `start` is now the CURRENT time (when the component mounts or dependencies change)
    // `end` is the estimated finish time, based on the *current date* + estimated time
    const initialNow = dayjs(); // Capture current time when effect runs
    let end = initialNow.hour(hour).minute(minute).second(0).millisecond(0);

    // If the estimated time is earlier than 'initialNow' on the same day,
    // assume it's on the next day. This ensures 'end' is always in the future relative to 'initialNow'.
    if (end.isBefore(initialNow)) {
      end = end.add(1, "day");
    }

    // --- NEW LOGIC FOR PROGRESS CALCULATION ---
    // The total duration is now from 'initialNow' to 'end'
    const totalDurationFromNow = end.diff(initialNow, "second");

    // Handle edge cases where the estimated time is already in the past
    if (totalDurationFromNow <= 0) {
      console.warn("Estimated time is in the past relative to current time.");
      setProgress(100); // Set to 100% if already past
      setShowProgressBar(true);
      return () => {}; // No interval needed
    }

    const update = () => {
      const now = dayjs();
      // Remaining time from 'now' to 'end'
      const remainingTime = end.diff(now, "second");

      // Calculate progress based on how much time has passed relative to 'totalDurationFromNow'
      // If 100 seconds total, and 10 seconds remaining, then (100 - 10) / 100 = 90%
      const percentage = Math.max(
        0,
        Math.min(
          ((totalDurationFromNow - remainingTime) / totalDurationFromNow) * 100,
          100
        )
      );

      console.log("Now:", now.format());
      console.log("End (estimated):", end.format());
      console.log("Remaining Time:", remainingTime);
      console.log("Total Duration From Now:", totalDurationFromNow);
      console.log("Progress:", percentage);

      setProgress(percentage);

      // Clear interval when progress reaches 100%
      if (percentage >= 100) {
        clearInterval(interval);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [estimatedStartTime]); // joinTime is no longer a direct dependency for progress calculation

  // Only render the progress bar if showProgressBar is true
  if (!showProgressBar) {
    return null;
  }

  return (
    <div className="mt-6 w-full max-w-md mx-auto">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm tracking-wider uppercase font-semibold text-gray-700">
          Time Until Service Starts
        </label>
      </div>

      <div className="w-full h-2 bg-gray-300 rounded-full shadow-inner">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-green-400 to-blue-500 transition-all duration-500 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="text-sm font-bold tracking-wider uppercase text-gray-600 mt-1 text-right">
        {Math.round(progress)}% completed
      </p>
    </div>
  );
};

// === BookingModal Component ===
function BookingModal({
  shopId,
  empId,
  customerId,
  services,
  onClose,
  onBookingComplete,
}) {
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [bookingMessage, setBookingMessage] = useState("");
  const [isBookingLoading, setIsBookingLoading] = useState(false);
  const [bookingErrorDetails, setBookingErrorDetails] = useState("");

  const handleServiceChange = (serviceId) => {
    setSelectedServiceIds((prevSelected) =>
      prevSelected.includes(serviceId)
        ? prevSelected.filter((id) => id !== serviceId)
        : [...prevSelected, serviceId]
    );
  };

  const handleBookingSubmit = async () => {
    setBookingMessage("");
    setBookingErrorDetails("");
    setIsBookingLoading(true);

    if (selectedServiceIds.length === 0) {
      setBookingMessage("Please select at least one service.");
      setIsBookingLoading(false);
      return;
    }

    const payload = {
      shop_id: shopId,
      emp_id: empId,
      customer_id: customerId,
      service_ids: selectedServiceIds,
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
        setBookingMessage(data.message || "Booking created successfully!");
        onBookingComplete(true, data.booking); // Pass success and booking data
      } else {
        setBookingMessage(data.error || "Failed to create booking.");
        setBookingErrorDetails(data.details || "");
        onBookingComplete(
          false,
          null,
          data.error || "Failed to create booking."
        ); // Pass failure and error
      }
    } catch (error) {
      setBookingMessage("An unexpected error occurred during booking.");
      setBookingErrorDetails(error.message);
      onBookingComplete(false, null, "Network error or unexpected issue."); // Pass failure and error
      console.error("Booking fetch error:", error);
    } finally {
      setIsBookingLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-scale-up">
        <div className="sticky top-0 bg-white border-b border-[#cb3a1e] p-6 flex items-center justify-between">
          <h2 className="text-2xl uppercase tracking-wider  font-bold text-gray-900 flex items-center">
            <CalendarDaysIcon className="h-7 w-7 mr-3 text-[#cb3a1e]" />
            Book Your Service
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close booking modal"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-gray-700 mb-4 ">
            Select the services you'd like to book with this stylist.
          </p>

          {services && services.length > 0 ? (
            <div className="space-y-3 mb-6">
              {services.map((service) => (
                <label
                  key={service.service_id}
                  className="flex items-center p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedServiceIds.includes(service.service_id)}
                    onChange={() => handleServiceChange(service.service_id)}
                    className="form-checkbox h-5 w-5 text-[#cb3a1e] rounded focus:ring-[#cb3a1e]"
                  />
                  <span className="ml-3 tracking-wider uppercase text-sm text-gray-800 font-medium flex-grow">
                    {service.service_name}
                  </span>
                  <span className="text-gray-600 text-sm">
                    ({service.service_duration_minutes} min)
                  </span>
                  {service.price && (
                    <span className="ml-2 text-gray-900 font-semibold flex items-center">
                      <CurrencyRupeeIcon className="h-4 w-4 mr-1" />
                      {service.price}
                    </span>
                  )}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4 tracking-wider uppercase">
              No services available for this stylist.
            </p>
          )}

          {bookingMessage && (
            <div
              className={`mt-4 p-3 rounded-md ${
                bookingErrorDetails
                  ? "bg-red-100 text-red-800"
                  : "bg-green-100 text-green-800"
              }`}
            >
              <p className="font-semibold">{bookingMessage}</p>
              {bookingErrorDetails && (
                <p className="text-sm mt-1">{bookingErrorDetails}</p>
              )}
            </div>
          )}

          <button
            onClick={handleBookingSubmit}
            className="w-full bg-[#cb3a1e] text-white font-semibold py-3 px-4 rounded-lg hover:bg-[#a62b16] transition-colors duration-200 flex items-center justify-center mt-6 tracking-wider uppercase"
            disabled={isBookingLoading || selectedServiceIds.length === 0}
          >
            {isBookingLoading ? (
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
              <SparklesIcon className="h-5 w-5 mr-2" />
            )}
            {isBookingLoading ? "Processing Booking..." : "Confirm Booking"}
          </button>
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
    if (!swRegistration || !session?.user?.id || !VAPID_PUBLIC_KEY) {
      console.warn('Cannot subscribe: Service Worker not registered, User not logged in, or VAPID Public Key missing.');
      return;
    }

    if (isPushSubscribed) {
      alert('You are already subscribed to push notifications!');
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
        alert('Successfully subscribed to push notifications!');
        setIsPushSubscribed(true);
      } else {
        const errorData = await response.json();
        alert(`Failed to subscribe: ${errorData.error || response.statusText}`);
        // Optionally, unsubscribe from browser if backend failed to store
        await pushSubscription.unsubscribe();
      }
    } catch (error) {
      console.error('Error subscribing to push:', error);
      alert('An error occurred during subscription. Please try again.');
    }
  }, [swRegistration, session?.user?.id, isPushSubscribed]);

  const unsubscribeUser = useCallback(async () => {
    if (!swRegistration || !session?.user?.id) {
      console.warn('Cannot unsubscribe: Service Worker not registered or User not logged in.');
      return;
    }

    if (!isPushSubscribed) {
      alert('You are not subscribed to push notifications.');
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
        alert('Successfully unsubscribed from push notifications.');
        setIsPushSubscribed(false);
      } else {
        const errorData = await response.json();
        alert(`Failed to unsubscribe from backend: ${errorData.error || response.statusText}`);
        // Optionally, re-subscribe in browser if backend failed to remove
        // This is tricky, usually you want to ensure sync. User might need to retry.
      }
    } catch (error) {
      console.error('Error unsubscribing:', error);
      alert('An error occurred during unsubscription. Please try again.');
    }
  }, [swRegistration, session?.user?.id, isPushSubscribed]);

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
          headers: {
            Accept: "application/json",
          },
        });

        console.log("Shops fetch response status:", res.status);

        if (!res.ok) {
          const errorText = await res.text();
          let parsedError = {};
          try {
            parsedError = JSON.parse(errorText);
          } catch (jsonError) {
            parsedError.message = errorText;
          }
          console.error("Error response from shops API:", parsedError.message);
          throw new Error(parsedError.message || `Server error: ${res.status}`);
        }

        const data = await res.json();
        console.log("Shops data received:", data);

        let processedShops = data.shops.map((shop) => {
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
            distance = calculateDistance(
              lat,
              long,
              shop.location.coordinates.lat,
              shop.location.coordinates.long
            );
          }
          return { ...shop, distance_from_you: distance };
        });

        processedShops = processedShops.sort(
          (a, b) => a.distance_from_you - b.distance_from_you
        );

        setShops(processedShops);
      } catch (error) {
        console.error("Error fetching shops:", error);
        setFetchError(
          error.message || "Failed to fetch shops. Please try again."
        );
      } finally {
        setIsFetchingShops(false);
      }
    },
    [shops.length]
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

  // Function to handle booking cancellation
  const handleCancelBooking = async () => {
    if (!activeBooking || !session?.user?.id) {
      setCancelMessage("No active booking to cancel.");
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
        setCancelMessage(data.message || "Booking cancelled successfully!");
        setCancelErrorDetails("");
        setActiveBooking(null); // Clear active booking from state
        // Optionally, refresh shops to reflect queue changes
        if (userLocation) {
          fetchShops(userLocation.lat, userLocation.long);
        }
        if (selectedShop) {
          fetchShopDetails(selectedShop.shop_id);
        }
      } else {
        setCancelMessage(data.error || "Failed to cancel booking.");
        setCancelErrorDetails(data.details || "");
      }
    } catch (error) {
      setCancelMessage("An unexpected error occurred during cancellation.");
      setCancelErrorDetails(error.message);
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

        <header className="backdrop-blur-md shadow-lg border-b border-white/20 sticky top-0 z-40">
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
        <div className="flex flex-col items-center mt-3">
          <button
            onClick={isPushSubscribed ? unsubscribeUser : subscribeUser}
            className={`p-2 rounded-full transition-colors duration-200 ${
              isPushSubscribed
                ? 'bg-green-500 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
            title={
              isPushSubscribed
                ? "Unsubscribe from Push Notifications"
                : "Subscribe to Push Notifications"
            }
          >
            <BellIcon className="h-4 w-4" />
          </button>
          <span className="text-[10px] text-white tracking-wider uppercase mt-1">Enable Notifications</span>
        </div>

        {/* Logout Icon Only */}
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="p-2 bg-[#cb3a1e] hover:bg-[#a62b16] rounded-4xl mt-[-7px]"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</header>


        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-6">
              <div className="flex items-center justify-center lg:hidden">
                <div className="text-center space-y-3">
                  <h1 className="text-[#cb3a1e] text-3xl font-bold tracking-tighter">
                    {session.user.name || session.user.phone}
                  </h1>
                  <div className="flex items-center justify-center space-x-1 text-sm tracking-wider uppercase">
                    <MapPinIcon className="h-5 w-5 text-[#cb3a1e]" />
                    <span className="text-white text-[15px] font-semibold">
                      {userCity}
                    </span>
                  </div>
                </div>
              </div>


              <div className="mb-6 lg:mt-0">
                <SearchBar
                  searchQuery={searchQuery}
                  setSearchQuery={setSearchQuery}
                />
              </div>

             
            </div>

            <div className="lg:col-span-3">
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

                  {/* Progress Bar */}
                  <ProgressTimer
                    joinTime={activeBooking.join_time}
                    estimatedStartTime={activeBooking.estimated_start}
                  />
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
              {filteredShops.length === 0 && !isFetchingShops ? (
                <div className="text-center py-12">
                  <p className="text-WHITE text-sm tracking-wider uppercase">
                    No barbershops found matching your search.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {filteredShops.map((shop) => (
                    <div
                      key={shop.shop_id}
                      className="bg-white rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1 tracking-wider uppercase text-sm"
                    >
                      <div className="p-6 pb-4">
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="text-xl font-bold text-gray-900 flex items-center">
                            <BuildingStorefrontIcon className=" h-6 w-6 mr-2 text-[#cb3a1e]" />
                            {shop.shop_name}
                          </h3>
                          <p className="flex items-center text-[12px]  font-medium text-white">
                            <span className="tracking-wider uppercase">
                              <span
                                className={
                                  shop.is_active
                                    ? "text-white p-1 px-4 rounded-xl bg-green-400"
                                    : "text-white p-1 rounded-xl px-4 bg-red-700"
                                }
                              >
                                {shop.is_active ? "Open" : "Closed"}
                              </span>
                            </span>
                          </p>
                        </div>

                        <div className="space-y-2 text-sm text-black mb-4">
                          <p className="flex items-center">
                            <MapPinIcon className="h-4 w-4 mr-2 text-[#cb3a1e]" />
                            {shop.location.address}
                          </p>

                          <p className="flex items-center">
                            <PhoneIcon className="h-4 w-4 mr-2 text-[#cb3a1e]" />
                            {shop.ph_number}
                          </p>
                          {shop.distance_from_you !== undefined &&
                            shop.distance_from_you !== Infinity && (
                              <p className="flex items-center font-semibold text-[#cb3a1e]">
                                <MapPinIcon className="h-4 w-4 mr-2" />
                                {shop.distance_from_you.toFixed(1)} km away
                              </p>
                            )}
                        </div>

                        <div className="mb-4">
                          <h4 className="font-medium text-gray-900 mb-2">
                            Services Offered:
                          </h4>
                          <div className="flex flex-wrap gap-2">
                            {[
                              ...new Set(
                                shop.barbers?.flatMap(
                                  (b) =>
                                    b.services?.map((s) => s.service_name) || []
                                )
                              ),
                            ]
                              .slice(0, 3)
                              .map((serviceName, index) => (
                                <span
                                  key={index}
                                  className="bg-blue-500 text-white px-2 py-1 rounded-xl text-xs font-medium"
                                >
                                  {serviceName}
                                </span>
                              ))}
                            {[
                              ...new Set(
                                shop.barbers?.flatMap(
                                  (b) =>
                                    b.services?.map((s) => s.service_name) || []
                                )
                              ),
                            ].length > 3 && (
                              <span className="text-xs text-gray-500">
                                +more
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="border-t border-gray-100 ">
                          <h4 className="font-medium text-gray-900 mb-3">
                            Top Stylists:
                          </h4>
                          {shop.barbers && shop.barbers.length > 0 ? (
                            <>
                              {" "}
                              {/* Added React Fragment here */}
                              <div className="space-y-3">
                                {shop.barbers.slice(0, 5).map((barber) => (
                                  <div
                                    key={barber.emp_id}
                                    className="bg-gray-50 p-3 rounded-lg"
                                  >
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center">
                                        <UserCircleIcon className="h-5 w-5 mr-2 text-gray-400 " />
                                        <span className="font-medium text-gray-900">
                                          {barber.emp_name}
                                        </span>
                                        <p className="flex items-center text-[12px]  font-medium text-white">
                                          {shop.is_active && (
                                            <span className="tracking-wider uppercase ml-2 text-[10px]">
                                              <span
                                                className={
                                                  barber.is_active
                                                    ? "text-white p-1 px-2 rounded-xl bg-green-400"
                                                    : "text-white p-1 rounded-xl px-4 bg-red-700"
                                                }
                                              >
                                                {barber.is_active
                                                  ? "Present"
                                                  : "Absent"}
                                              </span>
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                      <span
                                        className={`px-2 py-1 rounded-full text-[9px] font-medium ${getStatusBadgeColor(
                                          barber.queue_info.current_status
                                        )}`}
                                      >
                                        {barber.queue_info.current_status}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm text-gray-600">
                                      <div className="flex items-center">
                                        <UsersIcon className="h-4 w-4 mr-1 text-[#cb3a1e]" />
                                        <span>
                                          Queue:{" "}
                                          {
                                            barber.queue_info
                                              .total_people_in_queue
                                          }
                                        </span>
                                      </div>
                                      <div className="flex items-center">
                                        <ClockIcon className="h-4 w-4 mr-1 text-[#cb3a1e]" />
                                        <span>
                                          {
                                            barber.queue_info
                                              .estimated_wait_time
                                          }
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {shop.barbers.length > 5 && (
                                <p className="text-sm text-gray-500 text-center mt-3">
                                  {" "}
                                  {/* Moved outside map and added margin-top */}
                                  +{shop.barbers.length - 2} more stylists
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-gray-500 text-sm">
                              No stylists available
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="px-6 pb-6">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (shop.is_active) {
                              // Only allow click if shop is active
                              setSelectedShop(shop);
                              fetchShopDetails(shop.shop_id);
                            }
                          }}
                          className={`w-full font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center tracking-wider uppercase ${
                            shop.is_active
                              ? "bg-[#cb3a1e] text-white hover:bg-[#a62b16]"
                              : "bg-gray-400 text-gray-700 cursor-not-allowed"
                          }`}
                          disabled={!shop.is_active} // Disable button if shop is not active
                        >
                          {shop.is_active ? (
                            <>
                              <ClockIcon className="h-5 w-5 mr-2" />
                              View Live Queue
                            </>
                          ) : (
                            <>
                              <XCircleIcon className="h-5 w-5 mr-2" />{" "}
                              {/* Changed icon for closed shops */}
                              Closed
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {showShopDetailsModal && shopDetails && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fade-in tracking-wider uppercase text-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-scale-up">
              <div className="sticky top-0 bg-white border-b border-[#cb3a1e] p-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                  <BuildingStorefrontIcon className="h-7 w-7 mr-3 text-[#cb3a1e]" />
                  {shopDetails.shop_name}
                </h2>
                <button
                  onClick={() => {
                    setShowShopDetailsModal(false);
                    setSelectedShop(null);
                    setShopDetails(null);
                    setOpenBarberId(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {isFetchingShopDetails ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#cb3a1e] border-t-transparent mb-4"></div>
                  <p className="text-sm font-medium text-[#cb3a1e]">
                    Loading live queue data...
                  </p>
                </div>
              ) : (
                <div className="p-6">
                  <div className="mb-6 space-y-2 text-gray-600">
                    <p className="flex items-center">
                      <MapPinIcon className="h-5 w-5 mr-2 text-[#cb3a1e]" />
                      {shopDetails.location.address}
                    </p>
                    <p className="flex items-center">
                      <PhoneIcon className="h-5 w-5 mr-2 text-[#cb3a1e]" />
                      {shopDetails.ph_number}
                    </p>
                  </div>

                  <h3 className="text-xl font-bold text-gray-900 mb-4">
                    Our Stylists
                  </h3>
                  {shopDetails.barbers && shopDetails.barbers.length > 0 ? (
                    <div className="space-y-4">
                      {shopDetails.barbers.map((barber) => (
                        <div
                          key={barber.emp_id}
                          className="border border-[#cb3a1e] rounded-lg overflow-hidden shadow-sm"
                        >
                          <button
                            className="flex justify-between items-center w-full text-left p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                            onClick={() => {
                              if (barber.is_active) {
                                // Only allow opening if barber is active
                                setOpenBarberId(
                                  openBarberId === barber.emp_id
                                    ? null
                                    : barber.emp_id
                                );
                              }
                            }}
                            disabled={!barber.is_active} // Disable button if barber is not active
                          >
                            <div className="flex items-center space-x-3">
                              <UserCircleIcon className="h-6 w-6 text-gray-600" />
                              <h4 className="text-lg font-semibold text-gray-900">
                                {barber.emp_name}
                              </h4>
                              {barber.is_active ? ( // Only show status badge if barber is active
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[9px] tracking-wider uppercase font-medium ${getStatusBadgeColor(
                                    barber.queue_info.current_status
                                  )}`}
                                >
                                  {barber.queue_info.current_status}
                                </span>
                              ) : (
                                <span className="ml-2 px-2 py-0.5 tracking-wider uppercase rounded-full text-[9px] font-medium bg-red-700 text-white">
                                  Absent
                                </span>
                              )}
                            </div>
                            {barber.is_active ? ( // Show chevron icons only if barber is active
                              openBarberId === barber.emp_id ? (
                                <ChevronUpIcon className="h-5 w-5 text-gray-600" />
                              ) : (
                                <ChevronDownIcon className="h-5 w-5 text-gray-600" />
                              )
                            ) : (
                              // Optionally show a different icon or nothing if barber is absent
                              <XCircleIcon className="h-5 w-5 text-gray-400" />
                            )}
                          </button>

                          {openBarberId === barber.emp_id &&
                            barber.is_active && ( // Only show details if barber is active AND expanded
                              <div className="p-4 bg-white border-t border-gray-200 animate-fade-in-down">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-2 gap-x-4 mb-4 text-gray-700 text-sm">
                                  <p className="flex items-center font-medium">
                                    <UsersIcon className="h-4 w-4 mr-2" />
                                    Queue:{" "}
                                    <span className="font-bold ml-1">
                                      {
                                        barber.queue_info
                                          .total_people_in_queue
                                      }
                                    </span>
                                  </p>
                                  {barber.queue_info.your_queue_position !==
                                    undefined &&
                                    barber.queue_info.your_queue_position !==
                                      null && (
                                      <p className="flex items-center font-medium">
                                        <HourglassIcon className="h-4 w-4 mr-2" />
                                        Your Position:{" "}
                                        <span className="font-bold ml-1">
                                          {
                                            barber.queue_info
                                              .your_queue_position
                                          }
                                        </span>
                                      </p>
                                    )}
                                  <p className="flex items-center font-medium">
                                    <ClockIcon className="h-4 w-4 mr-2" />
                                    Estimated Wait:{" "}
                                    <span className="font-bold ml-1">
                                      {barber.queue_info.estimated_wait_time}
                                    </span>
                                  </p>
                                </div>

                                <h5 className="font-semibold text-gray-900 mt-6 mb-3 text-base">
                                  Services by {barber.emp_name}:
                                </h5>
                                {barber.services &&
                                barber.services.length > 0 ? (
                                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {barber.services.map((service) => (
                                      <li
                                        key={service.service_id}
                                        className="flex items-center text-sm bg-gray-100 p-3 rounded-md"
                                      >
                                        <ScissorsIcon className="h-4 w-4 mr-2 text-gray-500" />
                                        <span className="font-medium text-gray-800">
                                          {service.service_name}
                                        </span>
                                        <span className="ml-auto flex items-center text-gray-700">
                                          {service.service_duration_minutes}{" "}
                                          mins
                                          {service.price && (
                                            <>
                                              <CurrencyRupeeIcon className="h-4 w-4 ml-2 mr-0.5" />
                                              {service.price}
                                            </>
                                          )}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-gray-500 text-sm">
                                    No services listed for this barber.
                                  </p>
                                )}

                                <div className="mt-8 text-center">
                                  <button
                                    className={`px-6 py-3 rounded-lg font-bold transition-colors flex items-center justify-center mx-auto shadow-md tracking-wider uppercase text-sm
                                                        ${
                                                          activeBooking
                                                            ? "bg-red-600 hover:bg-red-700 text-white"
                                                            : "bg-green-600 hover:bg-green-700 text-white"
                                                        }`}
                                    onClick={() => handleJoinQueueClick(barber)}
                                    disabled={activeBooking !== null}
                                  >
                                    {activeBooking ? (
                                      <Scissors className="h-6 w-6 mr-2" />
                                    ) : (
                                      <WifiIcon className="h-6 w-6 mr-2" />
                                    )}
                                    {activeBooking
                                      ? "Already Booked"
                                      : "Join Queue Now"}
                                  </button>

                                  {activeBooking && (
                                    <p className="text-[12px] text-red-600 mt-2">
                                      You have an active booking. Please
                                      complete it before booking another.
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-700 text-sm text-center mt-5">
                      No barbers found for this shop...
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
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
