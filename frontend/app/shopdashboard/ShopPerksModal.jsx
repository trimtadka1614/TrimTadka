"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
} from "@heroicons/react/24/outline";
import {
  Loader,
  CheckCircle,
  AlertCircle,
  Image as ImageIcon, // Renamed to avoid conflict with native Image constructor
  Video,
  Tag,
  Ban,
  UploadCloud,
  LayoutDashboard,
} from "lucide-react";

// API endpoints - ENSURE THESE MATCH YOUR BACKEND AND CLOUDINARY CONFIG
const API_BASE_URL = "https://trim-tadka-backend-phi.vercel.app";
const CLOUDINARY_UPLOAD_IMAGE_URL =
  "https://api.cloudinary.com/v1_1/db3kzpzi3/image/upload";
const CLOUDINARY_UPLOAD_VIDEO_URL =
  "https://api.cloudinary.com/v1_1/db3kzpzi3/video/upload";
const CLOUDINARY_UPLOAD_PRESET = "trimtadka"; // Replace with your Cloudinary Upload Preset

/**
 * Shop Perks Management Modal: Ads, Banners, Offers.
 * Includes its own trigger button and conditional rendering based on subscription.
 * Provides a highly user-friendly UI with clear instructions, responsive design,
 * and visually appealing elements.
 *
 * @param {object} props - The component props.
 * @param {number} props.shopId - The ID of the shop.
 */
const ShopPerksModal = ({ shopId }) => {
  const [showModal, setShowModal] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(true); // Default to true for dev
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ads, setAds] = useState([]);
  const [banners, setBanners] = useState([]);
  const [offers, setOffers] = useState([]);
  const [uploading, setUploading] = useState(false); // General state for any ongoing upload/backend call

  // State for new ad inputs
  const [newAdTitle, setNewAdTitle] = useState("");
  const [newAdFile, setNewAdFile] = useState(null);
  const [newAdMediaType, setNewAdMediaType] = useState("image"); // 'image' or 'video'

  // State for new banner inputs
  const [newBannerFile, setNewBannerFile] = useState(null);

  // State for new offer inputs
  const [newOfferTitle, setNewOfferTitle] = useState("");
  const [newOfferDiscount, setNewOfferDiscount] = useState("");

  // State for update forms (to be shown conditionally)
  const [editingAd, setEditingAd] = useState(null); // { index, oldUrl, newTitle, newFile, newMediaType, currentMediaUrl }
  const [editingBanner, setEditingBanner] = useState(null); // { index, oldUrl, newFile }
  const [editingOffer, setEditingOffer] = useState(null); // { index, oldTitle, newTitle, newDiscount }

  /**
   * Opens the modal and triggers fetching of shop perks.
   */
  const handleOpenModal = useCallback(() => {
    setShowModal(true);
  }, []);

  /**
   * Closes the modal and resets all input/editing states.
   */
  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setNewAdTitle("");
    setNewAdFile(null);
    setNewAdMediaType("image");
    setNewBannerFile(null);
    setNewOfferTitle("");
    setNewOfferDiscount("");
    setEditingAd(null);
    setEditingBanner(null);
    setEditingOffer(null);
    setError(null); // Clear any previous errors
  }, []);

  /**
   * Fetches shop perks (ads, banners, offers) from the backend.
   */
  const fetchShopPerks = useCallback(async () => {
    if (!shopId) {
      setError("SHOP ID IS MISSING.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const shopResponse = await fetch(`${API_BASE_URL}/shops/${shopId}`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!shopResponse.ok) {
        const errorText = await shopResponse.text();
        throw new Error(`FAILED TO FETCH SHOP DETAILS: ${errorText}`);
      }

      const shopData = await shopResponse.json();
      setIsSubscribed(shopData.is_subscribed || false);

      if (shopData.is_subscribed) {
        setAds(Array.isArray(shopData.ads) ? shopData.ads : []);
        setBanners(Array.isArray(shopData.banners) ? shopData.banners : []);
        setOffers(Array.isArray(shopData.offers) ? shopData.offers : []);
      } else {
        // If not subscribed, clear any existing perks
        setAds([]);
        setBanners([]);
        setOffers([]);
      }
    } catch (err) {
      console.error("ERROR FETCHING SHOP PERKS:", err);
      setError(err.message || "FAILED TO LOAD SHOP PERKS.");
      toast.error(err.message || "ERROR LOADING SHOP PERKS.");
    } finally {
      setIsLoading(false);
    }
  }, [shopId]);

  // Effect to fetch perks when modal opens or shopId changes
  useEffect(() => {
    if (showModal && shopId) {
      fetchShopPerks();
    }
  }, [showModal, shopId, fetchShopPerks]);

  /**
   * Helper function to upload a file to Cloudinary with validation.
   * @param {File} file - The file to upload.
   * @param {string|null} requiredOrientation - 'portrait' for ads, 'landscape' for banners, null otherwise.
   * @returns {Promise<string|null>} - The secure URL of the uploaded file, or null if upload fails.
   */
  const uploadFileToCloudinary = async (file, requiredOrientation = null) => {
    if (!file) return null;

    const IMAGE_MAX_SIZE = 2 * 1024 * 1024; // 2MB
    const VIDEO_MAX_SIZE = 10 * 1024 * 1024; // 10MB

    // Validate file size and type
    if (file.type.startsWith("image/")) {
      if (file.size > IMAGE_MAX_SIZE) {
        toast.error("IMAGE FILE SIZE MUST BE UNDER 2MB.");
        return null;
      }
      const allowedImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/jpg"];
      if (!allowedImageTypes.includes(file.type)) {
        toast.error("UNSUPPORTED IMAGE FORMAT. USE JPEG, PNG, GIF, OR WEBP.");
        return null;
      }
    } else if (file.type.startsWith("video/")) {
      if (file.size > VIDEO_MAX_SIZE) {
        toast.error("VIDEO FILE SIZE MUST BE UNDER 10MB.");
        return null;
      }
      const allowedVideoTypes = ["video/mp4", "video/webm", "video/mov", "video/avi", "video/quicktime"];
      if (!allowedVideoTypes.includes(file.type)) {
        toast.error("UNSUPPORTED VIDEO FORMAT. USE MP4, WEBM, MOV, OR AVI.");
        return null;
      }
    } else {
      toast.error("UNSUPPORTED FILE TYPE. PLEASE SELECT AN IMAGE OR VIDEO.");
      return null;
    }

    // Check image orientation if it's an image file and an orientation is required
    if (file.type.startsWith("image/") && requiredOrientation) {
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(file);
      try {
        await new Promise((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = (e) =>
            reject(new Error("FAILED TO LOAD IMAGE FOR DIMENSION CHECK."));
          img.src = objectUrl;
        });

        const { width, height } = img;
        URL.revokeObjectURL(objectUrl); // Clean up the object URL immediately

        if (requiredOrientation === "portrait" && width >= height) {
          toast.error("ADS IMAGES MUST BE PORTRAIT ORIENTATION (HEIGHT > WIDTH).");
          return null;
        }
        if (requiredOrientation === "landscape" && height >= width) {
          toast.error("BANNERS IMAGES MUST BE LANDSCAPE ORIENTATION (WIDTH > HEIGHT).");
          return null;
        }
      } catch (err) {
        toast.error(err.message);
        URL.revokeObjectURL(objectUrl); // Ensure cleanup on error too
        return null;
      }
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const uploadUrl = file.type.startsWith("video/")
      ? CLOUDINARY_UPLOAD_VIDEO_URL
      : CLOUDINARY_UPLOAD_IMAGE_URL;

    // Add resource_type for videos if needed by Cloudinary setup
    if (file.type.startsWith("video/")) {
      formData.append("resource_type", "video");
    }

    try {
      const res = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        console.error("CLOUDINARY ERROR:", errorData);
        throw new Error(
          `CLOUDINARY UPLOAD FAILED: ${errorData.error?.message || res.statusText}`
        );
      }

      const data = await res.json();
      if (!data.secure_url) {
        throw new Error("CLOUDINARY UPLOAD FAILED - NO URL RETURNED.");
      }
      return data.secure_url;
    } catch (err) {
      console.error("UPLOAD ERROR:", err);
      toast.error(`FAILED TO UPLOAD MEDIA: ${err.message}`);
      return null;
    }
  };

  // --- ADS MANAGEMENT ---
  const handleAddAd = async () => {
    if (!newAdTitle.trim() || !newAdFile) {
      toast.error("PLEASE PROVIDE AD TITLE AND SELECT A FILE.");
      return;
    }
    if (ads.length >= 2) {
      toast.error("MAXIMUM 2 ADS ALLOWED.");
      return;
    }

    setUploading(true);
    const mediaUrl = await uploadFileToCloudinary(
      newAdFile,
      newAdMediaType === "image" ? "portrait" : null
    );

    if (!mediaUrl) {
      setUploading(false);
      return;
    }

    try {
      const payload = {
        operation: "add",
        data: {
          title: newAdTitle.trim(),
          ...(newAdMediaType === "image" && { image_url: mediaUrl }),
          ...(newAdMediaType === "video" && { video_url: mediaUrl }),
        },
      };

      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/ads`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "FAILED TO ADD AD.");
      }

      const data = await response.json();
      setAds(data.ads || []);
      toast.success(data.message || "AD ADDED SUCCESSFULLY!");
      setNewAdTitle("");
      setNewAdFile(null);
      setNewAdMediaType("image");
    } catch (err) {
      console.error("ADD AD ERROR:", err);
      toast.error(err.message || "FAILED TO ADD AD.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAd = async (urlToRemove) => {
    setUploading(true);
    try {
      const payload = { operation: "remove", data: { url_to_remove: urlToRemove } };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/ads`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "FAILED TO REMOVE AD.");
      }
      const data = await response.json();
      setAds(data.ads || []);
      toast.success(data.message || "AD REMOVED SUCCESSFULLY!");
    } catch (err) {
      console.error("REMOVE AD ERROR:", err);
      toast.error(err.message || "FAILED TO REMOVE AD.");
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateAd = async () => {
    if (!editingAd || !editingAd.newTitle.trim()) {
      toast.error("PLEASE PROVIDE A NEW TITLE FOR THE AD.");
      return;
    }

    setUploading(true);
    let newMediaUrl = editingAd.currentMediaUrl; // Default to current URL if no new file
    if (editingAd.newFile) {
      newMediaUrl = await uploadFileToCloudinary(
        editingAd.newFile,
        editingAd.newMediaType === "image" ? "portrait" : null
      );
      if (!newMediaUrl) {
        setUploading(false);
        return;
      }
    } else if (!editingAd.currentMediaUrl) {
      toast.error("PLEASE UPLOAD NEW MEDIA OR ENSURE EXISTING MEDIA IS PRESENT.");
      setUploading(false);
      return;
    }

    try {
      const payload = {
        operation: "update",
        data: {
          old_url: editingAd.oldUrl, // This is the unique identifier for the ad
          new_title: editingAd.newTitle.trim(),
          ...(editingAd.newMediaType === "image" && { new_image_url: newMediaUrl }),
          ...(editingAd.newMediaType === "video" && { new_video_url: newMediaUrl }),
        },
      };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/ads`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "FAILED TO UPDATE AD.");
      }
      const data = await response.json();
      setAds(data.ads || []);
      toast.success(data.message || "AD UPDATED SUCCESSFULLY!");
      setEditingAd(null); // Close update form
    } catch (err) {
      console.error("UPDATE AD ERROR:", err);
      toast.error(err.message || "FAILED TO UPDATE AD.");
    } finally {
      setUploading(false);
    }
  };

  // --- BANNERS MANAGEMENT ---
  const handleAddBanner = async () => {
    if (!newBannerFile) {
      toast.error("PLEASE SELECT A BANNER IMAGE.");
      return;
    }
    if (banners.length >= 1) {
      toast.error("MAXIMUM 1 BANNER ALLOWED.");
      return;
    }

    setUploading(true);
    const imageUrl = await uploadFileToCloudinary(newBannerFile, "landscape");
    if (!imageUrl) {
      setUploading(false);
      return;
    }

    try {
      const payload = { operation: "add", data: { image_url: imageUrl } };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/banners`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "FAILED TO ADD BANNER.");
      }
      const data = await response.json();
      setBanners(data.banners || []);
      toast.success(data.message || "BANNER ADDED SUCCESSFULLY!");
      setNewBannerFile(null);
    } catch (err) {
      console.error("ADD BANNER ERROR:", err);
      toast.error(err.message || "FAILED TO ADD BANNER.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveBanner = async (urlToRemove) => {
    setUploading(true);
    try {
      const payload = { operation: "remove", data: { url_to_remove: urlToRemove } };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/banners`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "FAILED TO REMOVE BANNER.");
      }
      const data = await response.json();
      setBanners(data.banners || []);
      toast.success(data.message || "BANNER REMOVED SUCCESSFULLY!");
    } catch (err) {
      console.error("REMOVE BANNER ERROR:", err);
      toast.error(err.message || "FAILED TO REMOVE BANNER.");
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateBanner = async () => {
    if (!editingBanner || !editingBanner.newFile) {
      toast.error("PLEASE SELECT A NEW BANNER IMAGE FOR UPDATE.");
      return;
    }
    setUploading(true);
    const newImageUrl = await uploadFileToCloudinary(editingBanner.newFile, "landscape");
    if (!newImageUrl) {
      setUploading(false);
      return;
    }

    try {
      const payload = {
        operation: "update",
        data: { old_url: editingBanner.oldUrl, new_image_url: newImageUrl },
      };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/banners`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "FAILED TO UPDATE BANNER.");
      }
      const data = await response.json();
      setBanners(data.banners || []);
      toast.success(data.message || "BANNER UPDATED SUCCESSFULLY!");
      setEditingBanner(null); // Close update form
    } catch (err) {
      console.error("UPDATE BANNER ERROR:", err);
      toast.error(err.message || "FAILED TO UPDATE BANNER.");
    } finally {
      setUploading(false);
    }
  };

  // --- OFFERS MANAGEMENT ---
  const handleAddOffer = async () => {
    if (
      !newOfferTitle.trim() ||
      newOfferDiscount === "" ||
      isNaN(newOfferDiscount) ||
      parseInt(newOfferDiscount, 10) < 0 ||
      parseInt(newOfferDiscount, 10) > 100
    ) {
      toast.error("PLEASE PROVIDE A VALID OFFER TITLE AND DISCOUNT (0-100%).");
      return;
    }
    if (offers.length >= 5) {
      toast.error("MAXIMUM 5 OFFERS ALLOWED.");
      return;
    }

    setUploading(true);
    try {
      const payload = {
        operation: "add",
        data: {
          title: newOfferTitle.trim(),
          discount: parseInt(newOfferDiscount, 10),
        },
      };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/offers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "FAILED TO ADD OFFER.");
      }
      const data = await response.json();
      setOffers(data.offers || []);
      toast.success(data.message || "OFFER ADDED SUCCESSFULLY!");
      setNewOfferTitle("");
      setNewOfferDiscount("");
    } catch (err) {
      console.error("ADD OFFER ERROR:", err);
      toast.error(err.message || "FAILED TO ADD OFFER.");
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveOffer = async (titleToRemove) => {
    setUploading(true);
    try {
      const payload = { operation: "remove", data: { title_to_remove: titleToRemove } };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/offers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "FAILED TO REMOVE OFFER.");
      }
      const data = await response.json();
      setOffers(data.offers || []);
      toast.success(data.message || "OFFER REMOVED SUCCESSFULLY!");
    } catch (err) {
      console.error("REMOVE OFFER ERROR:", err);
      toast.error(err.message || "FAILED TO REMOVE OFFER.");
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateOffer = async () => {
    if (
      !editingOffer ||
      !editingOffer.newTitle.trim() ||
      editingOffer.newDiscount === "" ||
      isNaN(editingOffer.newDiscount) ||
      parseInt(editingOffer.newDiscount, 10) < 0 ||
      parseInt(editingOffer.newDiscount, 10) > 100
    ) {
      toast.error("PLEASE PROVIDE A VALID OFFER TITLE AND DISCOUNT (0-100%).");
      return;
    }
    setUploading(true);
    try {
      const payload = {
        operation: "update",
        data: {
          old_title: editingOffer.oldTitle,
          new_title: editingOffer.newTitle.trim(),
          new_discount: parseInt(editingOffer.newDiscount, 10),
        },
      };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/offers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "FAILED TO UPDATE OFFER.");
      }
      const data = await response.json();
      setOffers(data.offers || []);
      toast.success(data.message || "OFFER UPDATED SUCCESSFULLY!");
      setEditingOffer(null); // Close update form
    } catch (err) {
      console.error("UPDATE OFFER ERROR:", err);
      toast.error(err.message || "FAILED TO UPDATE OFFER.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {/* Toast container for notifications */}
      

      {/* The circular trigger button for the modal */}
      <div className="flex flex-col items-center space-y-1">
        <div className="relative flex flex-col items-center">
          <button
            onClick={handleOpenModal}
            className="relative group w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 rounded-full transition-all duration-300 transform hover:scale-105 flex items-center justify-center"
            aria-label="MANAGE PERKS"
          >
            <LayoutDashboard className="h-4 w-4 text-white group-hover:scale-110 transition-transform duration-200" />
          </button>
         
        </div>
      </div>

      {/* The full-page modal, rendered only when showModal is true */}
      {showModal &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-black bg-opacity-70 flex items-center justify-center animate-fade-in font-sans">
            <div className="bg-white w-full h-full md:w-[95%] md:max-w-4xl md:h-[95vh] shadow-2xl flex flex-col animate-scale-up overflow-hidden">
              {/* Modal Header */}
              <div className="sticky top-0 bg-gradient-to-r from-blue-700 to-cyan-800 p-5 flex items-center justify-between shadow-lg z-10">
                <h2 className="text-lg  uppercase tracking-widest font-bold text-white flex items-center">
                  <LayoutDashboard className="h-7 w-7 mr-3 text-blue-200" />
                  MANAGE SHOP PERKS
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="text-white/80 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full focus:outline-none focus:ring-2 focus:ring-white/50"
                  aria-label="CLOSE PERKS MODAL"
                  title="CLOSE"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              {/* Modal Content Area */}
              <div className="overflow-y-auto flex-grow p-4 md:p-6 bg-gray-50">
                {isLoading ? (
                  <div className=" flex flex-col items-center justify-center min-h-screen text-gray-600">
                    <div className="relative">
                      <Loader className="animate-spin mb-4 h-12 w-12 text-blue-500" />
                      <div className="absolute inset-0 h-12 w-12 border-4 border-blue-200 rounded-full animate-ping opacity-75"></div>
                    </div>
                    <p className="text-sm font-semibold uppercase tracking-wider mt-4">
                      LOADING SHOP PERKS...
                    </p>
                  </div>
                ) : error ? (
                  <div className="min-h-[400px] flex flex-col items-center justify-center text-red-600 bg-red-50 rounded-lg border border-red-200 p-8 shadow-inner">
                    <AlertCircle className="mb-4 h-12 w-12 text-red-500" />
                    <p className="text-lg font-bold uppercase tracking-wider text-center mb-4">
                      ERROR LOADING DATA!
                    </p>
                    <p className="text-md text-red-700 uppercase tracking-wide text-center px-4 mb-6">
                      {error}
                    </p>
                    <button
                      onClick={fetchShopPerks}
                      className="px-6 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors uppercase tracking-wider text-sm font-bold shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-75"
                    >
                      RETRY
                    </button>
                  </div>
                ) : (
                  <>
                    {!isSubscribed ? (
                      <div className="min-h-[400px] flex flex-col items-center justify-center text-red-700 bg-red-50 rounded-lg border border-red-200 shadow-inner p-8 text-center">
                        <Ban className="h-16 w-16 mx-auto mb-6 text-red-500 animate-bounce-in" />
                        <p className="text-2xl font-extrabold uppercase tracking-wider mb-4">
                          SUBSCRIPTION REQUIRED!
                        </p>
                        <p className="text-lg text-gray-700 uppercase tracking-wide leading-relaxed">
                          PLEASE SUBSCRIBE TO ACCESS ADS, BANNERS, AND OFFERS
                          MANAGEMENT FEATURES.
                        </p>
                        <p className="text-md text-gray-600 mt-6 uppercase tracking-wide">
                          VISIT THE BILLING SECTION TO UPGRADE YOUR PLAN.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-8 md:space-y-10">
                        {/* ADS SECTION */}
                        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 animate-fade-in-up">
                          <h3 className="text-xl font-bold text-gray-800 uppercase tracking-wide mb-5 pb-2 border-b-2 border-blue-100 flex items-center">
                            <ImageIcon className="h-6 w-6 mr-3 text-blue-500" />
                            ADS ({ads.length}/2)
                          </h3>

                          {ads.length < 2 && (
                            <div className="flex flex-col gap-5 mb-8 p-6 border-2 border-blue-200 rounded-lg bg-blue-50 shadow-inner">
                              <p className="text-sm text-blue-800 font-medium uppercase tracking-wide">
                                ADD A NEW AD:
                              </p>
                              {/* AD TITLE INPUT */}
                              <div className="w-full">
                                <label
                                  htmlFor="newAdTitle"
                                  className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1"
                                >
                                  AD TITLE
                                </label>
                                <input
                                  type="text"
                                  id="newAdTitle"
                                  value={newAdTitle}
                                  onChange={(e) => setNewAdTitle(e.target.value)}
                                  placeholder="ENTER AD TITLE (E.G., SUMMER SALE)"
                                  className="w-full p-3 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 text-black placeholder-gray-400 uppercase tracking-wide"
                                  maxLength={50}
                                />
                                <span className="text-xs text-gray-500 mt-1 block text-right">
                                  {newAdTitle.length}/50 CHARACTERS
                                </span>
                              </div>

                              {/* MEDIA FILE INPUT */}
                              <div className="w-full">
                                <label
                                  htmlFor="newAdFile"
                                  className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2"
                                >
                                  MEDIA (IMAGE/VIDEO)
                                </label>
                                <div className="border-2 border-dashed border-blue-400 rounded-lg p-6 text-center bg-blue-100 hover:bg-blue-200 transition-colors cursor-pointer relative">
                                  <input
                                    type="file"
                                    id="newAdFile"
                                    accept="image/jpeg,image/png,image/gif,image/webp,image/jpg,video/mp4,video/webm,video/mov,video/avi,video/quicktime"
                                    onChange={(e) => {
                                      const file = e.target.files[0];
                                      if (file) {
                                        let isValid = false;
                                        if (file.type.startsWith('image/')) {
                                          isValid = uploadFileToCloudinary(file, 'portrait'); // Pre-validate orientation
                                          if (isValid) setNewAdMediaType('image');
                                        } else if (file.type.startsWith('video/')) {
                                          isValid = uploadFileToCloudinary(file, null); // Video has no orientation
                                          if (isValid) setNewAdMediaType('video');
                                        } else {
                                          toast.error('UNSUPPORTED FILE TYPE. SELECT IMAGE OR VIDEO FILE.');
                                          isValid = false;
                                        }
                                        if (isValid) {
                                          setNewAdFile(file);
                                        } else {
                                          e.target.value = ''; // Clear input if validation fails
                                          setNewAdFile(null);
                                          setNewAdMediaType('image');
                                        }
                                      } else {
                                        setNewAdFile(null);
                                        setNewAdMediaType('image');
                                      }
                                    }}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  />
                                  <UploadCloud className="mx-auto h-8 w-8 text-blue-600 mb-2" />
                                  <p className="text-sm font-semibold text-blue-800 uppercase tracking-wide">
                                    DRAG & DROP OR CLICK TO UPLOAD
                                  </p>
                                  <p className="text-xs text-blue-600 mt-1 uppercase tracking-tight">
                                    (IMAGE OR VIDEO FILE)
                                  </p>
                                </div>

                                {/* Enhanced file info display */}
                                {newAdFile && (
                                  <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col sm:flex-row items-center gap-4">
                                    <div className="flex-shrink-0">
                                      {newAdMediaType === 'image' && (
                                        <img
                                          src={URL.createObjectURL(newAdFile)}
                                          alt="AD PREVIEW"
                                          className="w-20 h-24 object-cover rounded-md border border-gray-300 shadow"
                                          onLoad={(e) => URL.revokeObjectURL(e.target.src)}
                                        />
                                      )}
                                      {newAdMediaType === 'video' && (
                                        <div className="w-20 h-24 bg-black flex items-center justify-center rounded-md border border-gray-300">
                                          <PlayCircleIcon className="h-10 w-10 text-white/70" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex-1 text-center sm:text-left">
                                      <p className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                                        SELECTED: {newAdFile.name}
                                      </p>
                                      <p className="text-xs text-gray-600 uppercase tracking-tight mt-1">
                                        {(newAdFile.size / (1024 * 1024)).toFixed(2)} MB • {newAdMediaType.toUpperCase()}
                                      </p>
                                      <p className="text-xs text-blue-700 uppercase tracking-tight mt-2">
                                        FILE READY FOR UPLOAD.
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* File requirements info */}
                                <div className="mt-4 text-xs text-gray-600 bg-gray-100 p-3 rounded-md border border-gray-200 shadow-inner">
                                  <p className="mb-1 font-semibold uppercase tracking-wide">
                                    REQUIREMENTS:
                                  </p>
                                  <ul className="list-disc list-inside space-y-1">
                                    <li>
                                      <span className="font-medium">IMAGES:</span> PORTRAIT ORIENTATION aspect ratio [2:3 or 4:5 ] • MAX 2MB • JPG, PNG, GIF, WEBP.
                                    </li>
                                    <li>
                                      <span className="font-medium">VIDEOS:</span> PORTRAIT ORIENTATION aspect ratio [2:3 or 4:5 ] • MAX 10MB • MP4, WEBM, MOV, AVI, QUICKTIME.
                                    </li>
                                  </ul>
                                </div>
                              </div>

                              {/* ADD BUTTON */}
                              <div className="w-full">
                                <button
                                  onClick={handleAddAd}
                                  disabled={uploading || ads.length >= 2 || !newAdTitle.trim() || !newAdFile}
                                  className={`w-full px-4 py-3 rounded-md font-bold text-white uppercase tracking-wider text-sm flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg
                                    ${
                                      uploading || ads.length >= 2 || !newAdTitle.trim() || !newAdFile
                                        ? "bg-gray-300 cursor-not-allowed"
                                        : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
                                    }`}
                                >
                                  {uploading ? (
                                    <Loader className="animate-spin h-5 w-5 mr-3" />
                                  ) : (
                                    <PlusIcon className="h-5 w-5 mr-3" />
                                  )}
                                  {uploading ? 'UPLOADING AD...' : 'ADD AD'}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Display Existing Ads */}
                          <p className="text-sm text-gray-700 font-semibold uppercase tracking-wide mb-4">
                            CURRENT ADS:
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {ads.length > 0 ? (
                              ads.map((ad, index) => (
                                <div
                                  key={ad.image_url || ad.video_url || index} // Use URL as key if available
                                  className="relative border border-gray-200 rounded-lg p-4 shadow-sm bg-gray-50 flex flex-col justify-between"
                                >
                                  {editingAd && editingAd.index === index ? (
                                    <div className="space-y-4">
                                      <h4 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                                        EDIT AD
                                      </h4>
                                      {/* Edit Title */}
                                      <div>
                                        <label
                                          htmlFor={`editAdTitle-${index}`}
                                          className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1"
                                        >
                                          NEW TITLE
                                        </label>
                                        <input
                                          type="text"
                                          id={`editAdTitle-${index}`}
                                          value={editingAd.newTitle}
                                          onChange={(e) =>
                                            setEditingAd((prev) => ({
                                              ...prev,
                                              newTitle: e.target.value,
                                            }))
                                          }
                                          className="w-full p-2 border border-gray-300 rounded-md text-sm text-black uppercase tracking-wide"
                                          maxLength={50}
                                        />
                                      </div>
                                      {/* Edit Media */}
                                      <div>
                                        <label
                                          htmlFor={`editAdFile-${index}`}
                                          className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1"
                                        >
                                          NEW MEDIA (OPTIONAL)
                                        </label>
                                        <input
                                          type="file"
                                          id={`editAdFile-${index}`}
                                          accept="image/jpeg,image/png,image/gif,image/webp,image/jpg,video/mp4,video/webm,video/mov,video/avi,video/quicktime"
                                          onChange={(e) => {
                                            const file = e.target.files[0];
                                            if (file) {
                                              let isValid = false;
                                              if (file.type.startsWith('image/')) {
                                                isValid = uploadFileToCloudinary(file, 'portrait');
                                                if (isValid) setEditingAd((prev) => ({ ...prev, newFile: file, newMediaType: 'image' }));
                                              } else if (file.type.startsWith('video/')) {
                                                isValid = uploadFileToCloudinary(file, null);
                                                if (isValid) setEditingAd((prev) => ({ ...prev, newFile: file, newMediaType: 'video' }));
                                              }
                                              if (!isValid) e.target.value = '';
                                            } else {
                                              setEditingAd((prev) => ({ ...prev, newFile: null }));
                                            }
                                          }}
                                          className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                                        />
                                        {editingAd.newFile && (
                                          <div className="mt-2 p-2 bg-gray-100 rounded border border-gray-200">
                                            <p className="text-xs text-gray-600 uppercase tracking-tight">
                                              SELECTED: {editingAd.newFile.name}
                                            </p>
                                            <p className="text-xs text-gray-500 uppercase tracking-tight">
                                              {(editingAd.newFile.size / (1024 * 1024)).toFixed(2)} MB • {editingAd.newMediaType?.toUpperCase()}
                                            </p>
                                          </div>
                                        )}
                                        <div className="mt-2 text-xs text-gray-500 bg-gray-100 p-2 rounded border border-gray-200">
                                            <p className="font-semibold uppercase tracking-wide">FILE REQS (SAME AS ADD):</p>
                                            <ul className="list-disc list-inside space-y-0.5">
                                                <li>IMAGES: PORTRAIT • MAX 2MB</li>
                                                <li>VIDEOS: MAX 10MB</li>
                                            </ul>
                                        </div>
                                      </div>
                                      {/* Edit Buttons */}
                                      <div className="flex justify-end gap-3 mt-4">
                                        <button
                                          onClick={() => setEditingAd(null)}
                                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-xs font-semibold uppercase tracking-wider hover:bg-gray-300 transition-colors shadow-sm"
                                        >
                                          CANCEL
                                        </button>
                                        <button
                                          onClick={handleUpdateAd}
                                          disabled={uploading}
                                          className={`px-4 py-2 rounded-md font-bold text-white uppercase tracking-wider text-xs flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg
                                            ${
                                              uploading
                                                ? "bg-gray-300 cursor-not-allowed"
                                                : "bg-green-600 hover:bg-green-700 active:bg-green-800"
                                            }`}
                                        >
                                          {uploading ? (
                                            <Loader className="animate-spin h-4 w-4 mr-2" />
                                          ) : (
                                            <PencilIcon className="h-4 w-4 mr-2" />
                                          )}
                                          SAVE CHANGES
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <h4 className="font-bold text-gray-900 uppercase tracking-wide mb-3 text-center">
                                        {ad.title}
                                      </h4>

                                      <div className="flex-grow flex items-center justify-center mb-3 bg-gray-200 rounded-md overflow-hidden min-h-[160px] max-h-[200px]">
                                        {/* Display Image */}
                                        {ad.image_url && (
                                          <img
                                            src={ad.image_url}
                                            alt={ad.title}
                                            className="w-full h-full object-contain"
                                          />
                                        )}
                                        {/* Display Video */}
                                        {ad.video_url && (
                                          <video
                                            controls
                                            src={ad.video_url}
                                            className="w-full h-full object-contain bg-black"
                                            preload="metadata"
                                          >
                                            YOUR BROWSER DOES NOT SUPPORT THE VIDEO TAG.
                                          </video>
                                        )}
                                      </div>

                                      {/* Action Buttons */}
                                      <div className="flex justify-end gap-2 mt-4">
                                        <button
                                          onClick={() =>
                                            setEditingAd({
                                              index,
                                              oldUrl: ad.image_url || ad.video_url,
                                              newTitle: ad.title,
                                              currentMediaUrl: ad.image_url || ad.video_url,
                                              newMediaType: ad.image_url ? "image" : "video",
                                              newFile: null,
                                            })
                                          }
                                          className="p-2 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 transition-colors shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                          title="EDIT AD"
                                        >
                                          <PencilIcon className="h-5 w-5" />
                                        </button>
                                        <button
                                          onClick={() => handleRemoveAd(ad.image_url || ad.video_url)}
                                          className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-400"
                                          disabled={uploading}
                                          title="DELETE AD"
                                        >
                                          <TrashIcon className="h-5 w-5" />
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p className="text-md text-gray-500 col-span-full uppercase tracking-wider text-center py-8 bg-gray-100 rounded-lg border border-gray-200 shadow-inner">
                                NO ADS UPLOADED YET. ADD YOUR FIRST AD ABOVE!
                              </p>
                            )}
                          </div>
                        </div>

                        {/* BANNERS SECTION */}
                        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 animate-fade-in-up delay-100">
                          <h3 className="text-xl font-bold text-gray-800 uppercase tracking-wide mb-5 pb-2 border-b-2 border-purple-100 flex items-center">
                            <ImageIcon className="h-6 w-6 mr-3 text-purple-500" />
                            BANNERS ({banners.length}/1)
                          </h3>
                          {banners.length < 1 && (
                            <div className="flex flex-col md:flex-row gap-5 mb-8 p-6 border-2 border-purple-200 rounded-lg bg-purple-50 shadow-inner">
                              <p className="text-sm text-purple-800 font-medium uppercase tracking-wide md:w-1/4">
                                ADD A NEW BANNER:
                              </p>
                              <div className="flex-grow">
                                <label
                                  htmlFor="newBannerFile"
                                  className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2"
                                >
                                  BANNER IMAGE
                                </label>
                                <div className="border-2 border-dashed border-purple-400 rounded-lg p-6 text-center bg-purple-100 hover:bg-purple-200 transition-colors cursor-pointer relative">
                                  <input
                                    type="file"
                                    id="newBannerFile"
                                    accept="image/jpeg,image/png,image/gif,image/webp,image/jpg"
                                    onChange={(e) => {
                                      const file = e.target.files[0];
                                      if (file) {
                                        if (uploadFileToCloudinary(file, 'landscape')) { // Pre-validate orientation
                                          setNewBannerFile(file);
                                        } else {
                                          e.target.value = '';
                                          setNewBannerFile(null);
                                        }
                                      } else {
                                        setNewBannerFile(null);
                                      }
                                    }}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  />
                                  <UploadCloud className="mx-auto h-8 w-8 text-purple-600 mb-2" />
                                  <p className="text-sm font-semibold text-purple-800 uppercase tracking-wide">
                                    DRAG & DROP OR CLICK TO UPLOAD
                                  </p>
                                  <p className="text-xs text-purple-600 mt-1 uppercase tracking-tight">
                                    (IMAGE FILE ONLY)
                                  </p>
                                </div>
                                {newBannerFile && (
                                  <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm flex items-center gap-4">
                                    <img
                                      src={URL.createObjectURL(newBannerFile)}
                                      alt="BANNER PREVIEW"
                                      className="w-24 h-16 object-cover rounded-md border border-gray-300 shadow flex-shrink-0"
                                      onLoad={(e) => URL.revokeObjectURL(e.target.src)}
                                    />
                                    <div className="flex-1">
                                      <p className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                                        SELECTED: {newBannerFile.name}
                                      </p>
                                      <p className="text-xs text-gray-600 uppercase tracking-tight mt-1">
                                        {(newBannerFile.size / (1024 * 1024)).toFixed(2)} MB
                                      </p>
                                      <p className="text-xs text-purple-700 uppercase tracking-tight mt-2">
                                        FILE READY FOR UPLOAD.
                                      </p>
                                    </div>
                                  </div>
                                )}
                                <div className="mt-4 text-xs text-gray-600 bg-gray-100 p-3 rounded-md border border-gray-200 shadow-inner">
                                  <p className="mb-1 font-semibold uppercase tracking-wide">
                                    REQUIREMENTS:
                                  </p>
                                  <ul className="list-disc list-inside space-y-1">
                                    <li>
                                      <span className="font-medium">IMAGES:</span> LANDSCAPE ORIENTATION aspect ratio [2:1] • MAX 2MB • JPG, PNG, GIF, WEBP.
                                    </li>
                                  </ul>
                                </div>
                              </div>
                              <button
                                onClick={handleAddBanner}
                                disabled={uploading || banners.length >= 1 || !newBannerFile}
                                className={`mt-auto px-6 py-3 rounded-md font-bold text-white uppercase tracking-wider text-sm flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg md:w-auto w-full
                                ${
                                  uploading || banners.length >= 1 || !newBannerFile
                                    ? "bg-gray-300 cursor-not-allowed"
                                    : "bg-purple-600 hover:bg-purple-700 active:bg-purple-800"
                                }`}
                              >
                                {uploading ? (
                                  <Loader className="animate-spin h-5 w-5 mr-3" />
                                ) : (
                                  <PlusIcon className="h-5 w-5 mr-3" />
                                )}
                                {uploading ? 'UPLOADING BANNER...' : 'ADD BANNER'}
                              </button>
                            </div>
                          )}
                          {/* Display Existing Banners */}
                          <p className="text-sm text-gray-700 font-semibold uppercase tracking-wide mb-4">
                            CURRENT BANNERS:
                          </p>
                          <div className="grid grid-cols-1 gap-6">
                            {banners.length > 0 ? (
                              banners.map((banner, index) => (
                                <div
                                  key={banner.image_url || index}
                                  className="relative border border-gray-200 rounded-lg p-4 shadow-sm bg-gray-50"
                                >
                                  {editingBanner && editingBanner.index === index ? (
                                    <div className="space-y-4">
                                      <h4 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                                        EDIT BANNER
                                      </h4>
                                      <div>
                                        <label
                                          htmlFor={`editBannerFile-${index}`}
                                          className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1"
                                        >
                                          NEW IMAGE
                                        </label>
                                        <input
                                          type="file"
                                          id={`editBannerFile-${index}`}
                                          accept="image/jpeg,image/png,image/gif,image/webp,image/jpg"
                                          onChange={(e) => {
                                            const file = e.target.files[0];
                                            if (file) {
                                              if (uploadFileToCloudinary(file, 'landscape')) {
                                                setEditingBanner((prev) => ({ ...prev, newFile: file }));
                                              } else {
                                                e.target.value = '';
                                              }
                                            } else {
                                              setEditingBanner((prev) => ({ ...prev, newFile: null }));
                                            }
                                          }}
                                          className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                                        />
                                        {editingBanner.newFile && (
                                          <div className="mt-2 p-2 bg-gray-100 rounded border border-gray-200">
                                            <p className="text-xs text-gray-600 uppercase tracking-tight">
                                              SELECTED: {editingBanner.newFile.name}
                                            </p>
                                            <p className="text-xs text-gray-500 uppercase tracking-tight">
                                              {(editingBanner.newFile.size / (1024 * 1024)).toFixed(2)} MB
                                            </p>
                                          </div>
                                        )}
                                        <div className="mt-2 text-xs text-gray-500 bg-gray-100 p-2 rounded border border-gray-200">
                                            <p className="font-semibold uppercase tracking-wide">FILE REQS (SAME AS ADD):</p>
                                            <ul className="list-disc list-inside space-y-0.5">
                                                <li>IMAGES: LANDSCAPE • MAX 2MB</li>
                                            </ul>
                                        </div>
                                      </div>
                                      <div className="flex justify-end gap-3 mt-4">
                                        <button
                                          onClick={() => setEditingBanner(null)}
                                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-xs font-semibold uppercase tracking-wider hover:bg-gray-300 transition-colors shadow-sm"
                                        >
                                          CANCEL
                                        </button>
                                        <button
                                          onClick={handleUpdateBanner}
                                          disabled={uploading}
                                          className={`px-4 py-2 rounded-md font-bold text-white uppercase tracking-wider text-xs flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg
                                            ${
                                              uploading
                                                ? "bg-gray-300 cursor-not-allowed"
                                                : "bg-green-600 hover:bg-green-700 active:bg-green-800"
                                            }`}
                                        >
                                          {uploading ? (
                                            <Loader className="animate-spin h-4 w-4 mr-2" />
                                          ) : (
                                            <PencilIcon className="h-4 w-4 mr-2" />
                                          )}
                                          SAVE CHANGES
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <img
                                        src={banner.image_url}
                                        alt={`SHOP BANNER`}
                                        className="w-full h-32 md:h-40 object-contain rounded-md mb-3 bg-gray-200 border border-gray-300"
                                      />
                                      <div className="flex justify-end gap-2 mt-4">
                                        <button
                                          onClick={() =>
                                            setEditingBanner({
                                              index,
                                              oldUrl: banner.image_url,
                                              newFile: null,
                                            })
                                          }
                                          className="p-2 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 transition-colors shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                          title="EDIT BANNER"
                                        >
                                          <PencilIcon className="h-5 w-5" />
                                        </button>
                                        <button
                                          onClick={() =>
                                            handleRemoveBanner(banner.image_url)
                                          }
                                          className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-400"
                                          disabled={uploading}
                                          title="DELETE BANNER"
                                        >
                                          <TrashIcon className="h-5 w-5" />
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p className="text-md text-gray-500 col-span-full uppercase tracking-wider text-center py-8 bg-gray-100 rounded-lg border border-gray-200 shadow-inner">
                                NO BANNERS UPLOADED YET. ADD ONE ABOVE!
                              </p>
                            )}
                          </div>
                        </div>

                        {/* OFFERS SECTION */}
                        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 animate-fade-in-up delay-200">
                          <h3 className="text-xl font-bold text-gray-800 uppercase tracking-wide mb-5 pb-2 border-b-2 border-green-100 flex items-center">
                            <Tag className="h-6 w-6 mr-3 text-green-500" />
                            OFFERS ({offers.length}/5)
                          </h3>
                          {offers.length < 5 && (
                            <div className="flex flex-col gap-5 mb-8 p-6 border-2 border-green-200 rounded-lg bg-green-50 shadow-inner">
                              <p className="text-sm text-green-800 font-medium uppercase tracking-wide">
                                ADD A NEW OFFER:
                              </p>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="w-full">
                                  <label
                                    htmlFor="newOfferTitle"
                                    className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1"
                                  >
                                    OFFER TITLE
                                  </label>
                                  <input
                                    type="text"
                                    id="newOfferTitle"
                                    value={newOfferTitle}
                                    onChange={(e) => setNewOfferTitle(e.target.value)}
                                    placeholder="E.G., 50% OFF ON HAIR SPA"
                                    className="w-full p-3 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500 text-black placeholder-gray-400 uppercase tracking-wide"
                                    maxLength={70}
                                  />
                                  <span className="text-xs text-gray-500 mt-1 block text-right">
                                    {newOfferTitle.length}/70 CHARACTERS
                                  </span>
                                </div>
                                <div className="w-full">
                                  <label
                                    htmlFor="newOfferDiscount"
                                    className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1"
                                  >
                                    DISCOUNT (%)
                                  </label>
                                  <input
                                    type="number"
                                    id="newOfferDiscount"
                                    value={newOfferDiscount}
                                    onChange={(e) => setNewOfferDiscount(e.target.value)}
                                    placeholder="E.G., 50"
                                    min="0"
                                    max="100"
                                    className="w-full p-3 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500 text-black placeholder-gray-400"
                                  />
                                  <span className="text-xs text-gray-500 mt-1 block">
                                    ENTER PERCENTAGE FROM 0 TO 100.
                                  </span>
                                </div>
                              </div>
                              <div className="w-full">
                                <button
                                  onClick={handleAddOffer}
                                  disabled={uploading || offers.length >= 5 || !newOfferTitle.trim() || newOfferDiscount === "" || isNaN(newOfferDiscount) || parseInt(newOfferDiscount, 10) < 0 || parseInt(newOfferDiscount, 10) > 100}
                                  className={`w-full px-4 py-3 rounded-md font-bold text-white uppercase tracking-wider text-sm flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg
                                    ${
                                      uploading || offers.length >= 5 || !newOfferTitle.trim() || newOfferDiscount === "" || isNaN(newOfferDiscount) || parseInt(newOfferDiscount, 10) < 0 || parseInt(newOfferDiscount, 10) > 100
                                        ? "bg-gray-300 cursor-not-allowed"
                                        : "bg-green-600 hover:bg-green-700 active:bg-green-800"
                                    }`}
                                >
                                  {uploading ? (
                                    <Loader className="animate-spin h-5 w-5 mr-3" />
                                  ) : (
                                    <PlusIcon className="h-5 w-5 mr-3" />
                                  )}
                                  {uploading ? 'ADDING OFFER...' : 'ADD OFFER'}
                                </button>
                              </div>
                            </div>
                          )}
                          <p className="text-sm text-gray-700 font-semibold uppercase tracking-wide mb-4">
                            CURRENT OFFERS:
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {offers.length > 0 ? (
                              offers.map((offer, index) => (
                                <div
                                  key={offer.title || index}
                                  className="relative border border-gray-200 rounded-lg p-4 shadow-sm bg-gray-50 flex flex-col justify-between"
                                >
                                  {editingOffer && editingOffer.index === index ? (
                                    <div className="space-y-4">
                                      <h4 className="text-sm font-bold uppercase tracking-wide text-gray-700">
                                        EDIT OFFER
                                      </h4>
                                      <div>
                                        <label
                                          htmlFor={`editOfferTitle-${index}`}
                                          className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1"
                                        >
                                          NEW TITLE
                                        </label>
                                        <input
                                          type="text"
                                          id={`editOfferTitle-${index}`}
                                          value={editingOffer.newTitle}
                                          onChange={(e) =>
                                            setEditingOffer((prev) => ({
                                              ...prev,
                                              newTitle: e.target.value,
                                            }))
                                          }
                                          className="w-full p-2 border border-gray-300 rounded-md text-sm text-black uppercase tracking-wide"
                                          maxLength={70}
                                        />
                                      </div>
                                      <div>
                                        <label
                                          htmlFor={`editOfferDiscount-${index}`}
                                          className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1"
                                        >
                                          NEW DISCOUNT (%)
                                        </label>
                                        <input
                                          type="number"
                                          id={`editOfferDiscount-${index}`}
                                          value={editingOffer.newDiscount}
                                          onChange={(e) =>
                                            setEditingOffer((prev) => ({
                                              ...prev,
                                              newDiscount: e.target.value,
                                            }))
                                          }
                                          min="0"
                                          max="100"
                                          className="w-full p-2 border border-gray-300 rounded-md text-sm text-black"
                                        />
                                      </div>
                                      <div className="flex justify-end gap-3 mt-4">
                                        <button
                                          onClick={() => setEditingOffer(null)}
                                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-xs font-semibold uppercase tracking-wider hover:bg-gray-300 transition-colors shadow-sm"
                                        >
                                          CANCEL
                                        </button>
                                        <button
                                          onClick={handleUpdateOffer}
                                          disabled={uploading}
                                          className={`px-4 py-2 rounded-md font-bold text-white uppercase tracking-wider text-xs flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg
                                            ${
                                              uploading
                                                ? "bg-gray-300 cursor-not-allowed"
                                                : "bg-green-600 hover:bg-green-700 active:bg-green-800"
                                            }`}
                                        >
                                          {uploading ? (
                                            <Loader className="animate-spin h-4 w-4 mr-2" />
                                          ) : (
                                            <PencilIcon className="h-4 w-4 mr-2" />
                                          )}
                                          SAVE CHANGES
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <h4 className="font-bold text-gray-900 uppercase tracking-wide mb-2 text-center">
                                        {offer.title}
                                      </h4>
                                      <p className="text-xl font-extrabold text-green-700 mb-3 text-center">
                                        {offer.discount}% DISCOUNT
                                      </p>
                                      <div className="flex justify-end gap-2 mt-4">
                                        <button
                                          onClick={() =>
                                            setEditingOffer({
                                              index,
                                              oldTitle: offer.title,
                                              newTitle: offer.title,
                                              newDiscount: offer.discount,
                                            })
                                          }
                                          className="p-2 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 transition-colors shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-yellow-400"
                                          title="EDIT OFFER"
                                        >
                                          <PencilIcon className="h-5 w-5" />
                                        </button>
                                        <button
                                          onClick={() => handleRemoveOffer(offer.title)}
                                          className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-sm hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-400"
                                          disabled={uploading}
                                          title="DELETE OFFER"
                                        >
                                          <TrashIcon className="h-5 w-5" />
                                        </button>
                                      </div>
                                    </>
                                  )}
                                </div>
                              ))
                            ) : (
                              <p className="text-md text-gray-500 col-span-full uppercase tracking-wider text-center py-8 bg-gray-100 rounded-lg border border-gray-200 shadow-inner">
                                NO OFFERS ADDED YET. ADD YOUR FIRST OFFER ABOVE!
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};

export default ShopPerksModal;

