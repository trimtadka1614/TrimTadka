'use client';

import { useState, useRef, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
    UserCircleIcon,
    BuildingStorefrontIcon,
    PhoneIcon,
    LockClosedIcon,
    MapPinIcon,
    ScissorsIcon,
    GlobeAltIcon,
    EyeIcon,
    EyeSlashIcon,
    TagIcon, // For shop type
    UserGroupIcon // For gender
} from '@heroicons/react/24/outline';
import Image from 'next/image';

const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app';

export default function LoginPage() {
    const [isCustomer, setIsCustomer] = useState(true);
    const [isSignUp, setIsSignUp] = useState(false);
    const [phoneNumber, setPhoneNumber] = useState('');
    const [password, setPassword] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [shopName, setShopName] = useState('');
    const [shopAddress, setShopAddress] = useState('');
    const [shopLat, setShopLat] = useState('');
    const [shopLong, setShopLong] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [shopGender, setShopGender] = useState('unisex'); // New state for gender
    const [shopType, setShopType] = useState('economy'); // New state for type
    const { data: session, status } = useSession();
    const router = useRouter();

    const [showLoadingScreen, setShowLoadingScreen] = useState(true);

    const formRef = useRef(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            setShowLoadingScreen(false);
        }, 2000);

        if (status === 'authenticated' && session?.user?.role) {
            console.log('User authenticated, redirecting...', session.user.role);
            if (session.user.role === 'customer') {
                router.push('/userdashboard');
            } else if (session.user.role === 'shop') {
                router.push('/shopdashboard');
            }
        }

        return () => clearTimeout(timer);
    }, [session, status, router]);

    const getCurrentLocation = async () => {
        setLocationLoading(true);
        setErrorMessage('');

        if (!navigator.geolocation) {
            setErrorMessage('Geolocation is not supported by this browser.');
            setLocationLoading(false);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                setShopLat(latitude.toString());
                setShopLong(longitude.toString());

                try {
                    const fallbackResponse = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`
                    );

                    if (fallbackResponse.ok) {
                        const data = await fallbackResponse.json();
                        const address = data.display_name || `${latitude}, ${longitude}`;
                        setShopAddress(address);
                    } else {
                        setShopAddress(`Lat: ${latitude.toFixed(6)}, Long: ${longitude.toFixed(6)}`);
                    }
                } catch (error) {
                    console.error('Error getting address:', error);
                    setShopAddress(`Lat: ${latitude.toFixed(6)}, Long: ${longitude.toFixed(6)}`);
                }

                setLocationLoading(false);
            },
            (error) => {
                console.error('Error getting location:', error);
                setErrorMessage('Unable to retrieve your location. Please enter manually.');
                setLocationLoading(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000
            }
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMessage('');
        setSuccessMessage('');
        setIsLoading(true);

        if (phoneNumber.length !== 10 || !/^\d{10}$/.test(phoneNumber)) {
            setErrorMessage('Phone number must be valid');
            setIsLoading(false);
            return;
        }

        try {
            if (isSignUp) {
                const commonPayload = { password };
                let endpoint = '';
                let payload = {};

                if (isCustomer) {
                    if (!customerName || !phoneNumber || !password) {
                        setErrorMessage('Please fill in all customer sign-up fields.');
                        setIsLoading(false);
                        return;
                    }
                    endpoint = '/signup_customer';
                    payload = {
                        ...commonPayload,
                        customer_name: customerName,
                        customer_ph_number: phoneNumber
                    };
                } else {
                    if (!shopName || !phoneNumber || !password || !shopGender || !shopType) {
                        setErrorMessage('Please fill in all shop sign-up fields.');
                        setIsLoading(false);
                        return;
                    }
                    endpoint = '/signup_shop';
                    payload = {
                        ...commonPayload,
                        shop_name: shopName,
                        ph_number: phoneNumber,
                        lat: parseFloat(shopLat) || null,
                        long: parseFloat(shopLong) || null,
                        address: shopAddress || null,
                        gender: shopGender, // Add the new gender field
                        type: shopType      // Add the new type field
                    };
                }

                console.log('Attempting signup:', { endpoint, payload: { ...payload, password: '[HIDDEN]' } });

                const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify(payload),
                });

                console.log('Signup response status:', res.status);

                if (!res.ok) {
                    const errorText = await res.text();
                    console.error('Signup error response:', errorText);
                    let parsedError = {};
                    try {
                        parsedError = JSON.parse(errorText);
                    } catch (jsonError) {
                        parsedError.message = errorText;
                    }
                    throw new Error(parsedError.message || `Server error: ${res.status}`);
                }

                const data = await res.json();
                console.log('Signup successful:', data);

                setSuccessMessage(data.message + ' You can now sign in.');
                setIsSignUp(false);
                setPhoneNumber('');
                setPassword('');
                setCustomerName('');
                setShopName('');
                setShopAddress('');
                setShopLat('');
                setShopLong('');
                setShopGender('unisex'); // Reset new fields
                setShopType('economy'); // Reset new fields
            } else {
                console.log('Attempting sign in:', { isCustomer, phoneNumber });

                let providerId = isCustomer ? 'customer-login' : 'shop-login';
                const credentials = isCustomer
                    ? { customer_ph_number: phoneNumber, password }
                    : { ph_number: phoneNumber, password };

                const result = await signIn(providerId, {
                    ...credentials,
                    redirect: false,
                });

                console.log('Sign in result:', result);

                if (result?.error) {
                    setErrorMessage(result.error);
                } else if (result?.ok) {
                    setSuccessMessage('Signed in successfully! Redirecting...');
                } else {
                    setErrorMessage('An unexpected error occurred during sign in.');
                }
            }
        } catch (error) {
            console.error('Form submission error:', error);
            setErrorMessage(error.message || 'Failed to connect to the server. Please try again later.');
        } finally {
            setIsLoading(false);
        }
    };

    if (status === 'loading' || showLoadingScreen) {
        return (
            <div className="min-h-screen flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#f6c76d] to-[#cb3a1e] font-sans overflow-hidden relative">
                <div className="absolute inset-0 overflow-hidden">
                    <ScissorsIcon className="absolute top-10 left-10 h-32 w-32 text-white opacity-10 rotate-12 animate-float" />
                    <ScissorsIcon className="absolute bottom-20 right-16 h-28 w-28 text-white opacity-15 -rotate-12 animate-bounce-slow" />
                </div>
                <div className="text-center relative z-10">
                    <Image
                        src="/trimtadka.png"
                        alt="TrimTadka logo"
                        width={200}
                        height={100}
                        className="mx-auto mb-4 animate-pulse"
                    />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center py-8 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-[#f6c76d] to-[#cb3a1e] font-sans overflow-hidden relative">
            <div className="absolute inset-0 overflow-hidden">
                <ScissorsIcon className="absolute top-10 left-10 h-32 w-32 text-white opacity-10 rotate-12 animate-float" />
                <ScissorsIcon className="absolute bottom-20 right-16 h-28 w-28 text-white opacity-15 -rotate-12 animate-bounce-slow" />
            </div>

            <div className="max-w-md w-full relative z-10 mx-auto">
                <div className="text-center mb-6 animate-fadeInDown">
                    <div className="relative inline-block">
                        <div className="absolute inset-0 rounded-full bg-white/60 blur-xl"></div>
                        <Image
                            src="/trimtadka.png"
                            alt="TrimTadka logo"
                            width={150}
                            height={70}
                            className="relative z-10 mx-auto"
                        />
                    </div>
                    <div className="flex items-center justify-center w-full gap-4 mb-4">
                        <div className="flex-grow border-t border-white"></div>
                        <h2
                            className="text-sm font-bold text-[#cb3a1e] tracking-wide uppercase whitespace-nowrap"
                            style={{ fontFamily: "Poppins" }}
                        >
                            Trim your style. Spice your vibe.
                        </h2>
                        <div className="flex-grow border-t border-white"></div>
                    </div>
                </div>

                <div className="backdrop-blur-lg p-6 pt-0 sm:p-8 space-y-5 animate-slideInUp animation-delay-400">
                    <div className="relative bg-white/20 backdrop-blur p-1 rounded-2xl shadow-inner border border-white/30">
                        <div
                            className={`absolute top-1 bottom-1 bg-white rounded-xl shadow-lg transition-all duration-500 ease-out ${
                                isCustomer ? 'left-1 right-1/2 mr-1' : 'right-1 left-1/2 ml-1'
                            }`}
                        ></div>
                        <div className="relative grid grid-cols-2">
                            <button
                                onClick={() => setIsCustomer(true)}
                                className={`py-2.5 px-3 sm:py-3 sm:px-4 rounded-xl text-[12px] sm:text-base font-semibold transition-all duration-300 flex items-center justify-center space-x-2 uppercase tracking-wider ${
                                    isCustomer ? 'text-[#cb3a1e] transform scale-105' : 'text-white hover:text-white/80'
                                }`}
                            >
                                <UserCircleIcon className={`h-5 w-5 transition-transform duration-300 ${isCustomer ? 'animate-bounce' : ''}`} />
                                <span>Customer</span>
                            </button>
                            <button
                                onClick={() => setIsCustomer(false)}
                                className={`py-2.5 px-3 sm:py-3 sm:px-4 rounded-xl text-[12px] tracking-wider uppercase sm:text-base font-semibold transition-all duration-300 flex items-center justify-center space-x-2 ${
                                    !isCustomer ? 'text-[#cb3a1e] transform scale-105' : 'text-white hover:text-white/80'
                                }`}
                            >
                                <BuildingStorefrontIcon className={`h-5 w-5 transition-transform duration-300 ${!isCustomer ? 'animate-bounce' : ''}`} />
                                <span>Shop</span>
                            </button>
                        </div>
                    </div>

                    <form className="space-y-4" onSubmit={handleSubmit} ref={formRef}>
                        {errorMessage && (
                            <div className="bg-red-500/20 backdrop-blur border border-red-500/30 text-white px-4 py-3 rounded-xl animate-shake text-sm tracking-wider" role="alert">
                                <span className="block sm:inline">{errorMessage}</span>
                            </div>
                        )}
                        {successMessage && (
                            <div className="bg-green-500/20 backdrop-blur border border-green-500/30 text-white px-4 py-3 rounded-xl animate-pulse text-sm uppercase tracking-wider" role="alert">
                                <span className="block sm:inline">{successMessage}</span>
                            </div>
                        )}

                        <div className="space-y-4">
                            {isSignUp && (
                                <div className={`transition-all duration-500 transform ${isSignUp ? 'animate-slideInLeft' : 'opacity-0 -translate-x-full'}`}>
                                    {isCustomer ? (
                                        <div className="relative group">
                                            <div className="absolute inset-y-0 left-0 flex items-center pl-4">
                                                <UserCircleIcon className="h-5 w-5 text-white/70 group-focus-within:text-white transition-colors duration-200" />
                                            </div>
                                            <input
                                                type="text"
                                                required
                                                value={customerName}
                                                onChange={(e) => setCustomerName(e.target.value)}
                                                className="w-full pl-12 pr-4 py-2.5 sm:py-3 bg-white/10 backdrop-blur border border-white/30 rounded-xl placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent transition-all duration-300 hover:bg-white/20 text-sm sm:text-base font-semibold uppercase tracking-wider"
                                                placeholder="Your Name"
                                            />
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            <div className="relative group">
                                                <div className="absolute inset-y-0 left-0 flex items-center pl-4">
                                                    <BuildingStorefrontIcon className="h-5 w-5 text-white/70 group-focus-within:text-white transition-colors duration-200" />
                                                </div>
                                                <input
                                                    type="text"
                                                    required
                                                    value={shopName}
                                                    onChange={(e) => setShopName(e.target.value)}
                                                    className="w-full pl-12 pr-4 py-2.5 sm:py-3 bg-white/10 backdrop-blur border border-white/30 rounded-xl placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent transition-all duration-300 hover:bg-white/20 text-sm sm:text-base font-semibold uppercase tracking-wider"
                                                    placeholder="Shop Name"
                                                />
                                            </div>

                                            <button
                                                type="button"
                                                onClick={getCurrentLocation}
                                                disabled={locationLoading}
                                                className="w-full py-2.5 sm:py-3 px-4 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-xl font-semibold transition-all duration-300 hover:shadow-lg hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 text-[12px] sm:text-base uppercase tracking-wider"
                                            >
                                                <GlobeAltIcon className={`h-5 w-5 ${locationLoading ? 'animate-spin' : 'animate-pulse'}`} />
                                                <span>{locationLoading ? 'Getting Location...' : 'Use Current Location'}</span>
                                            </button>

                                            <div className="relative group">
                                                <div className="absolute inset-y-0 left-0 flex items-center pl-4">
                                                    <MapPinIcon className="h-5 w-5 text-white/70 group-focus-within:text-white transition-colors duration-200" />
                                                </div>
                                                <input
                                                    type="text"
                                                    readOnly
                                                    value={shopAddress}
                                                    onChange={(e) => setShopAddress(e.target.value)}
                                                    className="w-full pl-12 pr-4 py-2.5 sm:py-3 bg-white/10 backdrop-blur border border-white/30 rounded-xl placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent transition-all duration-300 hover:bg-white/20 text-sm sm:text-base font-semibold uppercase tracking-wider"
                                                    placeholder="Shop Address"
                                                />
                                            </div>

                                            {/* New Shop Gender Dropdown */}
                                            <div className="relative group">
                                                <div className="absolute inset-y-0 left-0 flex items-center pl-4">
                                                    <UserGroupIcon className="h-5 w-5 text-white/70" />
                                                </div>
                                                <select
                                                    required
                                                    value={shopGender}
                                                    onChange={(e) => setShopGender(e.target.value)}
                                                    className="w-full pl-12 pr-4 py-2.5 sm:py-3 bg-white/10 backdrop-blur border border-white/30 rounded-xl placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent transition-all duration-300 hover:bg-white/20 text-sm sm:text-base font-semibold uppercase tracking-wider appearance-none"
                                                >
                                                    <option value="unisex" className="text-black">Unisex</option>
                                                    <option value="gents" className="text-black">Gents</option>
                                                    <option value="ladies" className="text-black">Ladies</option>
                                                </select>
                                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white">
                                                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                                                </div>
                                            </div>

                                            {/* New Shop Type Dropdown */}
                                            <div className="relative group">
                                                <div className="absolute inset-y-0 left-0 flex items-center pl-4">
                                                    <TagIcon className="h-5 w-5 text-white/70" />
                                                </div>
                                                <select
                                                    required
                                                    value={shopType}
                                                    onChange={(e) => setShopType(e.target.value)}
                                                    className="w-full pl-12 pr-4 py-2.5 sm:py-3 bg-white/10 backdrop-blur border border-white/30 rounded-xl placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent transition-all duration-300 hover:bg-white/20 text-sm sm:text-base font-semibold uppercase tracking-wider appearance-none"
                                                >
                                                    <option value="economy" className="text-black">Economy</option>
                                                    <option value="mid" className="text-black">Mid-Range</option>
                                                    <option value="premium" className="text-black">Premium</option>
                                                </select>
                                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-white">
                                                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-4">
                                    <PhoneIcon className="h-5 w-5 text-white/70 group-focus-within:text-white transition-colors duration-200" />
                                </div>
                                <input
                                    type="text"
                                    required
                                    value={phoneNumber}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        if (/^\d*$/.test(value) && value.length <= 10) {
                                            setPhoneNumber(value);
                                        }
                                    }}
                                    className="w-full pl-12 pr-4 py-2.5 sm:py-3 bg-white/10 backdrop-blur border border-white/30 rounded-xl placeholder-white/70 text-white focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-transparent transition-all duration-300 uppercase tracking-wider hover:bg-white/20 text-sm sm:text-base font-semibold"
                                    placeholder="Phone number"
                                    maxLength={10}
                                />
                            </div>

                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-4">
                                    <LockClosedIcon className="h-5 w-5 text-white/70 group-focus-within:text-white transition-colors duration-200" />
                                </div>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-12 pr-12 py-2.5 sm:py-3 bg-white/10 backdrop-blur border border-white/30 rounded-xl placeholder-white/70 text-white focus:outline-none focus:ring-2 uppercase tracking-wider focus:ring-white/50 focus:border-transparent transition-all duration-300 hover:bg-white/20 text-sm sm:text-base font-semibold"
                                    placeholder="Password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 flex items-center pr-4 text-white/70 hover:text-white focus:outline-none transition-colors duration-200"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? (
                                        <EyeSlashIcon className="h-5 w-5" />
                                    ) : (
                                        <EyeIcon className="h-5 w-5" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {!isSignUp && (
                            <div className="flex items-center justify-between text-xs sm:text-sm">
                                <label className="flex items-center text-white/80 hover:text-white cursor-pointer ">
                                    <input type="checkbox" className="mr-2 rounded border-white/30 bg-white/10 text-[#cb3a1e] focus:ring-white/50 " />
                                    Remember me
                                </label>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className={`w-full py-2.5 sm:py-3 px-4 rounded-xl font-semibold text-white transition-all duration-300 transform hover:scale-105 hover:shadow-xl text-sm sm:text-base ${
                                isLoading
                                    ? 'bg-gray-500 cursor-not-allowed opacity-50'
                                    : 'bg-gradient-to-r from-[#cb3a1e] to-red-600 hover:from-red-600 hover:to-[#cb3a1e] shadow-lg'
                            }`}
                        >
                            <span className="flex items-center justify-center uppercase tracking-wider space-x-2">
                                {isLoading ? (
                                    <>
                                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                                        <span>Please wait...</span>
                                    </>
                                ) : (
                                    <>
                                        {isSignUp ? <UserCircleIcon className="h-5 w-5" /> : <LockClosedIcon className="h-5 w-5" />}
                                        <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
                                    </>
                                )}
                            </span>
                        </button>
                    </form>

                    <div className="text-center">
                        <p className="text-white/80 text-sm sm:text-base">
                            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                            <button
                                onClick={() => {
                                    setIsSignUp(!isSignUp);
                                    setErrorMessage('');
                                    setSuccessMessage('');
                                    setPhoneNumber('');
                                    setPassword('');
                                    setCustomerName('');
                                    setShopName('');
                                    setShopAddress('');
                                    setShopLat('');
                                    setShopLong('');
                                    setShopGender('unisex');
                                    setShopType('economy');
                                }}
                                className="font-semibold text-white hover:text-white/80 transition-all duration-200 hover:scale-105 inline-block"
                            >
                                {isSignUp ? 'Sign In' : 'Sign Up'}
                            </button>
                        </p>
                    </div>
                </div>
            </div>

            <style jsx>{`
                @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
                body {
                    font-family: 'Poppins', sans-serif;
                }
                @keyframes float { 0%, 100% { transform: translateY(0px) rotate(12deg); } 50% { transform: translateY(-20px) rotate(12deg); } }
                @keyframes bounce-slow { 0%, 100% { transform: translateY(0px) rotate(-12deg); } 50% { transform: translateY(-15px) rotate(-12deg); } }
                @keyframes blob { 0%, 100% { transform: translate(0px, 0px) scale(1); } 33% { transform: translate(30px, -50px) scale(1.1); } 66% { transform: translate(-20px, 20px) scale(0.9); } }
                @keyframes fadeInDown { from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes slideInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes slideInLeft { from { opacity: 0; transform: translateX(-30px); } to { opacity: 1; transform: translateX(0); } }
                @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
                .animate-float { animation: float 6s ease-in-out infinite; }
                .animate-bounce-slow { animation: bounce-slow 4s ease-in-out infinite; }
                .animate-blob { animation: blob 7s ease-in-out infinite; }
                .animate-fadeInDown { animation: fadeInDown 0.8s ease-out; }
                .animate-slideInUp { animation: slideInUp 0.8s ease-out; }
                .animate-slideInLeft { animation: slideInLeft 0.5s ease-out; }
                .animate-shake { animation: shake 0.5s ease-in-out; }
                .animation-delay-200 { animation-delay: 0.2s; }
                .animation-delay-400 { animation-delay: 0.4s; }
                .animation-delay-2000 { animation-delay: 2s; }
            `}</style>
        </div>
    );
}
