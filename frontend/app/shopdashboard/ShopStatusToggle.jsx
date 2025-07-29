'use client';
import { useState, useEffect } from 'react'; // Import useEffect
import axios from 'axios';
import { PowerIcon, CheckIcon, XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/solid';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';

export default function ShopStatusToggle({ shopId, initialIsActive, onStatusChange }) {
    const [isActive, setIsActive] = useState(initialIsActive);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null); // For success/error messages
    const [messageType, setMessageType] = useState(''); // 'success' or 'error'

    // Use useEffect to update internal 'isActive' state when 'initialIsActive' prop changes
    useEffect(() => {
        setIsActive(initialIsActive);
    }, [initialIsActive]); // Dependency array ensures this effect runs when initialIsActive changes

    const handleToggle = async () => {
        setLoading(true);
        setMessage(null); // Clear previous messages
        const newStatus = !isActive;

        // Log the shopId to debug the 404 error
        console.log('Attempting to update shop status for shopId:', shopId, 'to', newStatus);

        try {
            const response = await axios.put(`${API_BASE_URL}/shops/${shopId}/status`, {
                is_active: newStatus
            });
            setIsActive(newStatus);
            setMessage(response.data.message || `Shop is now ${newStatus ? 'Open' : 'Closed'}.`);
            setMessageType('success');
            onStatusChange(newStatus); // Notify parent component
        } catch (err) {
            console.error('Error updating shop status:', err);
            setMessage(err.response?.data?.error || 'Failed to update shop status. Please check backend.');
            setMessageType('error');
        } finally {
            setLoading(false);
            setTimeout(() => setMessage(null), 3000); // Clear message after 3 seconds
        }
    };

    return (
        // Removed bg-white, padding, shadow, and border to make it sleek for the header
        <div className="flex items-center space-x-2">
            {/* The icon's color changes based on active status */}
            <PowerIcon className={`h-5 w-5 ${isActive ? 'text-green-400' : 'text-red-700'}`} />
            {/* Applied tracking-wider and uppercase for sleekness */}
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
                {/* Toggle switch styling */}
                {/* Changed the default background to red and peer-checked background to green */}
                <div className="w-11 h-6 bg-[#cb3a1e] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#f6c76d] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                {/* Status text for the toggle */}
                <span
                    className={`ml-2 text-sm font-semibold tracking-wider uppercase ${
                        isActive ? 'text-green-600' : 'text-red-600'
                    }`}
                >
                    {isActive ? 'Open' : 'Closed'}
                </span>

            </label>

            {/* Loading indicator */}
            {loading && (
                <div className="ml-2 text-white flex items-center text-sm">
                    <svg className="animate-spin h-4 w-4 mr-1 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Updating...
                </div>
            )}
            {/* Success/Error messages */}
            {message && (
                <div className={`ml-2 flex items-center text-xs ${messageType === 'success' ? 'text-green-300' : 'text-red-300'}`}>
                    {messageType === 'success' ? <CheckIcon className="h-4 w-4 mr-1" /> : <ExclamationTriangleIcon className="h-4 w-4 mr-1" />}
                    {message}
                </div>
            )}
        </div>
    );
}
