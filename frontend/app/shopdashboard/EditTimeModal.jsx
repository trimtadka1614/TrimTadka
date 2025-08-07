'use client';

import { useState } from 'react';
import { PlusIcon, MinusIcon, ClockIcon } from '@heroicons/react/24/solid'; // Added ClockIcon for the button
import { toast } from 'react-toastify'; // Import toast for notifications
import { LoaderIcon } from 'lucide-react'; // For loading spinner

const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app'; // Define API_BASE_URL here or import from a config

// This component now acts as both the button and the modal itself.
// It manages its own visibility state internally.
const EditTimeModal = ({ booking, shopId, onTimeUpdated }) => {
  // State to control the visibility of the modal.
  const [showModal, setShowModal] = useState(false);
  const [delayMinutes, setDelayMinutes] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Function to open the modal.
  const handleOpenModal = () => {
    setShowModal(true);
    setDelayMinutes(0); // Reset delay minutes when opening
    setError('');       // Clear any previous errors when opening
  };

  // Function to close the modal.
  const handleCloseModal = () => {
    setShowModal(false);
  };

  // Handles incrementing/decrementing delay minutes, ensuring it doesn't go below zero.
  const handleTimeChange = (minutes) => {
    setDelayMinutes(prev => Math.max(0, prev + minutes));
  };

  // Handles the submission of the time edit.
  const handleSubmit = async () => {
    // Validate that a positive delay is set.
    if (delayMinutes <= 0) {
      setError('Please add a positive delay in minutes.');
      return;
    }
    setError(''); // Clear any previous errors
    setIsSubmitting(true); // Set loading state

    try {
      // Make the API call to update the booking time.
      const response = await fetch(`${API_BASE_URL}/editbookingbyshops`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          booking_id: booking.booking_id,
          shop_id: shopId,
          delay_minutes: delayMinutes,
        }),
      });

      // Check if the API response was successful.
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update booking time.');
      }

      // Show success toast notification.
      toast.success('Booking time updated successfully!', {
        position: "top-right",
        autoClose: 3000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });

      // Call the parent's callback to refresh booking data.
      onTimeUpdated();
      // Close the modal.
      handleCloseModal(); // Use the internal close handler
      // Reset delay minutes for subsequent uses.
      setDelayMinutes(0);
    } catch (err) {
      // Log and display error toast notification.
      console.error('Error updating booking time:', err);
      setError(err.message || 'An unexpected error occurred.');
      toast.error(err.message || 'Failed to update booking time. Please try again.', {
        position: "top-right",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
      });
    } finally {
      setIsSubmitting(false); // Reset loading state
    }
  };

  return (
    <>
      {/* The button that triggers the modal */}
      <button
        onClick={handleOpenModal}
        className="bg-blue-500 text-white font-semibold uppercase tracking-wider py-1 px-2 rounded-md hover:bg-blue-600 text-[11px] transition duration-150 ease-in-out flex items-center justify-center gap-1"
      >
        <ClockIcon className="h-4 w-4" /> {/* Icon for visual appeal */}
        Edit Time
      </button>

      {/* Conditionally render the modal content when showModal is true */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 uppercase tracking-wider">
          {/* Background Overlay - closes modal when clicked outside */}
          <div className="absolute inset-0 bg-black opacity-50" onClick={handleCloseModal}></div>

          {/* Modal Content Area */}
          <div className="relative w-full max-w-md rounded-lg bg-white p-6 text-center shadow-lg transform transition-transform scale-100 duration-300">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Edit Service Duration
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Add extra time for <span className="font-semibold">{booking?.customer_name}</span>. Subsequent bookings will be shifted.
            </p>

            {/* Timer-like Interface for adjusting minutes */}
            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                onClick={() => handleTimeChange(-5)}
                className="p-2 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={delayMinutes <= 0 || isSubmitting} // Disable if no delay or submitting
              >
                <MinusIcon className="h-5 w-5" />
              </button>
              <div className="text-4xl font-bold text-[#cb3a1e] w-24 text-center">
                {delayMinutes} min
              </div>
              <button
                onClick={() => handleTimeChange(5)}
                className="p-2 rounded-full bg-[#cb3a1e] text-white hover:bg-[#a93019] transition disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSubmitting} // Disable while submitting
              >
                <PlusIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Error message display */}
            {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

            {/* Action Buttons: Cancel and Confirm Delay */}
            <div className="mt-6 flex justify-center gap-2">
              <button
                type="button"
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleCloseModal} // Use the internal close handler
                disabled={isSubmitting} // Disable while submitting
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md border border-transparent bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                onClick={handleSubmit}
                disabled={isSubmitting || delayMinutes <= 0} // Disable if no delay or submitting
              >
                {isSubmitting ? (
                  <>
                    <LoaderIcon className="animate-spin h-4 w-4" /> Updating...
                  </>
                ) : (
                  'Confirm Delay'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EditTimeModal;
