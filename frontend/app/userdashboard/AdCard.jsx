// components/AdCard.jsx
"use client";

import Image from 'next/image';

export default function AdCard({ ad, onClick }) {
  return (
    <div
      className="bg-white rounded-xl shadow-lg p-4 cursor-pointer hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden border border-gray-200" // Added subtle border
      onClick={onClick}
    >
      {/* Ad Badge - Enhanced Styling */}
      <span className="absolute top-3 left-3 bg-gradient-to-r from-blue-700 to-blue-500 text-white text-xs font-bold px-4 py-1 rounded-full z-10 shadow-lg tracking-wider transform -rotate-3 origin-top-left">
        ADVERTISEMENT
      </span>

      <div className="relative h-150 w-full mb-4 rounded-lg overflow-hidden"> {/* Increased height for better visual impact */}
        {ad.image_url && (
          <>
            <Image
              src={ad.image_url}
              alt={ad.title}
              fill
              style={{ objectFit: 'cover' }} // Use cover to fill the container
              className="rounded-lg transition-transform duration-300 hover:scale-105"
            />
            
          </>
        )}
      </div>
      <h3 className="text-sm font-semibold uppercase text-gray-900 tracking-wider mb-1 text-shadow-sm">
        {ad.title}
      </h3>
      <p className="text-sm text-gray-600 uppercase font-medium">
        FROM <span className="text-[#cb3a1e] font-bold">{ad.shop_name}</span>
      </p>
      <style jsx>{`
        .text-shadow-sm {
          text-shadow: 0px 1px 2px rgba(0, 0, 0, 0.1);
        }
      `}</style>
    </div>
  );
}
