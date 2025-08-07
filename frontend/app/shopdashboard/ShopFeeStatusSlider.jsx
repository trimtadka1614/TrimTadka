"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { Loader, Settings, TrendingUp, TrendingDown, MinusCircle } from 'lucide-react';

const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app'; // Ensure this matches your backend URL

/**
 * A slider component to change a shop's booking fee status.
 * Allows selection of 'low', 'normal', or 'high' statuses via a range slider.
 *
 * @param {object} props - The component props.
 * @param {number} props.shopId - The ID of the shop whose fee status is being managed.
 */
const ShopFeeStatusSlider = ({ shopId }) => {
  const [currentStatus, setCurrentStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Define the order of statuses for slider mapping: low (0), normal (1), high (2)
  const statusOrder = ['low', 'normal', 'high'];

  // Function to fetch the current fee status from the backend
  const fetchFeeStatus = useCallback(async () => {
    if (!shopId) {
      setError('Shop ID is not available.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/fee-status`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch fee status.');
      }
      const data = await response.json();
      setCurrentStatus(data.status);
    } catch (err) {
      console.error('Error fetching shop fee status:', err);
      setError(err.message || 'Failed to load fee status.');
      toast.error(err.message || 'Error loading fee status.');
    } finally {
      setIsLoading(false);
    }
  }, [shopId]);

  // Fetch status on component mount
  useEffect(() => {
    fetchFeeStatus();
  }, [fetchFeeStatus]);

  // Function to handle changing the status via the slider
  const handleSliderChange = useCallback(async (event) => {
    const sliderValue = parseInt(event.target.value, 10);
    const newStatus = statusOrder[sliderValue];

    // Only update if the status has actually changed or if we're not already loading
    if (newStatus === currentStatus || isLoading) return; 

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/fee-status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update fee status.');
      }

      const data = await response.json();
      setCurrentStatus(data.override.status); // Update with the status returned from backend
      toast.success(`Fee status updated to: ${data.override.status.toUpperCase()}`);
    } catch (err) {
      console.error('Error updating shop fee status:', err);
      setError(err.message || 'Failed to update fee status.');
      toast.error(err.message || 'Error updating fee status.');
    } finally {
      setIsLoading(false);
    }
  }, [currentStatus, isLoading, shopId, statusOrder]);

  // Determine styling and icon based on current status
  const getStatusDisplay = () => {
    switch (currentStatus) {
      case 'normal':
        return {
          icon: <Settings className="h-4 w-4 mr-1 text-blue-500" />, // Smaller icon
          text: 'NORMAL',
          textColor: 'text-blue-600',
          thumbColor: 'bg-blue-500' // Thumb color for normal
        };
      case 'high':
        return {
          icon: <TrendingUp className="h-4 w-4 mr-1 text-red-500" />, // Smaller icon
          text: 'HIGH',
          textColor: 'text-red-600',
          thumbColor: 'bg-red-500' // Thumb color for high
        };
      case 'low':
        return {
          icon: <TrendingDown className="h-4 w-4 mr-1 text-green-500" />, // Smaller icon
          text: 'LOW',
          textColor: 'text-green-600',
          thumbColor: 'bg-green-500' // Thumb color for low
        };
      default:
        return {
          icon: <MinusCircle className="h-4 w-4 mr-1 text-gray-500" />, // Smaller icon
          text: 'UNKNOWN',
          textColor: 'text-gray-600',
          thumbColor: 'bg-gray-500' // Default thumb color
        };
    }
  };

  const { icon, text, textColor, thumbColor } = getStatusDisplay();

  // Map currentStatus string to a numeric value for the slider
  const sliderValue = statusOrder.indexOf(currentStatus);

  return (
    <div className="flex flex-col items-center py-2 px-0"> {/* Adjusted padding */}
      {isLoading ? (
        <div className="flex items-center justify-center py-2"> {/* Adjusted padding */}
          <Loader className="animate-spin h-5 w-5 text-indigo-500 mr-2" /> {/* Smaller loader */}
          <span className="text-sm text-gray-600">Loading Status...</span> {/* Smaller text */}
        </div>
      ) : error ? (
        <div className="text-red-600 text-center py-2"> {/* Adjusted padding */}
          <p className="text-sm">{error}</p> {/* Smaller text */}
          <button
            onClick={fetchFeeStatus}
            className="mt-2 px-3 py-1.5 bg-red-100 text-red-700 text-xs rounded-md hover:bg-red-200 transition-colors" // Smaller button
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center w-full max-w-xs">
          <div className="flex items-center space-x-1 mb-2"> {/* Reduced spacing and margin */}
            {icon}
            <span className={`text-sm font-semibold tracking-wider uppercase ${textColor}`}> {/* Smaller font size */}
              FEES: {text}
            </span>
          </div>
         <input
  type="range"
  min="0"
  max={statusOrder.length - 1}
  step="1"
  value={sliderValue !== -1 ? sliderValue : 1}
  onChange={handleSliderChange}
  disabled={isLoading}
  className={`w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer range-lg
    [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]: [&::-webkit-slider-thumb]:${thumbColor} [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-200 [&::-webkit-slider-thumb]:hover:scale-110
    [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:-mt-[5px] [&::-moz-range-thumb]:${thumbColor} [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:transition-all [&::-moz-range-thumb]:duration-200 [&::-moz-range-thumb]:hover:scale-110`}
/>

          {isLoading && (
            <div className="mt-2 text-gray-600 flex uppercase tracking-wide items-center text-xs"> {/* Smaller text */}
              <Loader className="animate-spin h-3 w-3 mr-1 tracking-wider uppercase" /> {/* Smaller loader */}
              Updating...
            </div>
          )}
        </div>
      )}
      
    </div>
  );
};

export default ShopFeeStatusSlider;
