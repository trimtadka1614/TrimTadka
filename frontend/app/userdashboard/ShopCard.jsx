// components/ShopCard.jsx
"use client";

import { useState, useEffect, forwardRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  BuildingStorefrontIcon,
  MapPinIcon,
  PhoneIcon,
  ClockIcon,
  UsersIcon,
  UserCircleIcon,
  XCircleIcon,
  StarIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  UserIcon, // For gender
  UserGroupIcon, // For unisex
  SparklesIcon // For premium/mid/economy indicator
} from '@heroicons/react/24/solid';

const getStatusBadgeColor = (status) => {
  switch (status) {
    case 'Available':
      return 'bg-green-200 text-green-800';
    case 'Serving':
    case 'Ready for next customer':
    default:
      return 'bg-orange-200 text-orange-800';
  }
};

const getShopWaitTime = (barbers) => {
  if (!barbers || barbers.length === 0) {
    return "No wait";
  }

  const presentBarbers = barbers.filter((b) => b.is_active);
  if (presentBarbers.length === 0) {
    return "No wait";
  }

  const waitTimes = presentBarbers
    .map((b) => {
      const timeMatch = b.queue_info.estimated_wait_time.match(/\d+/);
      return timeMatch ? parseInt(timeMatch[0], 10) : null;
    })
    .filter((time) => time !== null);

  if (waitTimes.length === 0) {
    return "No wait";
  }

  const minWaitTime = Math.min(...waitTimes);
  // Corrected: Calculate maxWaitTime first, then apply the cap
  const maxWaitTime = Math.max(...waitTimes);
  const cappedMaxWaitTime = Math.min(maxWaitTime, 999); // Cap max wait time for display

  if (minWaitTime === cappedMaxWaitTime) {
    if (minWaitTime === 0) {
      return "No wait";
    }
    return `${minWaitTime} mins`;
  }

  if (minWaitTime === 0) {
    return `0 - ${cappedMaxWaitTime} mins`;
  }

  return `${minWaitTime} - ${cappedMaxWaitTime} mins`;
};

const getShopTypeDisplay = (type) => {
  switch (type) {
    case 'premium':
      return { text: 'Premium Experience', color: 'bg-[#7E102C]' };
    case 'mid':
      return { text: 'Quality Service', color: 'bg-[#1A5276]' };
    case 'economy':
      return { text: 'Economy & budget friendly', color: 'bg-gray-600' };
    default:
      return { text: 'Salon', color: 'bg-gray-500' };
  }
};

const ShopCard = forwardRef(({
  shop,
  expandedServicesShopId,
  expandedStylistsShopId,
  isFetchingShopDetails,
  toggleServicesExpansion,
  toggleStylistsExpansion,
  setSelectedShop,
  fetchShopDetails,
}, ref) => {
  const router = useRouter(); 
  
  const services = [
    ...new Set(
      shop.barbers?.flatMap(
        (b) => b.services?.map((s) => s.service_name) || []
      )
    ),
  ];
  const isExpanded = expandedServicesShopId === shop.shop_id;
  const shopWaitTime = getShopWaitTime(shop.barbers);
  const hasImageUrl = shop.image_url && shop.image_url.length > 0;
  const hasOffers = shop.offers && shop.offers.length > 0;

  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [activeOfferIndex, setActiveOfferIndex] = useState(0);

  // Auto-scroll images
  useEffect(() => {
    if (!hasImageUrl || shop.image_url.length <= 1) return;
    const interval = setInterval(() => {
      setActiveImageIndex((prevIndex) => (prevIndex + 1) % shop.image_url.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [hasImageUrl, shop.image_url]);

  // Auto-scroll offers
  useEffect(() => {
    if (!hasOffers || shop.offers.length <= 1) return;
    const interval = setInterval(() => {
      setActiveOfferIndex((prevIndex) => (prevIndex + 1) % shop.offers.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [hasOffers, shop.offers]);

  const handleNextOffer = (e) => {
    e.stopPropagation();
    setActiveOfferIndex((prevIndex) => (prevIndex + 1) % shop.offers.length);
  };

  const handlePrevOffer = (e) => {
    e.stopPropagation();
    setActiveOfferIndex((prevIndex) => (prevIndex - 1 + shop.offers.length) % shop.offers.length);
  };

  const shopType = getShopTypeDisplay(shop.type);

  return (
    <div
      ref={ref}
      key={shop.shop_id}
      className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-all duration-300 hover:-translate-y-1 tracking-wider uppercase text-sm"
    >
      {/* Image and Status Section */}
      <div className="relative h-48 overflow-hidden">
        {hasImageUrl ? (
          shop.image_url.map((url, index) => (
            <div
              key={index}
              className={`absolute inset-0 transition-opacity duration-1000 ${
                index === activeImageIndex ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <Image
                src={url}
                alt={`${shop.shop_name} image ${index + 1}`}
                fill
                style={{ objectFit: 'cover' }}
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              />
            </div>
          ))
        ) : (
          <div className="flex h-full items-center justify-center bg-gray-200 text-gray-400">
            <BuildingStorefrontIcon className="h-12 w-12" />
          </div>
        )}
        
        {/* Image Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent">
          {/* Top Rated Badge on the image */}
          {shop.top_rated && (
            <span className="absolute top-4 right-4 bg-yellow-500 border-1 border-yellow-300 text-white px-2 py-1 rounded-full text-xs font-semibold shadow-sm flex items-center">
              <StarIcon className="h-3 w-3 mr-1 text-white" />
              TOP RATED
            </span>
          )}
          
          {/* Wait Time and Distance */}
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white font-medium">
            <div className="flex items-center text-xs bg-gray-900/60 rounded-full px-2 py-1 backdrop-blur-sm">
              <ClockIcon className="h-4 w-4 mr-1 text-[#cb3a1e]" />
              <span className="text-white">{shopWaitTime}</span>
            </div>
            {shop.distance_from_you !== undefined &&
              shop.distance_from_you !== Infinity && (
                <div className="flex items-center text-xs bg-gray-900/60 rounded-full px-2 py-1 backdrop-blur-sm">
                  <MapPinIcon className="h-4 w-4 mr-1 text-[#cb3a1e]" />
                  <span className="text-white">
                    {shop.distance_from_you.toFixed(1)} KM AWAY
                  </span>
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Offers Section */}
      {hasOffers && (
        <div className="relative bg-[#cb3a1e] text-white p-2 text-center overflow-hidden">
          <div className="flex justify-center items-center">
            {shop.offers.length > 1 && (
              <button onClick={handlePrevOffer} className="p-1 rounded-full hover:bg-white/20 transition-colors mr-2">
                <ChevronLeftIcon className="h-4 w-4" />
              </button>
            )}
            <div className="flex-grow overflow-hidden relative h-6">
              <div 
                className="absolute top-0 left-1/2 flex transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(calc(-50% - ${activeOfferIndex * 100}%))`, width: `${shop.offers.length * 100}%` }}
              >
                {shop.offers.map((offer, index) => (
                  <div key={index} className="flex-shrink-0 w-full text-sm font-semibold tracking-wider flex items-center justify-center">
                    {offer.title}
                  </div>
                ))}
              </div>
            </div>
            {shop.offers.length > 1 && (
              <button onClick={handleNextOffer} className="p-1 rounded-full hover:bg-white/20 transition-colors ml-2">
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Details Section */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          {/* Shop Name on the left */}
          <h3 className="text-lg font-bold text-gray-900">
            {shop.shop_name}
          </h3>
          {/* Status Badge on the right */}
          <span
            className={`px-2 py-1 rounded-full text-xs font-semibold ${
              shop.is_active ? 'bg-green-500 text-white' : 'bg-red-600 text-white'
            }`}
          >
            {shop.is_active ? 'OPEN' : 'CLOSED'}
          </span>
        </div>
        
        <p className="flex items-center text-xs text-gray-600">
          <MapPinIcon className="h-4 w-4 mr-1 text-[#cb3a1e]" />
          {shop.location.address}
        </p>

        {/* New: Shop Type and Gender */}
        <div className="flex items-center mt-2 text-xs font-medium text-gray-700">
          <span className={`px-2 py-1 rounded-full text-white ${shopType.color} flex items-center mr-2`}>
            <SparklesIcon className="h-3 w-3 mr-1" />
            {shopType.text}
          </span>
          {shop.gender && (
            <span className="flex items-center bg-gray-200 text-gray-800 px-2 py-1 rounded-full">
              {shop.gender === 'male' && <UserIcon className="h-3 w-3 mr-1" />}
              {shop.gender === 'female' && <UserIcon className="h-3 w-3 mr-1 rotate-90" />} {/* Simple rotation for female icon */}
              {shop.gender === 'unisex' && <UserGroupIcon className="h-3 w-3 mr-1" />}
              {shop.gender.toUpperCase()}
            </span>
          )}
        </div>


        {/* Services Offered */}
        <div className="mt-4">
          <h4 className="font-medium text-gray-900 mb-2">SERVICES OFFERED:</h4>
          <div className="flex flex-wrap gap-2">
            {(isExpanded ? services : services.slice(0, 3)).map(
              (serviceName, index) => (
                <span
                  key={index}
                  className="bg-blue-500 text-white px-2 py-1 rounded-xl text-xs font-medium"
                >
                  {serviceName}
                </span>
              )
            )}
            {services.length > 3 && (
              <span
                onClick={(e) => { e.stopPropagation(); toggleServicesExpansion(shop.shop_id); }}
                className="text-xs mt-[5px] text-blue-900 cursor-pointer"
              >
                {isExpanded ? "SHOW LESS" : "+MORE"}
              </span>
            )}
          </div>
        </div>

        {/* Top Stylists */}
        <div className="border-t border-gray-100 mt-4 pt-4">
          <h4 className="font-medium text-gray-900 mb-3">TOP STYLISTS:</h4>
          {shop.barbers && shop.barbers.length > 0 ? (
            <>
              <div className="space-y-3">
                {(expandedStylistsShopId === shop.shop_id
                  ? shop.barbers
                  : shop.barbers.slice(0, 2)
                ).map((barber) => (
                  <div key={barber.emp_id} className="bg-gray-100 p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <UserCircleIcon className="h-5 w-5 mr-2 text-gray-400" />
                        <span className="font-medium text-gray-900">{barber.emp_name}</span>
                        <p className="flex items-center text-[12px] font-medium text-white">
                          {shop.is_active && (
                            <span className="tracking-wider uppercase ml-2 text-[10px]">
                              <span
                                className={barber.is_active ? "text-white p-1 px-2 rounded-xl bg-green-400" : "text-white p-1 rounded-xl px-4 bg-red-700"}
                              >
                                {barber.is_active ? "PRESENT" : "ABSENT"}
                              </span>
                            </span>
                          )}
                        </p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-[9px] font-medium ${getStatusBadgeColor(barber.queue_info.current_status)}`}>
                        {barber.queue_info.current_status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <div className="flex items-center">
                        <UsersIcon className="h-4 w-4 mr-1 text-[#cb3a1e]" />
                        <span>QUEUE: {barber.queue_info.total_people_in_queue}</span>
                      </div>
                      <div className="flex items-center">
                        <ClockIcon className="h-4 w-4 mr-1 text-[#cb3a1e]" />
                        <span>{barber.queue_info.estimated_wait_time}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {shop.barbers.length > 2 && (
                <p onClick={(e) => { e.stopPropagation(); toggleStylistsExpansion(shop.shop_id); }} className="text-sm text-blue-500 text-center mt-3 cursor-pointer">
                  {expandedStylistsShopId === shop.shop_id ? "SHOW LESS" : `+${shop.barbers.length - 2} MORE STYLISTS`}
                </p>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-sm">NO STYLISTS AVAILABLE</p>
          )}
        </div>
      </div>

      {/* Queue Button */}
      <div className="p-4 pt-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (shop.is_active && !isFetchingShopDetails) {
              setSelectedShop(shop);
              fetchShopDetails(shop.shop_id);
            }
          }}
          className={`w-full font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center tracking-wider uppercase ${
            shop.is_active
              ? "bg-[#cb3a1e] text-white hover:bg-[#a62b16]"
              : "bg-gray-400 text-gray-700 cursor-not-allowed"
          } ${isFetchingShopDetails ? "opacity-50 cursor-not-allowed" : ""}`}
          disabled={!shop.is_active || isFetchingShopDetails}
        >
          {isFetchingShopDetails ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white mr-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="tracking-wider uppercase">LOADING QUEUE…</span>
            </>
          ) : shop.is_active ? (
            <>
              <ClockIcon className="h-5 w-5 mr-2" />
              VIEW LIVE QUEUE
            </>
          ) : (
            <>
              <XCircleIcon className="h-5 w-5 mr-2" />
              CLOSED
            </>
          )}
        </button>
      </div>
    </div>
  );
});

export default ShopCard;
