'use client';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

import dayjs from 'dayjs'; // For date formatting
import {
    UsersIcon,
    ClockIcon,
    BellIcon,
    CheckCircleIcon,
    XCircleIcon,
    ScissorsIcon,
    UserGroupIcon,
    CurrencyRupeeIcon,
    MapPinIcon,
    ChartBarIcon,
    UserPlusIcon,
    ClipboardListIcon,
    CalendarIcon,
    MagnifyingGlassIcon as SearchIcon, // Renamed for Heroicons v2
    ArrowLongDownIcon as ArrowSmDownIcon, // Renamed for Heroicons v2
    ArrowLongUpIcon as ArrowSmUpIcon,   // Renamed for Heroicons v2
    ChevronLeftIcon,
    ChevronRightIcon,
    ArrowPathIcon as RefreshIcon, // Renamed for Heroicons v2
    FunnelIcon as FilterIcon, // Renamed for Heroicons v2
    PhoneIcon,
    TagIcon,
    PlusCircleIcon // Added for the new booking button
} from '@heroicons/react/24/solid'; // Updated import path for Heroicons v2 solid icons
import { LogOut, Scissors,
    ClipboardList,
    HourglassIcon,
    AlarmClockIcon,
    CheckCircle2Icon,
    LoaderIcon } from "lucide-react";

const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app';
import Image from 'next/image';

import RegisterStylistModal from './RegisterStylistModal';
import AddServiceModal from './AddServiceModal';
import ShopEmployeesTable from './ShopEmplyoeesTable';
import ShopStatusToggle from './ShopStatusToggle';
import CancelBookingModal from './CancelBookingModal';
import AddWalkinBookingModal from './AddWalkinBookingModal'; // Import the new modal


export default function ShopDashboard() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [bookingsData, setBookingsData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterDate, setFilterDate] = useState(''); // YYYY-MM-DD
    const [sortField, setSortField] = useState('join_time');
    const [sortOrder, setSortOrder] = useState('DESC');
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [selectedBooking, setSelectedBooking] = useState(null);
    const [itemsPerPage, setItemsPerPage] = useState(5); // Default to 5 rows

    const [showRegisterStylistModal, setShowRegisterStylistModal] = useState(false);
    const [showAddServiceModal, setShowAddServiceModal] = useState(false);
    const [showAddWalkinBookingModal, setShowAddWalkinBookingModal] = useState(false); // New state for walk-in modal

    const [allBookings, setAllBookings] = useState(null); // New state for all bookings
    // Initialize shopIsActive with null, and fetch it from the API
    const [shopIsActive, setShopIsActive] = useState(null);
    const [loadingShopStatus, setLoadingShopStatus] = useState(true);

    const [isShopPushSubscribed, setIsShopPushSubscribed] = useState(false);
    const [shopSwRegistration, setShopSwRegistration] = useState(null);

    // Derive shopId consistently from session.user.shop_id
    const shopId = session?.user?.shop_id;
    console.log("Shop id", shopId); // This will now correctly log the shopId

    // Function to convert VAPID public key from Base64 to Uint8Array
    // (Ensure this function and VAPID_PUBLIC_KEY are defined once at a higher scope or imported)
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

    // Function to register the service worker for shops
    const registerShopServiceWorker = useCallback(async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push messaging is not supported in this browser.');
        return null;
      }

      try {
        const registration = await navigator.serviceWorker.register('/service-worker.js'); // Use the same service worker path
        console.log('Shop Service Worker registered successfully:', registration);
        setShopSwRegistration(registration); // Store registration for later use
        return registration;
      } catch (error) {
        console.error('Shop Service Worker registration failed:', error);
        return null;
      }
    }, []); // No dependencies needed for this function itself

    // Function to check shop's push subscription status with the backend
    const checkShopSubscriptionStatus = useCallback(async () => {
      // Use the consistently derived shopId here
      if (!shopId) {
        console.log('No shopId available to check subscription status.');
        return;
      }

      try {
        const response = await fetch(`${API_BASE_URL}/shops/${shopId}/subscription-status`);
        if (response.ok) {
          const data = await response.json();
          setIsShopPushSubscribed(data.isSubscribed);
        } else {
          console.error('Failed to check shop subscription status:', response.statusText);
        }
      } catch (error) {
        console.error('Error checking shop subscription status:', error);
      }
    }, [shopId]); // Dependency changed to shopId

    // Function to subscribe the shop to push notifications
    const subscribeShop = useCallback(async () => {
      // Use the consistently derived shopId here
      if (!shopSwRegistration || !shopId || !VAPID_PUBLIC_KEY) {
        console.warn('Cannot subscribe shop: Service Worker not registered, Shop not logged in, or VAPID Public Key missing.');
        return;
      }

      if (isShopPushSubscribed) {
        alert('This shop is already subscribed to push notifications!');
        return;
      }

      try {
        const pushSubscription = await shopSwRegistration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        console.log('Shop Push Subscription:', pushSubscription);

        // Send subscription to your backend's shop endpoint
        const response = await fetch(`${API_BASE_URL}/shop/subscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            shopId: shopId, // Use the consistently derived shopId
            subscription: pushSubscription,
          }),
        });

        if (response.ok) {
          alert('Successfully subscribed shop to push notifications!');
          setIsShopPushSubscribed(true);
        } else {
          const errorData = await response.json();
          alert(`Failed to subscribe shop: ${errorData.error || response.statusText}`);
          // Optionally, unsubscribe from browser if backend failed to store
          await pushSubscription.unsubscribe();
        }
      } catch (error) {
        console.error('Error subscribing shop to push:', error);
        alert('An error occurred during shop subscription. Please try again.');
      }
    }, [shopSwRegistration, shopId, isShopPushSubscribed]); // Dependency changed to shopId

    // Function to unsubscribe the shop from push notifications
    const unsubscribeShop = useCallback(async () => {
      // Use the consistently derived shopId here
      if (!shopSwRegistration || !shopId) {
        console.warn('Cannot unsubscribe shop: Service Worker not registered or Shop not logged in.');
        return;
      }

      if (!isShopPushSubscribed) {
        alert('This shop is not subscribed to push notifications.');
        return;
      }

      try {
        const subscription = await shopSwRegistration.pushManager.getSubscription();
        if (subscription) {
          await subscription.unsubscribe();
          console.log('Shop browser subscription removed.');
        }

        // Tell your backend to remove the shop's subscription
        const response = await fetch(`${API_BASE_URL}/shop/unsubscribe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ shopId: shopId }), // Use the consistently derived shopId
        });

        if (response.ok) {
          alert('Successfully unsubscribed shop from push notifications.');
          setIsShopPushSubscribed(false);
        } else {
          const errorData = await response.json();
          alert(`Failed to unsubscribe shop from backend: ${errorData.error || response.statusText}`);
          // Optionally, re-subscribe in browser if backend failed to remove
        }
      } catch (error) {
        console.error('Error unsubscribing shop:', error);
        alert('An error occurred during shop unsubscription. Please try again.');
      }
    }, [shopSwRegistration, shopId, isShopPushSubscribed]); // Dependency changed to shopId

    // Initial setup for shop service worker and subscription status
    useEffect(() => {
      registerShopServiceWorker(); // Register SW on component mount for shops
      // Only check subscription status if shopId is available
      if (shopId) {
        checkShopSubscriptionStatus(); 
      }
    }, [shopId, registerShopServiceWorker, checkShopSubscriptionStatus]); // Dependency changed to shopId
        // Use a separate useEffect to fetch the shop's active status from the new API route
        useEffect(() => {
            const fetchShopStatus = async () => {
                if (!shopId) {
                    setLoadingShopStatus(false);
                    return;
                }
                try {
                    setLoadingShopStatus(true);
                    const response = await axios.get(`${API_BASE_URL}/myshop/${shopId}`);
                    setShopIsActive(response.data.shop.isActive);
                } catch (err) {
                    console.error('Error fetching shop active status:', err);
                    // Set to false or a default if there's an error fetching
                    setShopIsActive(false); 
                } finally {
                    setLoadingShopStatus(false);
                }
            };

            if (status === 'authenticated' && session?.user?.role === 'shop' && shopId) {
                fetchShopStatus();
            }
        }, [status, session, shopId]);


    const fetchBookings = useCallback(async () => {
        if (!shopId) return;

        setError(null);
        try {
            // Fetch filtered bookings for the main table
            const filteredResponse = await axios.post(`${API_BASE_URL}/getAllBookings`, {
                shop_id: shopId,
                status: filterStatus === 'all' ? undefined : filterStatus,
                date: filterDate || undefined,
                limit: itemsPerPage,
                offset: (currentPage - 1) * itemsPerPage,
                sort_by: sortField,
                sort_order: sortOrder,
            });
            setBookingsData(filteredResponse.data);

            // Always fetch unfiltered bookings for live queue (only booked and in_service)
            const queueResponse = await axios.post(`${API_BASE_URL}/getAllBookings`, {
                shop_id: shopId,
                status: undefined, // No status filter to get all bookings
                date: '', // No date filter for live queue
                limit: 1000, // Large limit to get all active bookings
                offset: 0,
                sort_by: 'join_time',
                sort_order: 'ASC', // Oldest first for queue order
            });
            setAllBookings(queueResponse.data);

        } catch (err) {
            console.error('Error fetching bookings:', err);
            setError(`Failed to fetch bookings. Ensure the backend is running and reachable. Details: ${err.message || 'Unknown error'}`);
        } finally {
            setLoading(false);
        }
    }, [shopId, currentPage, filterStatus, filterDate, sortField, sortOrder, itemsPerPage]);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/');
        } else if (status === 'authenticated' && session?.user?.role !== 'shop') {
            signOut({ callbackUrl: '/' });
        } else if (status === 'authenticated' && session?.user?.role === 'shop' && shopId) {
            fetchBookings(); // Initial fetch

            // Set up polling
            const pollingInterval = setInterval(() => {
                fetchBookings();
            }, 5000); // Poll every 5 seconds

            // Clean up interval on component unmount or dependencies change
            return () => clearInterval(pollingInterval);
        }
    }, [session, status, router, shopId, fetchBookings]);


    const getStatusBadgeClass = (status) => {
        switch (status) {
            case 'booked':
                return 'bg-blue-100 text-blue-800';
            case 'in_service':
                return 'bg-yellow-100 text-yellow-800';
            case 'completed':
                return 'bg-green-100 text-green-800';
            case 'cancelled':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const handleViewDetails = (booking) => {
        setSelectedBooking(booking);
        setShowDetailsModal(true);
    };

    const handleFilterChange = (e) => {
        setFilterStatus(e.target.value);
        setCurrentPage(1);
    };

    const handleDateFilterChange = (e) => {
        setFilterDate(e.target.value);
        setCurrentPage(1);
    };

    const handleSort = (field) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
        } else {
            setSortField(field);
            setSortOrder('ASC');
        }
        setCurrentPage(1);
    };

    const handleItemsPerPageChange = (e) => {
        setItemsPerPage(parseInt(e.target.value));
        setCurrentPage(1);
    };

    const handlePageChange = (pageNumber) => {
        setCurrentPage(pageNumber);
    };

    const resetFilters = () => {
        setFilterStatus('all');
        setFilterDate('');
        setSortField('join_time');
        setSortOrder('DESC');
        setCurrentPage(1);
        setItemsPerPage(5);
    };
if (status === 'loading' || loading) {
  return (
    <div className="min-h-screen flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#f6c76d] to-[#cb3a1e] font-sans relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        {/* Using a placeholder for the background pattern if '/trimtadka-bg-pattern.png' is not available */}
        {/* Replace with your actual background image or remove if not needed */}
        <div
          className="absolute top-0 left-0 w-full h-full bg-cover bg-center opacity-10"
          style={{ backgroundImage: 'url("/placeholder-bg-pattern.png")' }} // Consider adding a subtle pattern if available
        ></div>
        <ScissorsIcon className="absolute top-1/4 left-1/4 h-32 w-32 text-white opacity-5 animate-float-slow transform -translate-x-1/2 -translate-y-1/2" />
        <ScissorsIcon className="absolute bottom-1/4 right-1/4 h-28 w-28 text-white opacity-5 animate-float-slow-alt transform translate-x-1/2 -translate-y-1/2" />
      </div>
      <div className="flex flex-col items-center justify-center relative z-10 p-8 rounded-xl"> {/* Added flex utilities here */}
        {/* Replace with your actual logo path */}
        <Image
          src="/trimtadka.png" // Ensure this path is correct for your logo
          alt="Shop Logo"
          width={200}
          height={100}
          className="mx-auto  animate-fade-in-up"
        />
        <div className="mt-4 text-white text-[13px] uppercase tracking-wider animate-pulse">
          Loading shop ...
        </div>
      </div>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800&display=swap');
        body {
          font-family: 'Inter', sans-serif;
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

  if (status === 'authenticated' && session?.user?.role === 'shop') {
    // Destructure bookings and summary from bookingsData.
    // Ensure `pagination` is destructured as `serverPagination` or similar if the backend provides it separately.
    const { bookings, summary, pagination: serverPagination } = bookingsData || {};

    // Use total_records and total_pages from the server's pagination response
    const totalItems = serverPagination?.total_records || 0;
    const totalPages = serverPagination?.total_pages || 1; // Default to 1 to avoid division by zero if no data
    
    // The `currentBookings` will directly be `bookings` from the server as pagination is handled there.
    const currentBookings = bookings || [];

    const pagination = {
      total_records: totalItems,
      total_pages: totalPages,
      current_page: currentPage,
      records_per_page: itemsPerPage,
      has_prev_page: currentPage > 1,
      has_next_page: currentPage < totalPages
    };

    const totalBookings = summary?.total_bookings || 0;
    const completedBookings = summary?.status_breakdown?.completed || 0;
    const cancelledBookings = summary?.status_breakdown?.cancelled || 0;

    const stylistCounts = bookings?.reduce((acc, booking) => {
      acc[booking.emp_name] = (acc[booking.emp_name] || 0) + 1;
      return acc;
    }, {});

    const customerCounts = bookings?.reduce((acc, booking) => {
      acc[booking.customer_name] = (acc[booking.customer_name] || 0) + 1;
      return acc;
    }, {});

    const mostActiveStylist = stylistCounts ? Object.keys(stylistCounts).reduce((a, b) => (stylistCounts[a] > stylistCounts[b] ? a : b), null) : 'N/A';
    const topCustomer = customerCounts ? Object.keys(customerCounts).reduce((a, b) => (customerCounts[a] > customerCounts[b] ? a : b), null) : 'N/A';

    // Calculate estimated queue time
const originalBookings = bookings; // Use whatever variable holds your original data

// Live Queue Data - always use original unfiltered data
const currentQueueBookings = allBookings?.bookings?.filter(b => b.status === 'booked' || b.status === 'in_service') || [];

let totalQueueMinutes = 0;

currentQueueBookings.forEach(b => {
  if (b.status === 'in_service' && b.time_remaining) {
    const mins = parseInt(b.time_remaining);
    if (!isNaN(mins)) totalQueueMinutes += mins;
  } else if (b.status === 'booked' && b.time_until_service) {
    const mins = parseInt(b.time_until_service);
    if (!isNaN(mins)) totalQueueMinutes += mins;
  }
});

let estimatedQueueTime;
if (totalQueueMinutes > 0) {
  const hours = Math.floor(totalQueueMinutes / 60);
  const minutes = totalQueueMinutes % 60;
  const timeParts = [];
  if (hours > 0) timeParts.push(`${hours} hr`);
  if (minutes > 0 || hours === 0) timeParts.push(`${minutes} mins`);
  estimatedQueueTime = timeParts.join(' ');
} else {
  estimatedQueueTime = '0 mins';
}
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#f6c76d] to-[#cb3a1e] font-inter">
        <style jsx global>{`
          @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&display=swap');
          body { font-family: 'Inter', sans-serif; }
          .animate-fade-in {
            animation: fadeIn 0.3s ease-out forwards;
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .animate-scale-up {
            animation: scaleUp 0.3s ease-out forwards;
          }
          @keyframes scaleUp {
            from { transform: scale(0.95); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
          .animate-fade-in-down {
            animation: fadeInDown 0.3s ease-out forwards;
          }
          @keyframes fadeInDown {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>

      <header className="header-blur shadow-lg border-b border-white/20 sticky top-0 z-40">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-[5px]">
    <div className="flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <Image
          src="/trimtadka.png"
          alt="TrimTadka logo"
          width={70}
          height={48}
        />
      </div>

      <div className="flex items-center space-x-3 sm:space-x-4">
        {/* User Info */}
        <div className="hidden sm:flex items-center space-x-4">
          <div className="text-right">
            <h2
              className="text-[15px] font-bold text-[#cb3a1e] tracking-wide uppercase whitespace-nowrap"
              style={{ fontFamily: "Poppins" }}
            >
              {session.user.name || session.user.phone}
            </h2>
          </div>
        </div>

        {/* Notification Bell */}
        {shopId && (
          <div className="flex flex-col items-center space-y-1 mt-3">
            <button
              onClick={isShopPushSubscribed ? unsubscribeShop : subscribeShop}
              className={`p-2 rounded-full transition-colors duration-200 ${
                isShopPushSubscribed
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              title={
                isShopPushSubscribed
                  ? "Unsubscribe from Push Notifications"
                  : "Subscribe to Push Notifications"
              }
            >
              <BellIcon className="h-4 w-4" />
            </button>
            <span className="text-[10px] text-white tracking-wider uppercase">Enable Notifications</span>
          </div>
        )}

        {/* Logout Icon */}
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="p-2 bg-[#cb3a1e] rounded-4xl hover:bg-[#a62b16] transition-colors duration-200 mt-[-7px]"
          title="Logout"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  </div>
</header>



        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md relative mb-6" role="alert">
            <strong className="font-bold">Error:</strong>
            <span className="block sm:inline ml-2">{error}</span>
            <button onClick={fetchBookings} className="ml-4 px-3 py-1 bg-red-200 text-red-800 rounded-md hover:bg-red-300">
              <RefreshIcon className="h-4 w-4 inline mr-1" />Retry
            </button>
          </div>
        )}

        <div className="flex items-center justify-center w-full gap-4 p-12 pb-2 ">
          <div className="flex-grow border-t border-white"></div>
          <h2
            className="text-2xl font-bold text-[#cb3a1e] tracking-wide uppercase whitespace-nowrap"
            style={{ fontFamily: "Poppins" }}
          >
            {session.user.name || session.user.phone} 
          </h2>
          <div className="flex-grow border-t border-white"></div>
        </div>
 

 {/* Shop Status Toggle */}
        <div className="flex justify-center mb-6 px-4 sm:px-6 lg:px-8">
            {shopId && (
                <ShopStatusToggle
                    shopId={shopId}
                    initialIsActive={shopIsActive}
                    onStatusChange={setShopIsActive} // Update local state when status changes
                />
            )}
        </div>

            
        {/* 1. Register Barber, Add Services, Add Walk-in Booking Buttons */}
       <div className="grid grid-cols-2 gap-4 w-full mb-6 p-4">
  {/* First Row: 2 buttons */}
  <button 
    onClick={() => setShowRegisterStylistModal(true)}
    className="bg-[#cb3a1e] text-white p-2 rounded-lg tracking-wider uppercase text-[14px] hover:bg-[#b8341a] transition-colors duration-300 flex items-center justify-center space-x-2"
  >
    <UserPlusIcon className="h-5 w-5" />
    <span>Register Stylist</span>
  </button>

  <button 
    onClick={() => setShowAddServiceModal(true)}
    className="bg-[#cb3a1e] text-white p-2 rounded-lg tracking-wider uppercase text-[14px] hover:bg-[#b8341a] transition-colors duration-300 flex items-center justify-center space-x-2"
  >
    <TagIcon className="h-5 w-5" />
    <span>Add Service</span>
  </button>

  {/* Second Row: Walk-in button, spans both columns */}
  <button 
    onClick={() => setShowAddWalkinBookingModal(true)}
    className="col-span-2 bg-[#cb3a1e] text-white p-2 rounded-lg tracking-wider uppercase text-[14px] hover:bg-[#b8341a] transition-colors duration-300 flex items-center justify-center space-x-2"
  >
    <PlusCircleIcon className="h-5 w-5" />
    <span>Walk-in Booking</span>
  </button>
</div>

       

        {/* Modals */}
        <RegisterStylistModal
            shopId={shopId}
            isOpen={showRegisterStylistModal}
            onClose={() => setShowRegisterStylistModal(false)}
            onStylistRegistered={fetchBookings} // Refresh bookings or relevant data after registration
        />

        <AddServiceModal
            isOpen={showAddServiceModal}
            onClose={() => setShowAddServiceModal(false)}
            onServiceAdded={() => {
                // You might want to refresh services list in RegisterStylistModal if it's open
                // Or just show a success message. For now, no direct refresh needed on dashboard.
            }}
        />

        {/* New Walk-in Booking Modal */}
        <AddWalkinBookingModal
            shopId={shopId}
            isOpen={showAddWalkinBookingModal}
            onClose={() => setShowAddWalkinBookingModal(false)}
            onBookingSuccess={fetchBookings} // Refresh bookings after a successful walk-in booking
        />

        {/* 2. Analytics Summary Cards */}
   <section className="mb-10 p-6 sm:p-6 lg:p-8 mt-[-40px]">
  <h2 className="text-lg font-extrabold text-white mb-6 flex   sm:justify-start uppercase tracking-wider">
    <ChartBarIcon className="h-6 w-6 mr-2 text-[#cb3a1e] animate-pulse" />
    Analytics 
  </h2>
  <div className="flex-grow border-t mb-4 mt-[-20px] border-white"></div>
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
    {/* Total Bookings */}
    <div className="bg-white p-4 sm:p-6 rounded-xl shadow-lg flex items-center space-x-3 sm:space-x-4 border border-blue-100 hover:shadow-xl transition-shadow duration-300 ease-in-out transform hover:-translate-y-1">
      <UsersIcon className="h-8 w-8 sm:h-10 sm:w-10 text-[#cb3a1e]  flex-shrink-0" />
      <div>
        <p className="text-gray-600 text-xs sm:text-sm font-medium uppercase tracking-wider">Total Bookings</p>
        <p className="text-2xl sm:text-4xl font-semibold text-[#cb3a1e] mt-1">{totalBookings}</p>
      </div>
    </div>

    {/* Completed Bookings */}
    <div className="bg-white p-4 sm:p-6 rounded-xl shadow-lg flex items-center space-x-3 sm:space-x-4 border border-green-100 hover:shadow-xl transition-shadow duration-300 ease-in-out transform hover:-translate-y-1">
      <CheckCircleIcon className="h-8 w-8 sm:h-10 sm:w-10 text-[#cb3a1e] flex-shrink-0" />
      <div>
        <p className="text-gray-600 text-xs sm:text-sm font-medium uppercase tracking-wider">Completed Bookings</p>
        <p className="text-2xl sm:text-4xl font-semibold text-[#cb3a1e] mt-1">{completedBookings}</p>
      </div>
    </div>

    {/* Cancelled Bookings */}
    <div className="bg-white p-4 sm:p-6 rounded-xl shadow-lg flex items-center space-x-3 sm:space-x-4 border border-red-100 hover:shadow-xl transition-shadow duration-300 ease-in-out transform hover:-translate-y-1">
      <XCircleIcon className="h-8 w-8 sm:h-10 sm:w-10 text-[#cb3a1e] flex-shrink-0" />
      <div>
        <p className="text-gray-600 text-xs sm:text-sm font-medium uppercase tracking-wider">Cancelled Bookings</p>
        <p className="text-2xl sm:text-4xl font-semibold text-[#cb3a1e] mt-1">{cancelledBookings}</p>
      </div>
    </div>

    {/* Estimated Queue Time */}
    <div className="bg-white p-4 sm:p-6 rounded-xl shadow-lg flex items-center space-x-3 sm:space-x-4 border border-indigo-100 hover:shadow-xl transition-shadow duration-300 ease-in-out transform hover:-translate-y-1">
      <ClockIcon className="h-8 w-8 sm:h-10 sm:w-10 text-[#cb3a1e] flex-shrink-0" />
      <div>
        <p className="text-gray-600 text-xs sm:text-sm font-medium uppercase tracking-wider">Estimated Queue Time</p>
        <p className="text-sm font-medium uppercase tracking-wider text-[#cb3a1e] mt-1">{estimatedQueueTime}</p>
      </div>
    </div>

    {/* Most Active Stylist */}
    <div className="bg-white p-4 sm:p-6 rounded-xl shadow-lg flex items-center space-x-3 sm:space-x-4 border border-orange-100 hover:shadow-xl transition-shadow duration-300 ease-in-out transform hover:-translate-y-1 col-span-1 sm:col-span-2 lg:col-span-1">
      <ScissorsIcon className="h-8 w-8 sm:h-10 sm:w-10 text-[#cb3a1e] flex-shrink-0" />
      <div>
        <p className="text-gray-600 text-xs sm:text-sm font-medium uppercase tracking-wider">Most Active Stylist</p>
        <p className=" text-sm font-medium uppercase tracking-wider text-[#cb3a1e] mt-1">{mostActiveStylist}</p>
      </div>
    </div>

    {/* Top Customer */}
    <div className="bg-white p-4 sm:p-6 rounded-xl shadow-lg flex items-center space-x-3 sm:space-x-4 border border-pink-100 hover:shadow-xl transition-shadow duration-300 ease-in-out transform hover:-translate-y-1 col-span-1 sm:col-span-2 lg:col-span-1">
      <UserGroupIcon className="h-8 w-8 sm:h-10 sm:w-10 text-[#cb3a1e] flex-shrink-0" />
      <div>
        <p className="text-gray-600 text-xs sm:text-sm font-medium uppercase tracking-wider">Top Customer</p>
        <p className="text-sm font-medium uppercase tracking-wider text-[#cb3a1e] mt-1">{topCustomer}</p>
      </div>
    </div>
  </div>
</section>

        {/* --- */}
    <section className="mb-10 p-4 sm:p-6 lg:p-8 mt-[-40px]">
  <h2 className="text-lg font-extrabold text-white mb-6 flex items-center justify-start uppercase tracking-wider">
    <HourglassIcon className="h-6 w-6 mr-2 text-[#cb3a1e] animate-pulse" />
    Live Queue Data
  </h2>

  <div className="flex-grow border-t mb-4 mt-[-20px] border-white"></div>

 {currentQueueBookings && currentQueueBookings.length > 0 ? (
  <div className="bg-white p-4 rounded-lg shadow-md overflow-x-auto custom-scroll">
    <ul className="min-w-[700px] w-full divide-y divide-gray-200">
      
      {/* Header */}
      <li className="flex items-center py-3 border-b border-[#cb3a1e] font-medium uppercase tracking-wider text-xs sm:text-sm text-[#cb3a1e]">
        <span className="w-[8%] text-center">Pos.</span>
        <span className="w-[24%] text-left pl-2">Customer</span>
        <span className="w-[24%] text-left">Stylist</span>
        <span className="w-[24%] text-right pr-2">Time</span>
        <span className="w-[20%] text-right pr-2">Actions</span>
      </li>

      {/* Rows */}
      {currentQueueBookings.map((booking, index) => (
        <li key={booking.booking_id} className="flex items-center py-4 text-xs sm:text-sm font-medium text-[#cb3a1e]">
          
          {/* Position */}
          <span className="w-[8%] text-center uppercase tracking-wider">{index + 1}</span>

          {/* Customer */}
          <span className="w-[24%] text-left pl-2">
            <span className="block truncate normal-case">{booking.customer_name}</span>
            <span className="flex items-center text-xs text-gray-500 truncate normal-case whitespace-nowrap">
              <PhoneIcon className="h-3 w-3 text-green-600 mr-1 shrink-0" />
              {booking.customer_ph_number}
            </span>
          </span>

          {/* Stylist */}
          <span className="w-[24%] truncate text-left normal-case">{booking.emp_name}</span>

          {/* Time */}
          <span className="w-[24%] text-right pr-2">
            <span className="flex items-center justify-end gap-1 whitespace-nowrap text-[#cb3a1e] font-medium overflow-hidden text-ellipsis normal-case">
              {booking.status === 'booked' && (
                <>
                  <ClockIcon className="h-4 w-4 text-black shrink-0" />
                  <span className="truncate">{booking.time_until_service} ({booking.estimated_start})</span>
                </>
              )}
              {booking.status === 'in_service' && (
                <>
                  <HourglassIcon className="h-4 w-4 text-black shrink-0" />
                  <span className="truncate">{booking.time_remaining} ({booking.estimated_completion})</span>
                </>
              )}
            </span>
          </span>

          {/* Actions */}
          <span className="w-[20%] text-right pr-2">
            <CancelBookingModal
              bookingId={booking.booking_id}
              shopId={shopId}
              onCancellationSuccess={() => fetchBookings()}
            />
          </span>
        </li>
      ))}
    </ul>
  </div>
) : (
  <p className="text-white text-[12px] uppercase tracking-wider text-center py-4 rounded-lg">
    No active bookings in the queue...
  </p>
)}

</section>




        {/* --- */}
        {/* 3. Booking Table/List */}
   <section className="p-4 sm:p-6 lg:p-8 mt-[-40px]">
            <h2 className="text-lg font-extrabold text-white mb-6 flex items-center justify-start uppercase tracking-wider">
              <ClipboardList className="h-6 w-6 mr-2 text-[#cb3a1e] animate-pulse" />
              All Bookings
            </h2>

            <div className="flex-grow border-t mb-4 mt-[-20px] border-white"></div>

            {/* Filter Controls */}
            <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 mb-6">
              <div className="flex-1">
                <label htmlFor="filterStatus" className="sr-only">Filter by Status</label>
                <div className="relative">
                  <FilterIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#cb3a1e]" />
                  <select
                    id="filterStatus"
                    value={filterStatus}
                    onChange={handleFilterChange}
                    className="block w-full pl-10 pr-3 py-2 text-[12px] rounded-2xl focus:outline-none focus:ring-[#cb3a1e] focus:border-[#cb3a1e] sm:text-sm bg-white text-[#cb3a1e] font-medium uppercase tracking-wider"
                  >
                    <option value="all" className="text-[#cb3a1e] font-medium uppercase tracking-wider">All Statuses</option>
                    <option value="booked" className="text-[#cb3a1e] font-medium uppercase tracking-wider">Booked</option>
                    <option value="in_service" className="text-[#cb3a1e] font-medium uppercase tracking-wider">In Service</option>
                    <option value="completed" className="text-[#cb3a1e] font-medium uppercase tracking-wider">Completed</option>
                    <option value="cancelled" className="text-[#cb3a1e] font-medium uppercase tracking-wider">Cancelled</option>
                  </select>
                </div>
              </div>
{/*               <div className="flex-1">
                <label htmlFor="filterDate" className="sr-only">Filter by Date</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[#cb3a1e]" />
                  <input
                    type="date"
                    id="filterDate"
                    value={filterDate}
                    onChange={handleDateFilterChange}
                    className="block w-full pl-10 pr-3 py-2 text-[12px] rounded-2xl focus:outline-none focus:ring-[#cb3a1e] focus:border-[#cb3a1e] sm:text-sm bg-white text-[#cb3a1e] font-medium uppercase tracking-wider"
                  />
                </div>
              </div> */}
              <div className="flex-1">
                <label htmlFor="itemsPerPage" className="sr-only">Items per Page</label>
                <div className="relative">
                  <select
                    id="itemsPerPage"
                    value={itemsPerPage}
                    onChange={handleItemsPerPageChange}
                    className="block w-full pl-10 pr-3 py-2 text-[12px] rounded-2xl focus:outline-none focus:ring-[#cb3a1e] focus:border-[#cb3a1e] sm:text-sm bg-white text-[#cb3a1e] font-medium uppercase tracking-wider"
                  >
                    <option value={5} className="text-[#cb3a1e] font-medium uppercase tracking-wider">5 per Page</option>
                    <option value={10} className="text-[#cb3a1e] font-medium uppercase tracking-wider">10 per Page</option>
                    <option value={25} className="text-[#cb3a1e] font-medium uppercase tracking-wider">25 per Page</option>
                    <option value={50} className="text-[#cb3a1e] font-medium uppercase tracking-wider">50 per Page</option>
                  </select>
                </div>
              </div>
              <button
                onClick={resetFilters} // Use the dedicated resetFilters function
                className="px-4 py-2 bg-[#cb3a1e] text-white rounded-4xl hover:bg-[#b8341a] transition-colors duration-300 flex items-center justify-center sm:justify-start font-medium text-[12px] uppercase tracking-wider"
              >
                <RefreshIcon className="h-5 w-5 mr-2" />
                Reset Filters
              </button>
            </div>

            {bookings && bookings.length > 0 ? (
              <div className="bg-white p-4 rounded-lg shadow-md overflow-x-auto custom-scroll">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-[#cb3a1e] uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200"
                        onClick={() => handleSort('booking_id')}
                      >
                        <div className="flex items-center">
                          ID
                          {sortField === 'booking_id' && (sortOrder === 'ASC' ? <ArrowSmUpIcon className="ml-1 h-4 w-4 text-[#cb3a1e]" /> : <ArrowSmDownIcon className="ml-1 h-4 w-4 text-[#cb3a1e]" />)}
                        </div>
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-[#cb3a1e] uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200"
                        onClick={() => handleSort('customer_name')}
                      >
                        <div className="flex items-center">
                          Customer
                          {sortField === 'customer_name' && (sortOrder === 'ASC' ? <ArrowSmUpIcon className="ml-1 h-4 w-4 text-[#cb3a1e]" /> : <ArrowSmDownIcon className="ml-1 h-4 w-4 text-[#cb3a1e]" />)}
                        </div>
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-[#cb3a1e] uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200"
                        onClick={() => handleSort('emp_name')}
                      >
                        <div className="flex items-center">
                          Stylist
                          {sortField === 'emp_name' && (sortOrder === 'ASC' ? <ArrowSmUpIcon className="ml-1 h-4 w-4 text-[#cb3a1e]" /> : <ArrowSmDownIcon className="ml-1 h-4 w-4 text-[#cb3a1e]" />)}
                        </div>
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#cb3a1e] uppercase tracking-wider">
                        Services
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-[#cb3a1e] uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200"
                        onClick={() => handleSort('join_time')}
                      >
                        <div className="flex items-center">
                          Time Slot
                          {sortField === 'join_time' && (sortOrder === 'ASC' ? <ArrowSmUpIcon className="ml-1 h-4 w-4 text-[#cb3a1e]" /> : <ArrowSmDownIcon className="ml-1 h-4 w-4 text-[#cb3a1e]" />)}
                        </div>
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#cb3a1e] uppercase tracking-wider">
                        Duration
                      </th>
                      <th
                        scope="col"
                        className="px-6 py-3 text-left text-xs font-medium text-[#cb3a1e] uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors duration-200"
                        onClick={() => handleSort('status')}
                      >
                        <div className="flex items-center">
                          Status
                          {sortField === 'status' && (sortOrder === 'ASC' ? <ArrowSmUpIcon className="ml-1 h-4 w-4 text-[#cb3a1e]" /> : <ArrowSmDownIcon className="ml-1 h-4 w-4 text-[#cb3a1e]" />)}
                        </div>
                      </th>
                      <th scope="col" className="relative px-6 py-3">
                        <span className="sr-only">View Details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {currentBookings.map((booking) => (
                      <tr key={booking.booking_id} className="hover:bg-gray-50 transition-colors duration-200">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {booking.booking_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          <p className="font-medium text-[#cb3a1e]">{booking.customer_name}</p>
                          <p className="text-gray-500 text-xs flex items-center">
                            <PhoneIcon className="h-3 w-3 mr-1 text-green-600"/>
                            {booking.customer_ph_number}
                          </p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">
                          {booking.emp_name}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          <span className="text-[#cb3a1e] font-medium">
                            {booking.service_type?.map(s => s.name).join(', ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          <p className="font-medium text-[#cb3a1e]">{booking.formatted_times.join_time_display}</p>
                          <p className="text-gray-500 text-xs">to {booking.formatted_times.end_time_display}</p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">
                          {booking.service_duration_minutes} mins
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(booking.status)}`}>
                            {booking.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleViewDetails(booking)}
                            className="text-[#cb3a1e] hover:text-[#b8341a] font-medium transition-colors duration-200"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                
                {/* Pagination */}
                {pagination && pagination.total_pages > 1 && (
                  <nav className="flex items-center justify-between px-4 sm:px-6">
                    <div className="flex-1 flex justify-between sm:hidden">
                      <button
                        onClick={() => handlePageChange(currentPage - 1)}
                        disabled={!pagination.has_prev_page}
                        className="relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                      >
                        <ChevronLeftIcon className="h-5 w-5 mr-2" /> 
                      </button>
                      <button
                        onClick={() => handlePageChange(currentPage + 1)}
                        disabled={!pagination.has_next_page}
                        className="ml-3 relative inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                      >
                        <ChevronRightIcon className="h-5 w-5 ml-2" />
                      </button>
                    </div>
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm text-gray-700">
                          Showing <span className="font-medium text-[#cb3a1e]">{(currentPage - 1) * pagination.records_per_page + 1}</span> to{' '}
                          <span className="font-medium text-[#cb3a1e]">{Math.min(currentPage * pagination.records_per_page, pagination.total_records)}</span> of{' '}
                          <span className="font-medium text-[#cb3a1e]">{pagination.total_records}</span> results
                        </p>
                      </div>
                      <div>
                        <nav className="relative z-0 inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                          <button
                            onClick={() => handlePageChange(currentPage - 1)}
                            disabled={!pagination.has_prev_page}
                            className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                          >
                            <span className="sr-only">Previous</span>
                            <ChevronLeftIcon className="h-5 w-5" aria-hidden="true" />
                          </button>
                          {[...Array(pagination.total_pages)].map((_, i) => (
                            <button
                              key={i + 1}
                              onClick={() => handlePageChange(i + 1)}
                              aria-current={currentPage === i + 1 ? 'page' : undefined}
                              className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium transition-colors duration-200
                                ${currentPage === i + 1 ? 'z-10 bg-[#cb3a1e] border-[#cb3a1e] text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                            >
                              {i + 1}
                            </button>
                          ))}
                          <button
                            onClick={() => handlePageChange(currentPage + 1)}
                            disabled={!pagination.has_next_page}
                            className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                          >
                            <span className="sr-only">Next</span>
                            <ChevronRightIcon className="h-5 w-5" aria-hidden="true" />
                          </button>
                        </nav>
                      </div>
                    </div>
                  </nav>
                )}
              </div>
            ) : (
              <p className="text-white text-[12px] uppercase tracking-wider text-center py-4  rounded-lg ">
      No bookings found...
    </p>
            )}
          </section>

  {shopId && <ShopEmployeesTable shopId={shopId} />}
    
        {/* Booking Details Modal */}
        {showDetailsModal && selectedBooking && (
          <BookingDetailsModal booking={selectedBooking} onClose={() => setShowDetailsModal(false)} />
        )}
      </div>
    );
  }

  return null; // Should ideally not reach here if session status is handled
}

// Separate component for Booking Details Modal (create this in a file like components/BookingDetailsModal.jsx)
const BookingDetailsModal = ({ booking, onClose }) => {
  if (!booking) return null;

  // Re-declare getStatusBadgeClass within this component if you don't import it globally
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'booked':
        return 'bg-blue-100 text-blue-800';
      case 'in_service':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 relative ">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-[#cb3a1e] focus:outline-none transition-colors duration-200"
        >
          <XCircleIcon className="h-6 w-6" />
        </button>
        <h3 className="text-xl sm:text-2xl font-extrabold text-[#cb3a1e] mb-4 pb-2 border-b border-gray-200 uppercase tracking-wider">
          Booking Details - <span className="font-semibold">#{booking.booking_id}</span>
        </h3>
        <div className="space-y-3 text-gray-700 text-sm sm:text-base">
          <p className="flex items-center">
            <UserGroupIcon className="h-5 w-5 mr-2 text-[#cb3a1e]" />{' '}
            <span className="font-semibold text-gray-800">Customer:</span> {booking.customer_name} (
            <a href={`tel:${booking.customer_ph_number}`} className="text-blue-600 hover:underline">
              {booking.customer_ph_number}
            </a>
            )
          </p>
          <p className="flex items-center">
            <ScissorsIcon className="h-5 w-5 mr-2 text-[#cb3a1e]" />{' '}
            <span className="font-semibold text-gray-800">Stylist:</span> {booking.emp_name}
          </p>
          <p className="flex items-start">
            <TagIcon className="h-5 w-5 mr-2 text-[#cb3a1e]" />{' '}
            <span className="font-semibold text-gray-800">Services:</span>{' '}
            {booking.service_type?.map((s) => s.name).join(', ')}
          </p>
          <p className="flex items-center">
            <ClockIcon className="h-5 w-5 mr-2 text-[#cb3a1e]" />{' '}
            <span className="font-semibold text-gray-800">Join Time:</span>{' '}
            {booking.formatted_times.join_time_display}
          </p>
          <p className="flex items-center">
            <ClockIcon className="h-5 w-5 mr-2 text-[#cb3a1e]" />{' '}
            <span className="font-semibold text-gray-800">End Time:</span>{' '}
            {booking.formatted_times.end_time_display}
          </p>
          <p className="flex items-center">
            <HourglassIcon className="h-5 w-5 mr-2 text-[#cb3a1e]" />{' '}
            <span className="font-semibold text-gray-800">Total Duration:</span> {booking.service_duration_minutes}{' '}
            minutes
          </p>
          <p className="flex items-center">
            <CheckCircleIcon className="h-5 w-5 mr-2 text-[#cb3a1e]" />{' '}
            <span className="font-semibold text-gray-800">Status:</span>{' '}
            <span
              className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClass(
                booking.status
              )}`}
            >
              {booking.status.replace(/_/g, ' ')}
            </span>
          </p>

          {booking.status === 'booked' && (
            <p className="flex items-center text-[#cb3a1e] font-semibold text-sm sm:text-base">
              <ClockIcon className="h-5 w-5 mr-2" /> Time Until Service: {booking.time_until_service} (Est. Start:{' '}
              {booking.estimated_start})
            </p>
          )}
          {booking.status === 'in_service' && (
            <p className="flex items-center text-[#cb3a1e] font-semibold text-sm sm:text-base">
              <HourglassIcon className="h-5 w-5 mr-2" /> Time Remaining: {booking.time_remaining} (Est. Completion:{' '}
              {booking.estimated_completion})
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
