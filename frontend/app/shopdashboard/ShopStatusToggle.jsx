'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { PowerIcon } from '@heroicons/react/24/solid';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// The base URL for the API endpoint
const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app';

/**
 * A toggle component to manage the active status of a shop, with React Toastify notifications.
 *
 * @param {string} shopId - The unique ID of the shop.
 * @param {boolean} initialIsActive - The initial active status of the shop.
 * @param {function} onStatusChange - Callback function to notify the parent component of the new status.
 */
export default function ShopStatusToggle({ shopId, initialIsActive, onStatusChange }) {
    // State to manage the active status of the shop.
    const [isActive, setIsActive] = useState(initialIsActive);
    // State to manage the loading status during the API call.
    const [loading, setLoading] = useState(false);

    // useEffect hook to synchronize the internal 'isActive' state with the 'initialIsActive' prop.
    // This ensures the component correctly reflects the status if the parent re-renders with a new value.
    useEffect(() => {
        setIsActive(initialIsActive);
    }, [initialIsActive]);

    // Asynchronous function to handle the toggle action and API call.
    const handleToggle = async () => {
        setLoading(true);
        const newStatus = !isActive;

        try {
            // Making a PUT request to update the shop's status.
            const response = await axios.put(`${API_BASE_URL}/shops/${shopId}/status`, {
                is_active: newStatus
            });

            // Updating the local state and showing a success toast.
            setIsActive(newStatus);
            toast.success(response.data.message || `Shop is now ${newStatus ? 'Open' : 'Closed'}.`);
            onStatusChange(newStatus); // Notifying the parent component.

        } catch (err) {
            // Logging the error and showing an error toast.
            console.error('Error updating shop status:', err);
            toast.error(err.response?.data?.error || 'Failed to update shop status. Please check backend.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center space-x-2">
            {/* The ToastContainer is added here to display notifications globally within the component's scope. */}
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
            
            <PowerIcon className={`h-5 w-5 ${isActive ? 'text-green-400' : 'text-red-700'}`} />
            
            <span className="text-sm font-medium text-white tracking-wider uppercase whitespace-nowrap">
                Shop Status:
            </span>
            
            <label htmlFor="shop-status-toggle" className="relative inline-flex items-center cursor-pointer">
                <input
                    type="checkbox"
                    id="shop-status-toggle"
                    className="sr-only peer"
                    checked={isActive}
                    onChange={handleToggle}
                    disabled={loading}
                />
                <div className="w-11 h-6 bg-[#cb3a1e] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#f6c76d] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                <span
                    className={`ml-2 text-sm font-semibold tracking-wider uppercase ${
                        isActive ? 'text-green-600' : 'text-red-600'
                    }`}
                >
                    {isActive ? 'Open' : 'Closed'}
                </span>
            </label>

            {/* Loading indicator is preserved */}
            {loading && (
                <div className="ml-2 text-white flex uppercase tracking-wide items-center text-sm">
                    <svg className="animate-spin h-4 w-4 mr-1 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Updating...
                </div>
            )}
        </div>
    );
}

