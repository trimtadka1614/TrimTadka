// components/AdCard.jsx
"use client";

import Image from 'next/image';
import { useState } from 'react';
import { PlayCircleIcon, PauseIcon } from '@heroicons/react/24/outline';

export default function AdCard({ ad, onClick }) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);

  const handleVideoPlay = () => {
    setIsVideoPlaying(true);
  };

  const handleVideoPause = () => {
    setIsVideoPlaying(false);
  };

  const handleVideoError = () => {
    setVideoError(true);
    console.error('Video failed to load:', ad.video_url);
  };

  return (
    <div
      className="bg-white rounded-xl shadow-lg p-4 cursor-pointer hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 relative overflow-hidden border border-gray-200"
      onClick={onClick}
    >
      {/* Ad Badge - Enhanced Styling */}
      <span className="absolute top-3 left-3 bg-gradient-to-r from-blue-700 to-blue-500 text-white text-xs font-bold px-4 py-1 rounded-full z-10 shadow-lg tracking-wider transform -rotate-3 origin-top-left">
        ADVERTISEMENT
      </span>

      <div className="relative h-[400px] w-full mb-4 rounded-lg overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
        {/* Image Display */}
        {ad.image_url && !ad.video_url && (
          <Image
            src={ad.image_url}
            alt={ad.title}
            fill
            style={{ objectFit: 'contain' }}
            className="rounded-lg transition-transform duration-300 hover:scale-105"
            onError={(e) => {
              console.error('Image failed to load:', ad.image_url);
              e.target.style.display = 'none';
            }}
          />
        )}

        {/* Video Display */}
        {ad.video_url && !videoError && (
          <div className="relative w-full h-full">
            <video
              src={ad.video_url}
              className="w-full h-full object-contain rounded-lg"
              autoPlay
              loop
              muted
              playsInline
              onLoadedData={() => setIsVideoLoaded(true)}
              onPlay={handleVideoPlay}
              onPause={handleVideoPause}
              onError={handleVideoError}
              preload="metadata"
            />
            
            {/* Video Loading Indicator */}
            {!isVideoLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg">
                <div className="flex flex-col items-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-2"></div>
                  <span className="text-xs text-gray-500 font-medium">LOADING...</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Video Error Fallback */}
        {ad.video_url && videoError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg">
            <div className="text-center p-4">
              <div className="text-red-500 text-2xl mb-2">⚠️</div>
              <p className="text-xs text-gray-600 font-medium">UNAVAILABLE</p>
            </div>
          </div>
        )}

        {/* No Media Fallback */}
        {!ad.image_url && !ad.video_url && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg">
            <div className="text-center p-4">
              <div className="text-gray-400 text-2xl mb-2">📱</div>
              <p className="text-xs text-gray-500 font-medium">NO MEDIA</p>
            </div>
          </div>
        )}
      </div>

      {/* Ad Content */}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold uppercase text-gray-900 tracking-wider text-shadow-sm line-clamp-2">
          {ad.title}
        </h3>
        <p className="text-sm text-gray-600 uppercase font-medium">
          FROM <span className="text-[#cb3a1e] font-bold">{ad.shop_name}</span>
        </p>
      </div>

      <style jsx>{`
        .text-shadow-sm {
          text-shadow: 0px 1px 2px rgba(0, 0, 0, 0.1);
        }
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
