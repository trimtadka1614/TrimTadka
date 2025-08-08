// components/ShopDetailsModal.jsx
"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  BuildingStorefrontIcon,
  MapPinIcon,
  PhoneIcon,
  ClockIcon,
  UsersIcon,
  UserCircleIcon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckCircleIcon,
  ScissorsIcon, // For services
  CurrencyRupeeIcon, // For price
  HourglassIcon, // For queue position
  WifiIcon, // For join queue button when active
  ExclamationCircleIcon, // For "No services" or "No stylists" messages
} from "@heroicons/react/24/outline";

// Helper function for status badge color with professional tones
const getStatusBadgeColor = (status) => {
  switch (status) {
    case 'Available':
      return 'bg-emerald-600 text-white shadow-sm border border-emerald-700'; // Deeper emerald
    case 'Serving':
      return 'bg-amber-600 text-white shadow-sm border border-amber-700'; // Deeper amber
    case 'Ready for next customer':
      return 'bg-blue-600 text-white shadow-sm border border-blue-700'; // Deeper blue
    default:
      return 'bg-amber-600 text-white shadow-sm border border-amber-700'; // Deeper slate
  }
};

export default function ShopDetailsModal({
  shopDetails,
  onClose,
  isFetchingShopDetails,
  openBarberId,
  setOpenBarberId,
  handleJoinQueueClick,
  activeBooking
}) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Auto-scroll images with smooth transition
  useEffect(() => {
    if (!shopDetails || !shopDetails.image_url || shopDetails.image_url.length <= 1) {
      return;
    }
    const interval = setInterval(() => {
      setCurrentImageIndex(
        (prevIndex) => (prevIndex + 1) % shopDetails.image_url.length
      );
    }, 2000); // Slower transition for better viewing
    return () => clearInterval(interval);
  }, [shopDetails]);

  if (!shopDetails) return null;

  const hasImages = shopDetails.image_url && shopDetails.image_url.length > 0;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-0 md:p-4 animate-fade-in">
      <div className="bg-white rounded-none md:rounded-xl shadow-2xl w-full h-full md:max-w-4xl md:max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 animate-scale-up"> {/* Reduced max-w and max-h for a more compact feel */}
        
        {/* Enhanced Modal Header */}
        <div className="relative bg-gradient-to-r from-slate-50 to-white border-b border-gray-200 p-4 flex items-center justify-between shadow-sm"> {/* Reduced padding */}
          <div className="flex items-center space-x-2"> {/* Reduced space-x */}
            <div className="p-1.5 bg-gradient-to-br from-[#cb3a1e] to-red-600 rounded-lg shadow-md"> {/* Reduced padding and roundedness */}
              <BuildingStorefrontIcon className="h-5 w-5 text-white" /> {/* Reduced icon size */}
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 tracking-tight uppercase"> {/* Reduced font size */}
                {shopDetails.shop_name}
              </h2>
              {/* Removed "Professional Styling Services" line */}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-all duration-200"
            aria-label="Close modal"
          >
            <XMarkIcon className="h-5 w-5" /> {/* Reduced icon size */}
          </button>
        </div>

        {/* Loading State with Premium Design */}
        {isFetchingShopDetails ? (
          <div className="flex flex-col items-center justify-center flex-grow py-12 bg-gradient-to-br from-gray-50 to-white"> {/* Reduced padding */}
            <div className="relative">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-red-100 border-t-red-500 shadow-lg"></div> {/* Reduced size */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-r from-red-50 to-transparent opacity-20"></div>
            </div>
            <div className="mt-4 text-center"> {/* Reduced margin-top */}
              <p className="text-lg font-semibold text-gray-700 mb-1 uppercase tracking-wider">Loading Shop Details</p> {/* Reduced font size and margin-bottom */}
              <p className="text-sm text-gray-500 uppercase tracking-wider">Getting real-time queue information...</p>
            </div>
          </div>
        ) : (
          <div className="flex-grow overflow-y-auto bg-gray-50">
            
            {/* Enhanced Shop Images Section */}
            {hasImages && (
              <div className="relative w-full h-64 md:h-72 overflow-hidden bg-gray-900"> {/* Reduced height */}
                {shopDetails.image_url.map((url, index) => (
                  <Image
                    key={index}
                    src={url}
                    alt={`${shopDetails.shop_name} image ${index + 1}`}
                    fill
                    style={{ objectFit: 'cover' }}
                    className={`absolute inset-0 transition-all duration-1000 ${
                      index === currentImageIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
                    }`}
                  />
                ))}
                
                {/* Enhanced Overlay (Removed stars and "Premium Salon") */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent">
                  <div className="absolute bottom-0 left-0 right-0 p-4"> {/* Reduced padding */}
                    <h3 className="text-xl md:text-2xl font-bold tracking-wider uppercase drop-shadow-lg"> {/* Reduced font size */}
                      {shopDetails.shop_name}
                    </h3>
                  </div>
                </div>

                {/* Image Indicators */}
                {shopDetails.image_url.length > 1 && (
                  <div className="absolute bottom-3 right-3 flex space-x-1.5"> {/* Reduced spacing and position */}
                    {shopDetails.image_url.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                          index === currentImageIndex ? 'bg-white' : 'bg-white/50'
                        }`}
                        aria-label={`View image ${index + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Enhanced Shop Details Section */}
            <div className="p-4 md:p-6 bg-white"> {/* Reduced padding */}
              
              {/* Contact Information Card */}
              <div className=" p-2 mb-4 "> {/* Reduced padding, roundedness, margin-bottom */}
               
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3"> {/* Reduced gap */}
                  <div className="flex items-start space-x-2"> {/* Reduced space-x */}
                    <div className="p-1.5 bg-blue-100 rounded-md"> {/* Reduced padding and roundedness */}
                      <MapPinIcon className="h-3.5 w-3.5 text-blue-600" /> {/* Reduced icon size */}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Address</p> {/* Reduced font size */}
                      <p className="text-xs text-gray-900 font-medium uppercase tracking-wider">{shopDetails.location.address}</p> {/* Reduced font size */}
                    </div>
                  </div>
                  <div className="flex items-start space-x-2"> {/* Reduced space-x */}
                    <div className="p-1.5 bg-green-100 rounded-md"> {/* Reduced padding and roundedness */}
                      <PhoneIcon className="h-3.5 w-3.5 text-green-600" /> {/* Reduced icon size */}
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</p> {/* Reduced font size */}
                      <p className="text-xs text-gray-900 font-medium uppercase tracking-wider">{shopDetails.ph_number}</p> {/* Reduced font size */}
                    </div>
                  </div>
                </div>
              </div>

              {/* Enhanced Stylists Section */}
              <div className="mb-4"> {/* Reduced margin-bottom */}
                <div className="flex items-center justify-between mb-4 border-b pb-2 border-gray-200"> {/* Reduced margin-bottom and padding-bottom */}
                  <h3 className="text-sm font-bold text-gray-900 tracking-wider uppercase"> {/* Reduced font size */}
                    Our Professional Stylists
                  </h3>
                  <div className="text-xs text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full uppercase tracking-wider"> {/* Reduced padding and font size */}
                    {shopDetails.barbers?.filter(b => b.is_active).length || 0} Available
                  </div>
                </div>

                {shopDetails.barbers && shopDetails.barbers.length > 0 ? (
                  <div className="space-y-3 "> {/* Reduced space-y */}
                    {shopDetails.barbers.map((barber) => (
                      <div
                        key={barber.emp_id}
                        className={`bg-white border-2 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 ${ /* Reduced roundedness, shadow hover */
                          barber.is_active 
                            ? 'border-gray-200 hover:border-[#cb3a1e]'
                            : 'border-gray-100 opacity-60'
                        }`}
                      >
                        
                        {/* Barber Header */}
                        <button
                          className={`flex justify-between items-center w-full text-left p-4 transition-all duration-200 ${ /* Reduced padding */
                            barber.is_active 
                              ? 'hover:bg-gray-50' 
                              : 'cursor-not-allowed'
                          }`}
                          onClick={() => {
                            if (barber.is_active) {
                              setOpenBarberId(
                                openBarberId === barber.emp_id ? null : barber.emp_id
                              );
                            }
                          }}
                          disabled={!barber.is_active}
                        >
                          <div className="flex items-center space-x-3"> {/* Reduced space-x */}
                            <div className={`p-2 rounded-lg ${ /* Reduced padding and roundedness */
                              barber.is_active ? 'bg-gradient-to-br from-blue-100 to-blue-200' : 'bg-gray-100'
                            }`}>
                              <UserCircleIcon className={`h-5 w-5 ${ /* Reduced icon size */
                                barber.is_active ? 'text-blue-600' : 'text-gray-400'
                              }`} />
                            </div>
                            <div>
                              <h4 className=" font-bold text-gray-900 tracking-wider uppercase text-sm"> {/* Reduced font size */}
                                {barber.emp_name}
                              </h4>
                              <div className="flex items-center space-x-2 mt-0.5"> {/* Reduced spacing and margin-top */}
                                {barber.is_active ? (
                                  <>
                                    <span className={`px-1.5 py-0.5  rounded-full text-xs font-semibold ${getStatusBadgeColor(barber.queue_info.current_status)} uppercase tracking-wider`}> {/* Reduced padding and font size */}
                                      {barber.queue_info.current_status}
                                    </span>
                                    <span className="text-xs text-gray-500 uppercase tracking-wider"> {/* Reduced font size */}
                                      {barber.queue_info.total_people_in_queue} in queue
                                    </span>
                                  </>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200 uppercase tracking-wider"> {/* Reduced padding and font size */}
                                    Currently Unavailable
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {barber.is_active && (
                            <div className="flex items-center space-x-1.5"> {/* Reduced space-x */}
                              {openBarberId === barber.emp_id ? (
                                <ChevronUpIcon className="h-4 w-4 text-gray-400" /> 
                              ) : (
                                <ChevronDownIcon className="h-4 w-4 text-gray-400" /> 
                              )}
                            </div>
                          )}
                        </button>

                        {/* Expanded Barber Details */}
                        {openBarberId === barber.emp_id && barber.is_active && (
                          <div className="border-t border-gray-100 bg-gradient-to-br from-gray-50 to-white">
                            
                            {/* Queue Stats - Now side-by-side */}
                            <div className="p-4 pb-3"> {/* Reduced padding */}
                          <div className="flex justify-between items-stretch gap-3 mb-4">
  {/* Total in Queue */}
  <div className="flex-1 flex flex-col items-center bg-white px-4 py-3 rounded-xl border border-blue-200 text-center shadow-sm ">
    <UsersIcon className="h-5 w-5 text-blue-600 mb-1" />
    <p className="text-lg font-bold text-blue-600 uppercase tracking-wide">
      {barber.queue_info.total_people_in_queue}
    </p>
    <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">
      In Queue
    </p>
  </div>

  {/* Estimated Wait */}
  <div className="flex-1 flex flex-col items-center bg-white px-4 py-3 rounded-xl border border-orange-200 text-center shadow-sm ">
    <ClockIcon className="h-5 w-5 text-orange-600 mb-1" />
    <p className="text-base font-bold text-orange-600 uppercase tracking-wide">
      {barber.queue_info.estimated_wait_time}
    </p>
    <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">
      Est. Wait
    </p>
  </div>

  {/* Your Position */}
  {barber.queue_info.your_queue_position !== undefined &&
    barber.queue_info.your_queue_position !== null && (
      <div className="flex-1 flex flex-col items-center bg-white px-4 py-3 rounded-xl border border-purple-200 text-center shadow-sm min-h-[110px]">
        <HourglassIcon className="h-5 w-5 text-purple-600 mb-1" />
        <p className="text-lg font-bold text-purple-600 uppercase tracking-wide">
          {barber.queue_info.your_queue_position}
        </p>
        <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wide">
          Your Position
        </p>
      </div>
    )}
</div>

                            </div>

                            {/* Services Section */}
                            <div className="px-4 pb-4"> {/* Reduced padding */}
                              <h5 className="text-base font-semibold text-gray-900 mb-3 flex items-center uppercase tracking-wider"> {/* Reduced font size and margin-bottom */}
                                <ScissorsIcon className="h-4 w-4 mr-2 text-gray-600" /> {/* Reduced icon size */}
                                Services by {barber.emp_name}
                              </h5>
                              
                              {barber.services && barber.services.length > 0 ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 mb-4"> {/* Reduced gap and margin-bottom */}
                                  {barber.services.map((service) => (
                                    <div
                                      key={service.service_id}
                                      className="bg-white p-3 rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all duration-200 shadow-sm" 
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center space-x-2"> {/* Reduced space-x */}
                                          <div className="p-1.5 bg-gray-100 rounded-md"> {/* Reduced padding and roundedness */}
                                            <ScissorsIcon className="h-3.5 w-3.5 text-gray-600" /> {/* Reduced icon size */}
                                          </div>
                                          <div>
                                            <p className="font-semibold text-gray-900 uppercase tracking-wider text-sm"> {/* Reduced font size */}
                                              {service.service_name}
                                            </p>
                                            <p className="text-xs text-gray-500 uppercase tracking-wider"> {/* Reduced font size */}
                                              {service.service_duration_minutes} minutes
                                            </p>
                                          </div>
                                        </div>
                                        {service.price && (
                                          <div className="flex items-center text-green-600 font-bold uppercase tracking-wider text-sm"> {/* Reduced font size */}
                                            <CurrencyRupeeIcon className="h-3.5 w-3.5 mr-0.5" /> {/* Reduced icon size */}
                                            {service.price}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="text-center py-6 bg-white rounded-lg border border-gray-200 shadow-sm"> {/* Reduced padding and roundedness */}
                                  <ExclamationCircleIcon className="h-7 w-7 text-gray-400 mx-auto mb-2" /> {/* Reduced icon size */}
                                  <p className="text-sm text-gray-500 uppercase tracking-wider">No services listed for this stylist</p> {/* Reduced font size */}
                                </div>
                              )}

                              {/* Enhanced Join Queue Button */}
                              <div className="text-center">
                                <button
                                  className={`inline-flex items-center px-6 py-3 rounded-xl font-bold text-base transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 ${ /* Reduced padding, roundedness, font size */
                                    activeBooking
                                      ? "bg-gradient-to-r from-red-500 to-red-600 text-white cursor-not-allowed opacity-75" 
                                      : "bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700"
                                  } uppercase tracking-wider`}
                                  onClick={() => handleJoinQueueClick(barber)}
                                  disabled={activeBooking !== null}
                                >
                                  {activeBooking ? (
                                    <>
                                      <CheckCircleIcon className="h-5 w-5 mr-2.5" /> {/* Reduced icon size and margin */}
                                      Already Booked
                                    </>
                                  ) : (
                                    <>
                                      <WifiIcon className="h-5 w-5 mr-2.5" /> {/* Reduced icon size and margin */}
                                      Join Queue Now
                                    </>
                                  )}
                                </button>

                                {activeBooking && (
                                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg shadow-sm"> {/* Reduced padding, roundedness, margin-top */}
                                    <p className="text-xs text-red-700 font-medium uppercase tracking-wider"> {/* Reduced font size */}
                                      You have an active booking. Please complete your current appointment before booking another.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-white rounded-xl border border-gray-200 shadow-lg"> {/* Reduced padding and roundedness */}
                    <UserCircleIcon className="h-10 w-10 text-gray-400 mx-auto mb-3" /> {/* Reduced icon size and margin-bottom */}
                    <h4 className="text-base font-semibold text-gray-900 mb-1.5 uppercase tracking-wider">No Stylists Available</h4> {/* Reduced font size and margin-bottom */}
                    <p className="text-sm text-gray-500 uppercase tracking-wider">Please check back later or contact the shop directly.</p> {/* Reduced font size */}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

