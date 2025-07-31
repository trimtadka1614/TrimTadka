'use client';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { UserIcon, PhoneIcon, TagIcon, BriefcaseIcon, RefreshIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app';

export default function ShopEmployeesTable({ shopId }) {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    // State to manage loading for individual employee actions
    const [actionStatus, setActionStatus] = useState({}); // { empId: boolean }

    const fetchEmployees = useCallback(async () => {
        if (!shopId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/shops/${shopId}/employees`);
            setEmployees(response.data.employees);
        } catch (err) {
            console.error('Error fetching employees:', err);
            toast.error(err.response?.data?.error || 'Failed to fetch employees. Please try again.');
            setEmployees([]); // Clear employees on error
        } finally {
            setLoading(false);
        }
    }, [shopId]);

    useEffect(() => {
        fetchEmployees();
    }, [fetchEmployees]);

    const handleEmployeeStatusToggle = async (empId, currentStatus, empName) => {
        setActionStatus(prev => ({ ...prev, [empId]: true }));
        const newStatus = !currentStatus;

        try {
            const response = await axios.put(`${API_BASE_URL}/employees/${empId}/status`, {
                is_active: newStatus
            });
            // Update the employee's status in the local state
            setEmployees(prevEmployees =>
                prevEmployees.map(emp =>
                    emp.emp_id === empId ? { ...emp, is_active: newStatus } : emp
                )
            );
            toast.success(response.data.message || `${empName} is now ${newStatus ? 'Active' : 'Inactive'}.`);
        } catch (err) {
            console.error('Error updating employee status:', err);
            toast.error(err.response?.data?.error || `Failed to update ${empName}'s status.`);
        } finally {
            setActionStatus(prev => ({ ...prev, [empId]: false }));
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-8">
                <svg className="animate-spin h-8 w-8 text-[#cb3a1e]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="ml-3 text-lg text-gray-700">Loading employees...</p>
            </div>
        );
    }

    if (employees.length === 0) {
        return (
            <div className="text-center py-8 text-gray-700 tracking-wider uppercase">
                <BriefcaseIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-lg font-medium">No Employees Found</h3>
                <p className="mt-1 text-sm text-gray-500">
                    It looks like you haven't registered any stylists yet.
                </p>
                <button
                    onClick={fetchEmployees}
                    className="mt-4 px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-[#cb3a1e] hover:bg-[#a62b16] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#cb3a1e]"
                >
                    <RefreshIcon className="h-4 w-4 inline mr-2" />
                    Refresh
                </button>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <h3 className="text-xl font-bold text-[#cb3a1e] mb-4 flex items-center">
                <UserIcon className="h-6 w-6 mr-2" /> Your Stylists
            </h3>
            <div className="overflow-x-auto shadow border-b border-gray-200 sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#cb3a1e] uppercase tracking-wider">
                                Stylist
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#cb3a1e] uppercase tracking-wider">
                                Phone Number
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#cb3a1e] uppercase tracking-wider">
                                Services Offered
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#cb3a1e] uppercase tracking-wider">
                                Status
                            </th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-[#cb3a1e] uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {employees.map((employee) => (
                            <tr key={employee.emp_id} className="hover:bg-gray-50 transition-colors duration-200">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    <div className="flex items-center">
                                        <UserIcon className="h-4 w-4 text-gray-500 mr-2" />
                                        {employee.emp_name}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                    <div className="flex items-center">
                                        <PhoneIcon className="h-4 w-4 text-green-600 mr-2" />
                                        {employee.ph_number}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-700">
                                    {employee.services && employee.services.length > 0 ? (
                                        <ul className="list-disc list-inside space-y-1">
                                            {employee.services.map((service, index) => (
                                                <li key={index} className="flex items-center text-[#cb3a1e]">
                                                    <TagIcon className="h-3 w-3 mr-1" />
                                                    {service.service_name} ({service.service_duration_minutes} mins)
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <span className="text-gray-500">No services assigned</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                        employee.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                    }`}>
                                        {employee.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button
                                        onClick={() => handleEmployeeStatusToggle(employee.emp_id, employee.is_active, employee.emp_name)}
                                        className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white transition-colors duration-200 uppercase tracking-wider
                                            ${employee.is_active ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}
                                            ${actionStatus[employee.emp_id] ? 'opacity-50 cursor-not-allowed' : ''}
                                        `}
                                        disabled={actionStatus[employee.emp_id]}
                                    >
                                        {actionStatus[employee.emp_id] ? (
                                            <svg className="animate-spin h-4 w-4 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        ) : employee.is_active ? (
                                            <XMarkIcon className="h-4 w-4 mr-1" />
                                        ) : (
                                            <CheckIcon className="h-4 w-4 mr-1" />
                                        )}
                                        {employee.is_active ? 'Deactivate' : 'Activate'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
