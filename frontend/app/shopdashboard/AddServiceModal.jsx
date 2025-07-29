"use client"
import { useState, useEffect } from 'react';
import axios from 'axios';
import { XMarkIcon, TagIcon, ClockIcon } from '@heroicons/react/24/solid';

const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app';

export default function AddServiceModal({ isOpen, onClose, onServiceAdded }) {
    const [serviceName, setServiceName] = useState('');
    const [serviceDuration, setServiceDuration] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    useEffect(() => {
        if (isOpen) {
            // Reset form when modal opens
            setServiceName('');
            setServiceDuration('');
            setError(null);
            setSuccess(null);
        }
    }, [isOpen]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        if (!serviceName || !serviceDuration) {
            setError('Please fill in all fields.');
            setLoading(false);
            return;
        }

        const durationMinutes = parseInt(serviceDuration);
        if (isNaN(durationMinutes) || durationMinutes <= 0) {
            setError('Service duration must be a positive number in minutes.');
            setLoading(false);
            return;
        }

        try {
            const response = await axios.post(`${API_BASE_URL}/register_service`, {
                service_name: serviceName,
                service_duration_minutes: durationMinutes,
            });
            setSuccess(response.data.message || 'Service added successfully!');
            onServiceAdded(); // Notify parent to refresh data (if needed, e.g., for stylist registration)
            setTimeout(() => {
                onClose(); // Close modal after a short delay
            }, 1500);
        } catch (err) {
            console.error('Error adding service:', err);
            setError(err.response?.data?.error || 'Failed to add service. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 animate-fade-in uppercase tracking-wider">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4 animate-scale-up border border-[#cb3a1e]">
                <div className="flex justify-between items-center border-b pb-3 mb-4">
                    <h2 className="text-xl font-bold text-[#cb3a1e] flex items-center">
                        <TagIcon className="h-6 w-6 mr-2" /> Add New Service
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="serviceName" className="block text-sm font-medium text-gray-700 mb-1 ">
                            Service Name
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                id="serviceName"
                                value={serviceName}
                                onChange={(e) => setServiceName(e.target.value)}
                                className="mt-1 block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#cb3a1e] focus:border-[#cb3a1e] sm:text-sm text-[12px] text-black"
                                placeholder="e.g., Haircut, Shave"
                                required
                            />
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <TagIcon className="h-5 w-5 text-gray-400" />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="serviceDuration" className="block text-sm font-medium text-gray-700 mb-1">
                            Service Duration (minutes)
                        </label>
                        <div className="relative">
                            <input
                                type="number"
                                id="serviceDuration"
                                value={serviceDuration}
                                onChange={(e) => setServiceDuration(e.target.value)}
                                className="mt-1 block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#cb3a1e] focus:border-[#cb3a1e] sm:text-sm text-[12px] text-black"
                                placeholder="e.g., 30"
                                required
                                min="1"
                            />
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <ClockIcon className="h-5 w-5 text-gray-400" />
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded-md text-sm">
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className="bg-green-100 border border-green-400 text-green-700 px-3 py-2 rounded-md text-sm">
                            {success}
                        </div>
                    )}

                    <div className="flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 uppercase tracking-wider text-[12px]"
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-[#cb3a1e] hover:bg-[#a62b16] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#cb3a1e] disabled:opacity-50 uppercase tracking-wider text-[12px] disabled:cursor-not-allowed"
                            disabled={loading}
                        >
                            {loading ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Adding...
                                </span>
                            ) : (
                                'Add Service'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
