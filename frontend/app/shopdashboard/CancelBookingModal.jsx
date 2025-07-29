'use client';

import { useState } from 'react';
import axios from 'axios';
import { XCircleIcon, CheckCircle2Icon, LoaderIcon } from 'lucide-react';

const API_BASE_URL = 'https://trim-tadka-backend.vercel.app';

export default function CancelBookingModal({ bookingId, shopId, onCancellationSuccess }) {
    const [showModal, setShowModal] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    const handleCancelClick = () => {
        setError(null);
        setSuccess(null);
        setShowModal(true);
    };

    const confirmCancellation = async () => {
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await axios.post(`${API_BASE_URL}/shop/bookings/cancel`, {
                booking_id: bookingId,
                shop_id: shopId,
            });

            setSuccess(response.data.message || 'Booking cancelled successfully!');
            if (onCancellationSuccess) {
                onCancellationSuccess(bookingId);
            }
            setTimeout(() => setShowModal(false), 2000);
        } catch (err) {
            console.error('Error cancelling booking:', err);
            setError(err.response?.data?.error || 'Failed to cancel booking. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {/* SMALL Cancel Button */}
            <button
                onClick={handleCancelClick}
                className="inline-flex items-center justify-center px-2 py-1 border border-transparent text-[10px] font-semibold rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all duration-200 uppercase tracking-wider whitespace-nowrap"
                disabled={loading}
            >
                {loading ? (
                    <LoaderIcon className="animate-spin h-4 w-4 mr-1" />
                ) : (
                    <XCircleIcon className="h-4 w-4 mr-1" />
                )}
                {loading ? 'Cancelling...' : 'Cancel'}
            </button>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm mx-auto animate-fade-in-up uppercase tracking-wider text-xs sm:text-sm">
                        {/* Header */}
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900">Confirm Cancellation</h3>
                            <button
                                onClick={() => setShowModal(false)}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <XCircleIcon className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Message */}
                        <p className="text-gray-700 mb-6">
                            Are you sure you want to cancel this booking (ID: <span className="font-bold">{bookingId}</span>)? This action cannot be undone.
                        </p>

                        {/* Error */}
                        {error && (
                            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-lg mb-4 uppercase">
                                <strong className="font-bold">Error:</strong>
                                <span className="ml-2">{error}</span>
                            </div>
                        )}

                        {/* Success */}
                        {success && (
                            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded-lg mb-4 uppercase">
                                <strong className="font-bold">Success:</strong>
                                <span className="ml-2">{success}</span>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowModal(false)}
                                className="px-3 py-1 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 uppercase tracking-wider text-xs"
                                disabled={loading}
                            >
                                No, Keep It
                            </button>
                            <button
                                onClick={confirmCancellation}
                                className="px-3 py-1 rounded-md text-white bg-[#cb3a1e] hover:bg-[#a62b16] transition-colors duration-200 flex items-center uppercase tracking-wider text-xs"
                                disabled={loading}
                            >
                                {loading ? (
                                    <LoaderIcon className="animate-spin h-4 w-4 mr-1" />
                                ) : (
                                    <CheckCircle2Icon className="h-4 w-4 mr-1" />
                                )}
                                {loading ? 'Confirming...' : 'Yes, Cancel'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
