// components/ShopCard.jsx
"use client";

import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  BuildingStorefrontIcon,
  MapPinIcon,
  PhoneIcon,
  ClockIcon,
  UsersIcon,
  UserCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/solid';

const getStatusBadgeColor = (status) => {
  switch (status) {
    case 'Available':
      return 'bg-green-200 text-green-800';
    case 'Serving':
      return 'bg-orange-200 text-orange-800';
    case 'Ready for next customer':
      return 'bg-blue-200 text-blue-800';
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
  const maxWaitTime = Math.max(...waitTimes);

  if (minWaitTime === maxWaitTime) {
    if (minWaitTime === 0) {
      return "No wait";
    }
    return `${minWaitTime} mins`;
  }

  if (minWaitTime === 0) {
    return `0 - ${maxWaitTime} mins`;
  }

  return `${minWaitTime} - ${maxWaitTime} mins`;
};

export default function ShopCard({
  shop,
  expandedServicesShopId,
  expandedStylistsShopId,
  isFetchingShopDetails,
  toggleServicesExpansion,
  toggleStylistsExpansion,
  setSelectedShop,
  fetchShopDetails,
}) {
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

  // Hooks are now at the top level of this component
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  useEffect(() => {
    if (!hasImageUrl || shop.image_url.length <= 1) {
      return;
    }
    const interval = setInterval(() => {
      setActiveImageIndex((prevIndex) => (prevIndex + 1) % shop.image_url.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [hasImageUrl, shop.image_url]);

  return (
    <div
      key={shop.shop_id}
      className="bg-white rounded-xl overflow-hidden hover:shadow-lg transition-all duration-300 hover:-translate-y-1 tracking-wider uppercase text-sm"
    >
      {/* Image Section with automatic slideshow */}
      {hasImageUrl ? (
        <div className="relative h-48 overflow-hidden">
          {shop.image_url.map((url, index) => (
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
          ))}

          {/* Image Overlay for wait time and distance */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent">
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
                      {shop.distance_from_you.toFixed(1)} km away
                    </span>
                  </div>
                )}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 pb-4">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-xl font-bold  text-gray-900 flex items-center">
              <BuildingStorefrontIcon className="h-6 w-6 mr-2 text-[#cb3a1e]" />
              {shop.shop_name}
            </h3>
            <p className="flex items-center text-[12px] font-medium text-white">
              <span className="tracking-wider uppercase">
                <span
                  className={
                    shop.is_active
                      ? "text-white p-1 px-4 rounded-xl bg-green-400"
                      : "text-white p-1 rounded-xl px-4 bg-red-700"
                  }
                >
                  {shop.is_active ? "Open" : "Closed"}
                </span>
              </span>
            </p>
          </div>
          <div className="space-y-2 text-sm text-black mb-4">
            <p className="flex items-center">
              <MapPinIcon className="h-4 w-4 mr-2 text-[#cb3a1e]" />
              {shop.location.address}
            </p>
            <p className="flex items-center">
              <PhoneIcon className="h-4 w-4 mr-2 text-[#cb3a1e]" />
              {shop.ph_number}
            </p>
            {shop.distance_from_you !== undefined &&
              shop.distance_from_you !== Infinity && (
              <p className="flex items-center font-semibold text-[#cb3a1e]">
                <MapPinIcon className="h-4 w-4 mr-2" />
                {shop.distance_from_you.toFixed(1)} km away
              </p>
            )}
          </div>
        </div>
      )}

      {/* Common Details Section */}
      <div className={`${hasImageUrl ? "p-6 pt-0" : "px-6 pb-4 pt-0"}`}>
        {hasImageUrl && (
          <div className="space-y-2 text-sm text-black mb-4">
            <div className="flex items-start justify-between">
              <h3 className="text-xl font-bold text-gray-900 flex items-center mt-4 ">
                <BuildingStorefrontIcon className="h-6 w-6 mr-2 mt- text-[#cb3a1e]" />
                {shop.shop_name}
              </h3>
            </div>
            <p className="flex items-center">
              <MapPinIcon className="h-4 w-4 mr-2 text-[#cb3a1e]" />
              {shop.location.address}
            </p>
            <p className="flex items-center">
              <PhoneIcon className="h-4 w-4 mr-2 text-[#cb3a1e]" />
              {shop.ph_number}
            </p>
          </div>
        )}
        <div className="mb-4">
          <h4 className="font-medium text-gray-900 mb-2">Services Offered:</h4>
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
                onClick={() => toggleServicesExpansion(shop.shop_id)}
                className="text-xs mt-[5px] text-blue-900 cursor-pointer"
              >
                {isExpanded ? "show less" : "+more"}
              </span>
            )}
          </div>
          {!hasImageUrl && (
            <div className="flex items-center mt-2">
              <ClockIcon className="h-4 w-4 mr-1 text-gray-600" />
              <p className="text-sm text-gray-600 font-medium">
                Estimated Wait: <span className="text-[#cb3a1e]">{shopWaitTime}</span>
              </p>
            </div>
          )}
        </div>

        {/* Top Stylists */}
        <div className="border-t border-gray-100 ">
          <h4 className="font-medium text-gray-900 mb-3">Top Stylists:</h4>
          {shop.barbers && shop.barbers.length > 0 ? (
            <>
              <div className="space-y-3">
                {(expandedStylistsShopId === shop.shop_id
                  ? shop.barbers
                  : shop.barbers.slice(0, 2)
                ).map((barber) => (
                  <div
                    key={barber.emp_id}
                    className="bg-gray-100 p-3 rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <UserCircleIcon className="h-5 w-5 mr-2 text-gray-400" />
                        <span className="font-medium text-gray-900">
                          {barber.emp_name}
                        </span>
                        <p className="flex items-center text-[12px] font-medium text-white">
                          {shop.is_active && (
                            <span className="tracking-wider uppercase ml-2 text-[10px]">
                              <span
                                className={
                                  barber.is_active
                                    ? "text-white p-1 px-2 rounded-xl bg-green-400"
                                    : "text-white p-1 rounded-xl px-4 bg-red-700"
                                }
                              >
                                {barber.is_active ? "Present" : "Absent"}
                              </span>
                            </span>
                          )}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-[9px] font-medium ${getStatusBadgeColor(
                          barber.queue_info.current_status
                        )}`}
                      >
                        {barber.queue_info.current_status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <div className="flex items-center">
                        <UsersIcon className="h-4 w-4 mr-1 text-[#cb3a1e]" />
                        <span>
                          Queue: {barber.queue_info.total_people_in_queue}
                        </span>
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
                <p
                  className="text-sm text-blue-500 text-center mt-3 cursor-pointer"
                  onClick={() => toggleStylistsExpansion(shop.shop_id)}
                >
                  {expandedStylistsShopId === shop.shop_id
                    ? "Show Less"
                    : `+${shop.barbers.length - 2} more stylists`}
                </p>
              )}
            </>
          ) : (
            <p className="text-gray-500 text-sm">No stylists available</p>
          )}
        </div>
      </div>

      {/* Queue Button */}
      <div className="px-6 pb-6">
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
              <svg
                className="animate-spin h-5 w-5 text-white mr-3"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span className="tracking-wider uppercase">Loading Queue…</span>
            </>
          ) : shop.is_active ? (
            <>
              <ClockIcon className="h-5 w-5 mr-2" />
              View Live Queue
            </>
          ) : (
            <>
              <XCircleIcon className="h-5 w-5 mr-2" />
              Closed
            </>
          )}
        </button>
      </div>
    </div>
  );

}
