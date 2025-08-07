"use client";
import { useState, useEffect } from "react";
import Image from "next/image";

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c * 1.2;
}

export default function ShopBanners({ shops, userLocation, scrollToShop }) {
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [fade, setFade] = useState(true);

  const allBanners = shops
    .filter((shop) => {
      const isSubscribed = shop.is_subscribed;
      const hasBanners = shop.banners && shop.banners.length > 0;
      let withinDistance = true;
      const hasUserLocation =
        userLocation && userLocation.lat && userLocation.long;
      const hasShopCoordinates =
        shop.location &&
        shop.location.coordinates &&
        shop.location.coordinates.lat &&
        shop.location.coordinates.long;

      if (hasUserLocation && hasShopCoordinates) {
        const distance = haversineDistance(
          userLocation.lat,
          userLocation.long,
          shop.location.coordinates.lat,
          shop.location.coordinates.long
        );
        withinDistance = distance <= 4;
      }
      return isSubscribed && hasBanners && withinDistance;
    })
    .flatMap((shop) =>
      shop.banners.map((banner) => ({
        ...banner,
        shop_id: shop.shop_id,
        shop_name: shop.shop_name,
      }))
    );

  useEffect(() => {
    if (allBanners.length > 0) {
      const interval = setInterval(() => {
        setFade(false); // start fade out
        setTimeout(() => {
          setCurrentBannerIndex(
            (prevIndex) => (prevIndex + 1) % allBanners.length
          );
          setFade(true); // fade in after image changes
        }, 300); // fade-out duration
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [allBanners.length]);

  if (allBanners.length === 0) return null;

  const currentBanner = allBanners[currentBannerIndex];

  return (
    <div className="px-4">
      {/* Section Title */}
    
      <div className="flex justify-center items-center gap-4 text-center mb-2">
         
        <div className="flex-grow border-t border-[#cb3a1e]"></div>
        <h2 className="text-sm font-bold text-[#cb3a1e] tracking-wide uppercase">
          CELEBRATE Exclusive Launch Offers
        </h2>
        <div className="flex-grow border-t border-[#cb3a1e]"></div>
      </div>

      {/* Banner Container */}
      <div
        className="relative w-full h-48 md:h-56 rounded-2xl overflow-hidden shadow-lg cursor-pointer"
        onClick={() => scrollToShop(currentBanner.shop_id)}
      >
        <div
          className={`absolute inset-0 transition-opacity duration-500 ${
            fade ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            key={currentBanner.image_url}
            src={currentBanner.image_url}
            alt={`${currentBanner.shop_name} banner`}
            fill
            priority
            style={{ objectFit: "cover" }}
            className="rounded-xl"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/0 flex flex-col justify-end p-4">
            <h3 className="text-white text-lg font-semibold uppercase tracking-wider">
              {currentBanner.shop_name}
            </h3>
            <p className="text-gray-200 text-[12px] uppercase tracking-wider">
              Tap to explore exclusive deals
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}