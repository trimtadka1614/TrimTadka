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
    const [error, setError] = useState(null);
    // State to manage the loading status for individual employee actions
    const [actionStatus, setActionStatus] = useState({}); // { empId: { loading: boolean } }

    const fetchEmployees = useCallback(async () => {
        if (!shopId) {
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(`${API_BASE_URL}/shops/${shopId}/employees`);
            setEmployees(response.data.employees);
        } catch (err) {
            console.error('Error fetching employees:', err);
            setError(err.response?.data?.error || 'Failed to fetch employees. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [shopId]);

    useEffect(() => {
        fetchEmployees();
    }, [fetchEmployees]);

    const handleEmployeeStatusToggle = async (empId, currentStatus, empName) => {
        // Set loading status for the specific employee
        setActionStatus(prev => ({ ...prev, [empId]: { loading: true } }));
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
            // Show a success toast
            toast.success(response.data.message || `${empName} is now ${newStatus ? 'Active' : 'Inactive'}.`);
        } catch (err) {
            console.error('Error updating employee status:', err);
            // Show an error toast
            toast.error(err.response?.data?.error || `Failed to update ${empName}'s status.`);
        } finally {
            // Clear the loading status for the specific employee
            setActionStatus(prev => ({ ...prev, [empId]: { loading: false } }));
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

    if (error) {
        return (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md relative mx-auto max-w-4xl mt-6" role="alert">
                <strong className="font-bold">Error:</strong>
                <span className="block sm:inline ml-2">{error}</span>
                <button onClick={fetchEmployees} className="ml-4 px-3 py-1 bg-red-200 text-red-800 rounded-md hover:bg-red-300">
                    <RefreshIcon className="h-4 w-4 inline mr-1" />Retry
                </button>
            </div>
        );
    }

    if (employees.length === 0) {
        return (
            <div className="text-center py-8 text-white tracking-wider uppercase">
                <BriefcaseIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-lg font-medium">No Employees Found</h3>
                <p className="mt-1 text-sm text-gray-500">
                    It looks like you haven't registered any stylists yet.
                </p>
            </div>
        );
    }

    return (
        <div className="w-[100%] mx-auto px-4 sm:px-6 lg:px-8 py-8 ">
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
            <h2 className="text-lg font-extrabold text-white mb-6 flex items-center justify-start uppercase tracking-wider">
                <UserIcon className="h-6 w-6 mr-2 text-[#cb3a1e] animate-pulse" />
                Your Stylists
            </h2>
            <div className="flex-grow border-t mb-4 mt-[-20px] border-white"></div>
            <div className="overflow-x-auto shadow border-b border-gray-200 sm:rounded-lg custom-scroll rounded-lg">
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
                                        <ul className="space-y-1">
                                            {employee.services.map((service, index) => (
                                                <li key={index} className="flex items-center whitespace-nowrap text-[#cb3a1e]">
                                                    <TagIcon className="h-3 w-3 mr-1 shrink-0" />
                                                    <span className="truncate">{service.service_name} ({service.service_duration_minutes} mins)</span>
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
                                            ${actionStatus[employee.emp_id]?.loading ? 'opacity-50 cursor-not-allowed' : ''}
                                        `}
                                        disabled={actionStatus[employee.emp_id]?.loading}
                                    >
                                        {actionStatus[employee.emp_id]?.loading ? (
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
