'use client';

import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { XCircleIcon, UserIcon, TagIcon, PlusCircleIcon } from '@heroicons/react/24/solid';
import { LoaderIcon } from "lucide-react";
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app';

export default function AddWalkinBookingModal({ shopId, isOpen, onClose, onBookingSuccess }) {
    const [employees, setEmployees] = useState([]);
    const [filteredServices, setFilteredServices] = useState([]); // Services for the selected employee
    const [selectedEmployee, setSelectedEmployee] = useState('');
    const [selectedServices, setSelectedServices] = useState([]); // IDs of services selected for the booking
    const [loading, setLoading] = useState(false);

    // Fetch employees when the modal opens or shopId changes
    useEffect(() => {
        if (!isOpen || !shopId) {
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            try {
                const empResponse = await axios.get(`${API_BASE_URL}/shops/${shopId}/employees`);
                setEmployees(empResponse.data.employees);
            } catch (err) {
                console.error('Error fetching data for walk-in booking:', err);
                toast.error('Failed to load employees. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [isOpen, shopId]);

    // Update filtered services based on the selected employee
    useEffect(() => {
        if (!selectedEmployee || !employees.length) {
            setFilteredServices([]);
            setSelectedServices([]);
            return;
        }

        const employee = employees.find(emp => emp.emp_id === parseInt(selectedEmployee));
        if (employee && employee.services) {
            setFilteredServices(employee.services);
            setSelectedServices([]); // Clear selected services when employee changes
        } else {
            setFilteredServices([]);
            setSelectedServices([]);
        }
    }, [selectedEmployee, employees]);

    // Reset form when modal closes
    useEffect(() => {
        if (!isOpen) {
            setSelectedEmployee('');
            setSelectedServices([]);
            setFilteredServices([]);
        }
    }, [isOpen]);

    const handleServiceChange = (e) => {
        const value = parseInt(e.target.value);
        if (e.target.checked) {
            setSelectedServices((prev) => [...prev, value]);
        } else {
            setSelectedServices((prev) => prev.filter((serviceId) => serviceId !== value));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        if (!selectedEmployee || selectedServices.length === 0) {
            toast.error('Please select an employee and at least one service.');
            setLoading(false);
            return;
        }

        try {
            const response = await axios.post(`${API_BASE_URL}/bookings`, {
                shop_id: shopId,
                emp_id: parseInt(selectedEmployee),
                customer_id: 0, // For walk-in customers
                service_ids: selectedServices,
            });
            toast.success('Walk-in booking created successfully!');
            
            if (onBookingSuccess) {
                onBookingSuccess();
            }
        } catch (err) {
            console.error('Error creating walk-in booking:', err);
            toast.error(err.response?.data?.error || 'Failed to create booking. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 relative animate-scale-up">
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 text-gray-400 hover:text-[#cb3a1e] focus:outline-none transition-colors duration-200"
                >
                    <XCircleIcon className="h-6 w-6" />
                </button>
                <h3 className="text-xl sm:text-2xl font-extrabold text-[#cb3a1e] mb-4 pb-2 border-b border-gray-200 uppercase tracking-wider">
                    Add Walk-in Booking
                </h3>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {loading && (
                        <div className="flex items-center justify-center py-4">
                            <LoaderIcon className="h-8 w-8 animate-spin text-[#cb3a1e]" />
                            <span className="ml-3 text-gray-700 uppercase tracking-wider">Processing...</span>
                        </div>
                    )}

                    <div>
                        <label htmlFor="employee" className="block text-sm font-medium text-black mb-1 flex items-center uppercase tracking-wider">
                            <UserIcon className="h-4 w-4 mr-1 text-[#cb3a1e]" /> Select Stylist:
                        </label>
                        <select
                            id="employee"
                            value={selectedEmployee}
                            onChange={(e) => setSelectedEmployee(e.target.value)}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-[#cb3a1e] focus:border-[#cb3a1e] sm:text-sm uppercase tracking-wider text-black"
                            disabled={loading}
                        >
                            <option value="" className="uppercase tracking-wider text-black">-- Choose a stylist --</option>
                            {employees.map((emp) => (
                                <option key={emp.emp_id} value={emp.emp_id} className="uppercase tracking-wider text-black">
                                    {emp.emp_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center uppercase tracking-wider">
                            <TagIcon className="h-4 w-4 mr-1 text-[#cb3a1e]" /> Select Services:
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-gray-300 rounded-md p-2">
                            {filteredServices.length > 0 ? (
                                filteredServices.map((service) => (
                                    <div key={service.service_id} className="flex items-center">
                                        <input
                                            type="checkbox"
                                            id={`service-${service.service_id}`}
                                            value={service.service_id}
                                            checked={selectedServices.includes(service.service_id)}
                                            onChange={handleServiceChange}
                                            className="h-4 w-4 text-[#cb3a1e] focus:ring-[#cb3a1e] border-gray-300 rounded"
                                            disabled={loading}
                                        />
                                        <label htmlFor={`service-${service.service_id}`} className="ml-2 text-sm text-gray-700 uppercase tracking-wider">
                                            {service.service_name} ({service.service_duration_minutes} mins)
                                        </label>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-gray-500 col-span-2 uppercase tracking-wider">
                                    {selectedEmployee ? 'No services available for this stylist.' : 'Please select a stylist to view services.'}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors duration-200 uppercase tracking-wider"
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-[#cb3a1e] text-white rounded-md hover:bg-[#b8341a] transition-colors duration-200 flex items-center justify-center uppercase tracking-wider"
                            disabled={loading}
                        >
                            <PlusCircleIcon className="h-5 w-5 mr-2" />
                            Add Booking
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
