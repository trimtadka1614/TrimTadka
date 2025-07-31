"use client"
import { useState, useEffect } from 'react';
import axios from 'axios';
import { XMarkIcon, UserPlusIcon, ScissorsIcon, PhoneIcon, TagIcon, BriefcaseIcon } from '@heroicons/react/24/solid';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app';

export default function RegisterStylistModal({ shopId, isOpen, onClose, onStylistRegistered }) {
    const [empName, setEmpName] = useState('');
    const [phNumber, setPhNumber] = useState('');
    const [availableServices, setAvailableServices] = useState([]);
    const [selectedServiceIds, setSelectedServiceIds] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchServices();
            // Reset form when modal opens
            setEmpName('');
            setPhNumber('');
            setSelectedServiceIds([]);
        }
    }, [isOpen]);

    const fetchServices = async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/services`);
            setAvailableServices(response.data.services);
        } catch (err) {
            console.error('Error fetching services:', err);
            toast.error('Failed to load services. Please try again.');
        }
    };

    const handleServiceChange = (e) => {
        const serviceId = parseInt(e.target.value);
        if (e.target.checked) {
            setSelectedServiceIds(prev => [...prev, serviceId]);
        } else {
            setSelectedServiceIds(prev => prev.filter(id => id !== serviceId));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        if (!empName || !phNumber || selectedServiceIds.length === 0) {
            toast.error('Please fill in all fields and select at least one service.');
            setLoading(false);
            return;
        }

        try {
            const response = await axios.post(`${API_BASE_URL}/register_employee`, {
                shop_id: shopId,
                emp_name: empName,
                ph_number: phNumber,
                service_ids: selectedServiceIds,
            });
            toast.success('Stylist registered successfully!');
            onStylistRegistered(); // Notify parent to refresh data
            setTimeout(() => {
                onClose(); // Close modal after a short delay
            }, 1500);
        } catch (err) {
            console.error('Error registering stylist:', err);
            toast.error(err.response?.data?.error || 'Failed to register stylist. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 animate-fade-in uppercase tracking-wider ">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4 animate-scale-up border border-[#cb3a1e]">
                <div className="flex justify-between items-center border-b pb-3 mb-4">
                    <h2 className="text-xl font-bold text-[#cb3a1e] flex items-center">
                        <UserPlusIcon className="h-6 w-6 mr-2" /> Register New Stylist
                    </h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="empName" className="block text-sm font-bold text-black mb-1">
                            Stylist Name
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                id="empName"
                                value={empName}
                                onChange={(e) => setEmpName(e.target.value)}
                                className="mt-1 text-[12px] block w-full pl-10 pr-3 py-2 border text-black border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#cb3a1e] focus:border-[#cb3a1e] sm:text-sm"
                                placeholder="e.g., John Doe"
                                required
                            />
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <UserPlusIcon className="h-5 w-5 text-gray-400" />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label htmlFor="phNumber" className="block text-sm font-bold text-black mb-1">
                            Phone Number
                        </label>
                        <div className="relative">
                            <input
                                type="tel"
                                id="phNumber"
                                value={phNumber}
                                onChange={(e) => setPhNumber(e.target.value)}
                                className="mt-1 block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#cb3a1e] focus:border-[#cb3a1e] sm:text-sm text-black text-[12px]"
                                placeholder="e.g., 9876543210"
                                required
                            />
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <PhoneIcon className="h-5 w-5 text-gray-400" />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-[12px] font-medium text-black mb-2">
                            Services Provided
                        </label>
                        {availableServices.length > 0 ? (
                            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                {availableServices.map((service) => (
                                    <div key={service.service_id} className="flex items-center">
                                        <input
                                            type="checkbox"
                                            id={`service-${service.service_id}`}
                                            value={service.service_id}
                                            checked={selectedServiceIds.includes(service.service_id)}
                                            onChange={handleServiceChange}
                                            className="h-4 w-4 text-[#cb3a1e] border-gray-300 rounded focus:ring-[#cb3a1e]"
                                        />
                                        <label htmlFor={`service-${service.service_id}`} className="ml-2 text-sm text-gray-700 cursor-pointer">
                                            {service.service_name} ({service.service_duration_minutes} mins)
                                        </label>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-gray-500">No services available. Please add services first.</p>
                        )}
                    </div>
                    <div className="flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 uppercase tracking-wider text-[12px] focus:ring-indigo-500"
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-[#cb3a1e] hover:bg-[#a62b16] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#cb3a1e] disabled:opacity-50  -2 uppercase tracking-wider text-[12px]disabled:cursor-not-allowed"
                            disabled={loading || selectedServiceIds.length === 0}
                        >
                            {loading ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Registering...
                                </span>
                            ) : (
                                'Register Stylist'
                            )}
                        </button>
                    </div>
                </form>
            </div>
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: #f1f1f1;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #888;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #555;
                }
            `}</style>
        </div>
    );
}
