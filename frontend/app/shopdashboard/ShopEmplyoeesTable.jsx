'use client';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
    UserIcon,
    PhoneIcon,
    TagIcon,
    BriefcaseIcon,
    RefreshIcon,
    CheckIcon,
    XMarkIcon,
    TrashIcon,
    ExclamationTriangleIcon,
} from '@heroicons/react/24/solid';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app';

export default function ShopEmployeesTable({ shopId }) {
    const [employees, setEmployees] = useState([]);
    const [loadingInitial, setLoadingInitial] = useState(true); // Only for initial load
    const [error, setError] = useState(null);
    const [actionStatus, setActionStatus] = useState({}); // { empId: { loading: boolean } }
    const [employeeToDelete, setEmployeeToDelete] = useState(null); // State for delete confirmation modal

    // Fetch all employees for the given shopId
    const fetchEmployees = useCallback(async () => {
        if (!shopId) {
            setLoadingInitial(false);
            return;
        }

        // Do not set loading state to true here to avoid showing spinner on refresh
        setError(null);
        try {
            const response = await axios.get(`${API_BASE_URL}/shops/${shopId}/employees`);
            setEmployees(response.data.employees);
        } catch (err) {
            console.error('Error fetching employees:', err);
            setError(err.response?.data?.error || 'Failed to fetch employees. Please try again.');
        } finally {
            setLoadingInitial(false); // Only set to false after initial fetch
        }
    }, [shopId]);

    // Effect to fetch employees when the component mounts or shopId changes, and for polling
    useEffect(() => {
        // Initial fetch
        fetchEmployees();

        // Set up polling interval
        const intervalId = setInterval(() => {
            fetchEmployees();
        }, 2000); // Poll every 2 seconds

        // Cleanup interval on component unmount
        return () => clearInterval(intervalId);
    }, [fetchEmployees]); // Dependency on fetchEmployees ensures interval restarts if shopId changes

    // Handler to toggle employee status
    const handleEmployeeStatusToggle = useCallback(
        async (empId, currentStatus, empName) => {
            setActionStatus((prev) => ({ ...prev, [empId]: { loading: true } }));
            const newStatus = !currentStatus;

            try {
                const response = await axios.put(`${API_BASE_URL}/employees/${empId}/status`, {
                    is_active: newStatus,
                });
                // Optimistically update the UI, assuming success
                setEmployees((prevEmployees) =>
                    prevEmployees.map((emp) => (emp.emp_id === empId ? { ...emp, is_active: newStatus } : emp))
                );
                toast.success(response.data.message || `${empName} is now ${newStatus ? 'Active' : 'Inactive'}.`);
            } catch (err) {
                console.error('Error updating employee status:', err);
                toast.error(err.response?.data?.error || `Failed to update ${empName}'s status.`);
                // If update fails, re-fetch to revert optimistic update or show accurate state
                fetchEmployees();
            } finally {
                setActionStatus((prev) => ({ ...prev, [empId]: { loading: false } }));
            }
        },
        [fetchEmployees] // Add fetchEmployees to dependency array
    );

    // Handler to delete an employee
    const handleDeleteEmployee = useCallback(async () => {
        // Only proceed if an employee is selected for deletion
        if (!employeeToDelete) return;

        const { emp_id, emp_name } = employeeToDelete;
        setActionStatus((prev) => ({ ...prev, [emp_id]: { loading: true } }));

        try {
            // Make the DELETE request to the API
            const response = await axios.delete(`${API_BASE_URL}/delete_employee/${shopId}/${emp_id}`);

            // If successful, update the local state to remove the deleted employee
            setEmployees((prevEmployees) => prevEmployees.filter((emp) => emp.emp_id !== emp_id));

            // Show a success toast notification
            toast.success(response.data.message || `Employee ${emp_name} has been deleted.`);
        } catch (err) {
            console.error('Error deleting employee:', err);
            // Show an error toast notification
            toast.error(err.response?.data?.error || `Failed to delete employee ${emp_name}.`);
        } finally {
            // Clear the loading status and close the modal
            setActionStatus((prev) => ({ ...prev, [emp_id]: { loading: false } }));
            setEmployeeToDelete(null);
        }
    }, [employeeToDelete, shopId, fetchEmployees]); // Add fetchEmployees to dependency array

    // Handle initial loading state
    if (loadingInitial) {
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

    // Handle error state
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

    // Handle empty state
    if (employees.length === 0) {
        return (
            <div className="text-center py-8 text-white tracking-wider uppercase">
                <BriefcaseIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-lg font-medium">No Employees Found</h3>
                
            </div>
        );
    }

    return (
        <div className="w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 ">
            {/* Toast notifications container */}
            {/* <ToastContainer
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
            /> */}

            {/* Delete confirmation modal */}
            {employeeToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
                    <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full mx-4">
                        <div className="flex flex-col items-center text-center">
                            <ExclamationTriangleIcon className="h-12 w-12 text-red-500 mb-4" />
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Confirm Deletion</h3>
                            <p className="text-gray-700 mb-6">
                                Are you sure you want to delete employee{' '}
                                <span className="font-semibold">{employeeToDelete.emp_name}</span>?
                                This action cannot be undone.
                            </p>
                        </div>
                        <div className="flex justify-center space-x-4">
                            <button
                                onClick={() => setEmployeeToDelete(null)}
                                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteEmployee}
                                disabled={actionStatus[employeeToDelete.emp_id]?.loading}
                                className={`px-4 py-2 rounded-md text-white font-semibold transition-colors duration-200 ${
                                    actionStatus[employeeToDelete.emp_id]?.loading
                                        ? 'bg-red-400 cursor-not-allowed'
                                        : 'bg-red-600 hover:bg-red-700'
                                }`}
                            >
                                {actionStatus[employeeToDelete.emp_id]?.loading ? (
                                    <svg className="animate-spin h-5 w-5 text-white inline mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : (
                                    <TrashIcon className="h-5 w-5 inline mr-2" />
                                )}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-[#cb3a1e] uppercase tracking-wider">
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
                                    <span
                                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                            employee.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}
                                    >
                                        {employee.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <div className="flex items-center justify-end space-x-2">
                                        {/* Status Toggle Button */}
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

                                        {/* Delete Button */}
                                        <button
                                            onClick={() => setEmployeeToDelete(employee)}
                                            className={`inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-red-500 hover:bg-red-600 transition-colors duration-200 uppercase tracking-wider ${
                                                actionStatus[employee.emp_id]?.loading ? 'opacity-50 cursor-not-allowed' : ''
                                            }`}
                                            disabled={actionStatus[employee.emp_id]?.loading}
                                        >
                                            <TrashIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}