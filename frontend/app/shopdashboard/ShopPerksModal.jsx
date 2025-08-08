"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  PencilIcon,
  PhotoIcon,
  PlayCircleIcon,
  TagIcon,
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
} from 'lucide-react';

const API_BASE_URL = 'https://trim-tadka-backend-phi.vercel.app'; // Ensure this matches your backend URL
const CLOUDINARY_UPLOAD_URL = 'https://api.cloudinary.com/v1_1/db3kzpzi3/image/upload'; // Replace with your Cloudinary Cloud Name
const CLOUDINARY_UPLOAD_PRESET = 'trimtadka'; // Replace with your Cloudinary Upload Preset

/**
 * Shop Perks Management Modal: Ads, Banners, Offers.
 * Includes its own trigger button and conditional rendering based on subscription.
 *
 * @param {object} props - The component props.
 * @param {number} props.shopId - The ID of the shop.
 */
const ShopPerksModal = ({ shopId }) => {
  const [showModal, setShowModal] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(true); // Default to true for development, fetch from backend
  const [isLoading, setIsLoading] = useState(false); // Changed to false initially
  const [error, setError] = useState(null);
  const [ads, setAds] = useState([]);
  const [banners, setBanners] = useState([]);
  const [offers, setOffers] = useState([]);
  const [uploading, setUploading] = useState(false); // For general file uploads

  // State for new ad/banner/offer inputs
  const [newAdTitle, setNewAdTitle] = useState('');
  const [newAdFile, setNewAdFile] = useState(null); // File object for ad image/video
  const [newAdMediaType, setNewAdMediaType] = useState('image'); // 'image' or 'video'

  const [newBannerFile, setNewBannerFile] = useState(null); // File object for banner image

  const [newOfferTitle, setNewOfferTitle] = useState('');
  const [newOfferDiscount, setNewOfferDiscount] = useState('');

  // State for update forms (to be shown conditionally)
  // For Ads: { index, oldUrl, newTitle, newFile, newMediaType, currentMediaUrl }
  const [editingAd, setEditingAd] = useState(null);
  // For Banners: { index, oldUrl, newFile }
  const [editingBanner, setEditingBanner] = useState(null);
  // For Offers: { index, oldTitle, newTitle, newDiscount }
  const [editingOffer, setEditingOffer] = useState(null);

  const handleOpenModal = useCallback(() => {
    console.log('Opening modal, fetching shop perks...'); // Debug log
    setShowModal(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    // Reset states when closing modal
    setNewAdTitle('');
    setNewAdFile(null);
    setNewAdMediaType('image');
    setNewBannerFile(null);
    setNewOfferTitle('');
    setNewOfferDiscount('');
    setEditingAd(null);
    setEditingBanner(null);
    setEditingOffer(null);
  }, []);

  const fetchShopPerks = useCallback(async () => {
    if (!shopId) {
      console.error('Shop ID is missing'); // Debug log
      setError('SHOP ID IS NOT AVAILABLE.');
      setIsLoading(false);
      return;
    }

    console.log(`Fetching shop perks for shopId: ${shopId}`); // Debug log
    setIsLoading(true);
    setError(null);
    
    try {
      const shopResponse = await fetch(`${API_BASE_URL}/shops/${shopId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      console.log('Shop response status:', shopResponse.status); // Debug log
      
      if (!shopResponse.ok) {
        const errorText = await shopResponse.text();
        console.error('Shop fetch error:', errorText); // Debug log
        throw new Error(`FAILED TO FETCH SHOP DETAILS: ${shopResponse.status}`);
      }
      
      const shopData = await shopResponse.json();
      console.log('Fetched shop data:', shopData); // Debug log
      
      setIsSubscribed(shopData.is_subscribed || false);

      if (shopData.is_subscribed) {
        // Ensure we're setting arrays, even if they're undefined in the response
        const fetchedAds = Array.isArray(shopData.ads) ? shopData.ads : [];
        const fetchedBanners = Array.isArray(shopData.banners) ? shopData.banners : [];
        const fetchedOffers = Array.isArray(shopData.offers) ? shopData.offers : [];
        
        console.log('Setting ads:', fetchedAds); // Debug log
        console.log('Setting banners:', fetchedBanners); // Debug log
        console.log('Setting offers:', fetchedOffers); // Debug log
        
        setAds(fetchedAds);
        setBanners(fetchedBanners);
        setOffers(fetchedOffers);
      } else {
        console.log('Shop not subscribed, clearing perks'); // Debug log
        setAds([]);
        setBanners([]);
        setOffers([]);
      }
    } catch (err) {
      console.error('ERROR FETCHING SHOP PERKS:', err);
      setError(err.message || 'FAILED TO LOAD SHOP PERKS.');
      toast.error(err.message || 'ERROR LOADING SHOP PERKS.');
    } finally {
      setIsLoading(false);
    }
  }, [shopId]);

  // Fetch perks when modal opens
  useEffect(() => {
    if (showModal && shopId) {
      console.log('Modal opened, triggering fetch...'); // Debug log
      fetchShopPerks();
    }
  }, [showModal, shopId, fetchShopPerks]);

  // Cloudinary Upload Helper with orientation and size validation
  const uploadFileToCloudinary = async (file, requiredOrientation = null) => {
    if (!file) return null;

    const IMAGE_MAX_SIZE = 2 * 1024 * 1024; // 2MB
    const VIDEO_MAX_SIZE = 5 * 1024 * 1024; // 5MB

    if (file.type.startsWith('image/')) {
      if (file.size > IMAGE_MAX_SIZE) {
        toast.error('IMAGE FILE SIZE MUST BE UNDER 2MB.');
        return null;
      }
    } else if (file.type.startsWith('video/')) {
      if (file.size > VIDEO_MAX_SIZE) {
        toast.error('VIDEO FILE SIZE MUST BE UNDER 5MB.');
        return null;
      }
    } else {
      // Fallback for other file types, though accepts only image/video
      if (file.size > VIDEO_MAX_SIZE) { // Use larger limit for general check
        toast.error('FILE SIZE MUST BE UNDER 5MB.');
        return null;
      }
    }

    // Check image orientation if it's an image file
    if (file.type.startsWith('image/') && requiredOrientation) {
      const img = new window.Image(); // Use window.Image to ensure native constructor
      const objectUrl = URL.createObjectURL(file);
      try {
        await new Promise((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = (e) => reject(new Error('FAILED TO LOAD IMAGE FOR DIMENSION CHECK.'));
          img.src = objectUrl;
        });

        const { width, height } = img;
        URL.revokeObjectURL(objectUrl); // Clean up the object URL

        if (requiredOrientation === 'portrait' && width >= height) {
          toast.error('ADS IMAGES MUST BE PORTRAIT ORIENTATION (HEIGHT > WIDTH).');
          return null;
        }
        if (requiredOrientation === 'landscape' && height >= width) {
          toast.error('BANNERS IMAGES MUST BE LANDSCAPE ORIENTATION (WIDTH > HEIGHT).');
          return null;
        }
      } catch (err) {
        toast.error(err.message);
        URL.revokeObjectURL(objectUrl);
        return null;
      }
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    try {
      const res = await fetch(CLOUDINARY_UPLOAD_URL, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!data.secure_url) throw new Error('CLOUDINARY UPLOAD FAILED');
      return data.secure_url;
    } catch (err) {
      console.error('CLOUDINARY UPLOAD ERROR:', err);
      toast.error('FAILED TO UPLOAD MEDIA TO CLOUDINARY.');
      return null;
    }
  };

  // --- ADS MANAGEMENT ---
  const handleAddAd = async () => {
    if (!newAdTitle || !newAdFile) {
      toast.error('PLEASE PROVIDE AD TITLE AND SELECT A FILE.');
      return;
    }
    if (ads.length >= 2) {
      toast.error('MAXIMUM 2 ADS ALLOWED.');
      return;
    }

    setUploading(true);
    // Pass 'portrait' for ad images
    const mediaUrl = await uploadFileToCloudinary(newAdFile, newAdMediaType === 'image' ? 'portrait' : null);
    if (!mediaUrl) {
      setUploading(false);
      return;
    }

    try {
      const payload = {
        operation: 'add',
        data: {
          title: newAdTitle,
          ...(newAdMediaType === 'image' && { image_url: mediaUrl }),
          ...(newAdMediaType === 'video' && { video_url: mediaUrl }),
        },
      };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/ads`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'FAILED TO ADD AD.');
      }
      const data = await response.json();
      setAds(data.ads || []);
      toast.success(data.message);
      setNewAdTitle('');
      setNewAdFile(null);
      setNewAdMediaType('image');
    } catch (err) {
      console.error('ADD AD ERROR:', err);
      toast.error(err.message || 'FAILED TO ADD AD.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveAd = async (urlToRemove) => {
    setUploading(true); // Indicate activity
    try {
      const payload = { operation: 'remove', data: { url_to_remove: urlToRemove } };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/ads`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'FAILED TO REMOVE AD.');
      }
      const data = await response.json();
      setAds(data.ads || []);
      toast.success(data.message);
    } catch (err) {
      console.error('REMOVE AD ERROR:', err);
      toast.error(err.message || 'FAILED TO REMOVE AD.');
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateAd = async () => {
    if (!editingAd || !editingAd.newTitle || (!editingAd.newFile && !editingAd.currentMediaUrl)) {
      toast.error('PLEASE PROVIDE ALL REQUIRED FIELDS FOR AD UPDATE.');
      return;
    }

    setUploading(true);
    let newMediaUrl = editingAd.currentMediaUrl; // Default to current URL if no new file
    if (editingAd.newFile) {
      // Pass 'portrait' for ad images during update
      newMediaUrl = await uploadFileToCloudinary(editingAd.newFile, editingAd.newMediaType === 'image' ? 'portrait' : null);
      if (!newMediaUrl) {
        setUploading(false);
        return;
      }
    }

    try {
      const payload = {
        operation: 'update',
        data: {
          old_url: editingAd.oldUrl, // This is the unique identifier for the ad
          new_title: editingAd.newTitle,
          ...(editingAd.newMediaType === 'image' && { new_image_url: newMediaUrl }),
          ...(editingAd.newMediaType === 'video' && { new_video_url: newMediaUrl }),
        },
      };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/ads`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'FAILED TO UPDATE AD.');
      }
      const data = await response.json();
      setAds(data.ads || []);
      toast.success(data.message);
      setEditingAd(null); // Close update form
    } catch (err) {
      console.error('UPDATE AD ERROR:', err);
      toast.error(err.message || 'FAILED TO UPDATE AD.');
    } finally {
      setUploading(false);
    }
  };

  // --- BANNERS MANAGEMENT ---
  const handleAddBanner = async () => {
    if (!newBannerFile) {
      toast.error('PLEASE SELECT A BANNER IMAGE.');
      return;
    }
    if (banners.length >= 1) {
      toast.error('MAXIMUM 1 BANNERS ALLOWED.');
      return;
    }

    setUploading(true);
    // Pass 'landscape' for banner images
    const imageUrl = await uploadFileToCloudinary(newBannerFile, 'landscape');
    if (!imageUrl) {
      setUploading(false);
      return;
    }

    try {
      const payload = { operation: 'add', data: { image_url: imageUrl } };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/banners`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'FAILED TO ADD BANNER.');
      }
      const data = await response.json();
      setBanners(data.banners || []);
      toast.success(data.message);
      setNewBannerFile(null);
    } catch (err) {
      console.error('ADD BANNER ERROR:', err);
      toast.error(err.message || 'FAILED TO ADD BANNER.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveBanner = async (urlToRemove) => {
    setUploading(true);
    try {
      const payload = { operation: 'remove', data: { url_to_remove: urlToRemove } };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/banners`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'FAILED TO REMOVE BANNER.');
      }
      const data = await response.json();
      setBanners(data.banners || []);
      toast.success(data.message);
    } catch (err) {
      console.error('REMOVE BANNER ERROR:', err);
      toast.error(err.message || 'FAILED TO REMOVE BANNER.');
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateBanner = async () => {
    if (!editingBanner || !editingBanner.newFile) {
      toast.error('PLEASE SELECT A NEW BANNER IMAGE FOR UPDATE.');
      return;
    }
    setUploading(true);
    // Pass 'landscape' for banner images during update
    const newImageUrl = await uploadFileToCloudinary(editingBanner.newFile, 'landscape');
    if (!newImageUrl) {
      setUploading(false);
      return;
    }

    try {
      const payload = {
        operation: 'update',
        data: { old_url: editingBanner.oldUrl, new_image_url: newImageUrl },
      };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/banners`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'FAILED TO UPDATE BANNER.');
      }
      const data = await response.json();
      setBanners(data.banners || []);
      toast.success(data.message);
      setEditingBanner(null); // Close update form
    } catch (err) {
      console.error('UPDATE BANNER ERROR:', err);
      toast.error(err.message || 'FAILED TO UPDATE BANNER.');
    } finally {
      setUploading(false);
    }
  };

  // --- OFFERS MANAGEMENT ---
  const handleAddOffer = async () => {
    if (!newOfferTitle || newOfferDiscount === '' || isNaN(newOfferDiscount) || newOfferDiscount < 0) {
      toast.error('PLEASE PROVIDE A VALID OFFER TITLE AND DISCOUNT.');
      return;
    }
    if (offers.length >= 5) {
      toast.error('MAXIMUM 5 OFFERS ALLOWED.');
      return;
    }

    setUploading(true); // Use uploading state for any backend interaction
    try {
      const payload = {
        operation: 'add',
        data: { title: newOfferTitle, discount: parseInt(newOfferDiscount, 10) },
      };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/offers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'FAILED TO ADD OFFER.');
      }
      const data = await response.json();
      setOffers(data.offers || []);
      toast.success(data.message);
      setNewOfferTitle('');
      setNewOfferDiscount('');
    } catch (err) {
      console.error('ADD OFFER ERROR:', err);
      toast.error(err.message || 'FAILED TO ADD OFFER.');
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveOffer = async (titleToRemove) => {
    setUploading(true);
    try {
      const payload = { operation: 'remove', data: { title_to_remove: titleToRemove } };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/offers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'FAILED TO REMOVE OFFER.');
      }
      const data = await response.json();
      setOffers(data.offers || []);
      toast.success(data.message);
    } catch (err) {
      console.error('REMOVE OFFER ERROR:', err);
      toast.error(err.message || 'FAILED TO REMOVE OFFER.');
    } finally {
      setUploading(false);
    }
  };

  const handleUpdateOffer = async () => {
    if (!editingOffer || !editingOffer.newTitle || editingOffer.newDiscount === '' || isNaN(editingOffer.newDiscount) || editingOffer.newDiscount < 0) {
      toast.error('PLEASE PROVIDE ALL REQUIRED FIELDS FOR OFFER UPDATE.');
      return;
    }
    setUploading(true);
    try {
      const payload = {
        operation: 'update',
        data: {
          old_title: editingOffer.oldTitle,
          new_title: editingOffer.newTitle,
          new_discount: parseInt(editingOffer.newDiscount, 10),
        },
      };
      const response = await fetch(`${API_BASE_URL}/shops/${shopId}/offers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'FAILED TO UPDATE OFFER.');
      }
      const data = await response.json();
      setOffers(data.offers || []);
      toast.success(data.message);
      setEditingOffer(null); // Close update form
    } catch (err) {
      console.error('UPDATE OFFER ERROR:', err);
      toast.error(err.message || 'FAILED TO UPDATE OFFER.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {/* THE CIRCULAR TRIGGER BUTTON */}
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

      {/* THE FULL-PAGE MODAL, RENDERED ONLY WHEN SHOWMODAL IS TRUE */}
      {showModal && createPortal(
     <div className="fixed inset-0 z-50 bg-black bg-opacity-70 flex items-center justify-center animate-fade-in">
  <div className="bg-white w-screen h-screen overflow-auto animate-scale-up">
            <div className="sticky top-0 bg-gradient-to-r from-blue-700 to-cyan-800 p-5 flex items-center justify-between shadow-lg">
              <h2 className="text-xl uppercase tracking-widest font-extrabold text-white flex items-center">
                <LayoutDashboard className="h-6 w-6 mr-2 text-blue-200" />
                MANAGE SHOP PERKS
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-white/80 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full"
                aria-label="CLOSE PERKS MODAL"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto max-h-[calc(90vh-100px)] p-4">
              {isLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-gray-600 min-h-screen">
                  <div className="relative">
                    <Loader className="animate-spin mb-3 h-10 w-10 text-blue-500" />
                    <div className="absolute inset-0 h-10 w-10 border-4 border-blue-200 rounded-full animate-pulse"></div>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wider">
                    LOADING SHOP PERKS...
                  </p>
                </div>
              ) : error ? (
                <div className="py-12 flex flex-col items-center justify-center text-red-600">
                  <AlertCircle className="mb-3 h-10 w-10" />
                  <p className="text-xs font-semibold uppercase tracking-wider text-center px-6">
                    {error}
                  </p>
                  <button
                    onClick={fetchShopPerks}
                    className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 transition-colors uppercase tracking-wider text-sm font-bold"
                  >
                    RETRY
                  </button>
                </div>
              ) : (
                <>
                  {!isSubscribed ? (
                    <div className="py-12 text-center text-red-700 bg-red-50 rounded-lg border border-red-200 shadow-inner">
                      <Ban className="h-12 w-12 mx-auto mb-4 text-red-500" />
                      <p className="text-lg font-bold uppercase tracking-wider mb-2">
                        SUBSCRIPTION REQUIRED!
                      </p>
                      <p className="text-md text-gray-700 uppercase tracking-wide">
                        PLEASE SUBSCRIBE TO ACCESS ADS, BANNERS, AND OFFERS MANAGEMENT.
                      </p>
                      <p className="text-sm text-gray-600 mt-4 uppercase tracking-wide">
                        VISIT THE BILLING SECTION TO SUBSCRIBE.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-10">
                      

                      {/* ADS SECTION */}
                      <div className="bg-gray-50 p-6 rounded-xl shadow-inner border border-gray-100">
                        <h3 className="text-xl font-bold text-gray-800 uppercase tracking-wide mb-4 flex items-center">
                          <ImageIcon className="h-5 w-5 mr-2 text-blue-500" /> ADS ({ads.length}/2)
                        </h3>
                        {ads.length < 2 && (
                          <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 border border-blue-200 rounded-lg bg-blue-50">
                            <div className="flex-grow">
                              <label htmlFor="newAdTitle" className="block text-xs font-semibold text-gray-700 uppercase mb-1">AD TITLE</label>
                              <input
                                type="text"
                                id="newAdTitle"
                                value={newAdTitle}
                                onChange={(e) => setNewAdTitle(e.target.value)}
                                placeholder="ENTER AD TITLE"
                                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 text-black"
                              />
                            </div>
                            <div className="flex-grow">
                              <label htmlFor="newAdFile" className="block text-xs font-semibold text-gray-700 uppercase mb-1">MEDIA (IMAGE/VIDEO)</label>
                              <input
                                type="file"
                                id="newAdFile"
                                accept="image/*,video/*"
                                onChange={(e) => {
                                  const file = e.target.files[0];
                                  setNewAdFile(file);
                                  if (file) {
                                    setNewAdMediaType(file.type.startsWith('image') ? 'image' : 'video');
                                  }
                                }}
                                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                              />
                              {newAdFile && <span className="text-xs text-gray-500 mt-1 block">SELECTED: {newAdFile.name}</span>}
                            </div>
                            <button
                              onClick={handleAddAd}
                              disabled={uploading || ads.length >= 2}
                              className={`mt-auto px-4 py-2 rounded-md font-bold text-white uppercase tracking-wider text-sm flex items-center justify-center transition-all duration-200
                                ${uploading || ads.length >= 2 ? 'bg-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                              {uploading ? <Loader className="animate-spin h-4 w-4 mr-2" /> : <PlusIcon className="h-4 w-4 mr-2" />}
                              ADD AD
                            </button>
                          </div>
                        )}

                        {/* Display Existing Ads */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {ads.length > 0 ? (
                            ads.map((ad, index) => (
                              <div key={index} className="relative border border-gray-200 rounded-lg p-3 shadow-sm bg-white">
                                {editingAd && editingAd.index === index ? (
                                  <div className="space-y-3">
                                    <h4 className="text-sm font-bold uppercase tracking-wide text-gray-700">EDIT AD</h4>
                                    <div>
                                      <label htmlFor={`editAdTitle-${index}`} className="block text-xs font-semibold text-gray-700 uppercase mb-1">NEW TITLE</label>
                                      <input
                                        type="text"
                                        id={`editAdTitle-${index}`}
                                        value={editingAd.newTitle}
                                        onChange={(e) => setEditingAd(prev => ({ ...prev, newTitle: e.target.value }))}
                                        className="w-full p-2 border border-gray-300 rounded-md text-sm text-black"
                                      />
                                    </div>
                                    <div>
                                      <label htmlFor={`editAdFile-${index}`} className="block text-xs font-semibold text-gray-700 uppercase mb-1">NEW MEDIA (OPTIONAL)</label>
                                      <input
                                        type="file"
                                        id={`editAdFile-${index}`}
                                        accept="image/*,video/*"
                                        onChange={(e) => {
                                          const file = e.target.files[0];
                                          setEditingAd(prev => ({ ...prev, newFile: file, newMediaType: file ? (file.type.startsWith('image') ? 'image' : 'video') : prev.newMediaType }));
                                        }}
                                        className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100"
                                      />
                                      {editingAd.newFile && <span className="text-xs text-gray-500 mt-1 block">SELECTED: {editingAd.newFile.name}</span>}
                                    </div>
                                    <div className="flex justify-end gap-2">
                                      <button
                                        onClick={() => setEditingAd(null)}
                                        className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-md text-xs font-semibold uppercase hover:bg-gray-300"
                                      >
                                        CANCEL
                                      </button>
                                      <button
                                        onClick={handleUpdateAd}
                                        disabled={uploading}
                                        className={`px-3 py-1.5 rounded-md font-bold text-white uppercase text-xs flex items-center justify-center
                                          ${uploading ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                                      >
                                        {uploading ? <Loader className="animate-spin h-3 w-3 mr-1" /> : <PencilIcon className="h-3 w-3 mr-1" />}
                                        SAVE
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <h4 className="font-semibold text-gray-800 uppercase tracking-wide mb-2">{ad.title}</h4>
                                   {ad.image_url && (
  <img
    src={ad.image_url}
    alt={ad.title}
    className="w-full h-64 object-contain rounded-md mb-2 bg-gray-100" // portrait-friendly
  />
)}
{ad.video_url && (
  <video
    controls
    src={ad.video_url}
    className="w-full h-64 object-contain rounded-md mb-2 bg-black"
  >
    YOUR BROWSER DOES NOT SUPPORT THE VIDEO TAG.
  </video>
)}
                                    <div className="flex justify-end gap-2 mt-2">
                                      <button
                                        onClick={() => setEditingAd({
                                          index,
                                          oldUrl: ad.image_url || ad.video_url,
                                          newTitle: ad.title,
                                          currentMediaUrl: ad.image_url || ad.video_url,
                                          newMediaType: ad.image_url ? 'image' : 'video',
                                          newFile: null
                                        })}
                                        className="p-1.5 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 transition-colors"
                                      >
                                        <PencilIcon className="h-4 w-4" />
                                      </button>
                                      <button
                                        onClick={() => handleRemoveAd(ad.image_url || ad.video_url)}
                                        className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                      >
                                        <TrashIcon className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-gray-500 col-span-2 uppercase tracking-wider text-center py-4">NO ADS UPLOADED YET.</p>
                          )}
                        </div>
                      </div>

                      {/* BANNERS SECTION */}
                      <div className="bg-gray-50 p-6 rounded-xl shadow-inner border border-gray-100">
                        <h3 className="text-xl font-bold text-gray-800 uppercase tracking-wide mb-4 flex items-center">
                          <ImageIcon className="h-5 w-5 mr-2 text-purple-500" /> BANNERS ({banners.length}/1)
                        </h3>
                        {banners.length < 1 && (
                          <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 border border-purple-200 rounded-lg bg-purple-50">
                            <div className="flex-grow">
                              <label htmlFor="newBannerFile" className="block text-xs font-semibold text-gray-700 uppercase mb-1">BANNER IMAGE</label>
                              <input
                                type="file"
                                id="newBannerFile"
                                accept="image/*"
                                onChange={(e) => setNewBannerFile(e.target.files[0])}
                                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100"
                              />
                              {newBannerFile && <span className="text-xs text-gray-500 mt-1 block">SELECTED: {newBannerFile.name}</span>}
                            </div>
                            <button
                              onClick={handleAddBanner}
                              disabled={uploading || banners.length >= 2}
                              className={`mt-auto px-4 py-2 rounded-md font-bold text-white uppercase tracking-wider text-sm flex items-center justify-center transition-all duration-200
                                ${uploading || banners.length >= 2 ? 'bg-gray-300 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'}`}
                            >
                              {uploading ? <Loader className="animate-spin h-4 w-4 mr-2" /> : <PlusIcon className="h-4 w-4 mr-2" />}
                              ADD BANNER
                            </button>
                          </div>
                        )}
                        {/* Display Existing Banners */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {banners.length > 0 ? (
                            banners.map((banner, index) => (
                              <div key={index} className="relative border border-gray-200 rounded-lg p-3 shadow-sm bg-white">
                                {editingBanner && editingBanner.index === index ? (
                                  <div className="space-y-3">
                                    <h4 className="text-sm font-bold uppercase tracking-wide text-gray-700">EDIT BANNER</h4>
                                    <div>
                                      <label htmlFor={`editBannerFile-${index}`} className="block text-xs font-semibold text-gray-700 uppercase mb-1">NEW IMAGE</label>
                                      <input
                                        type="file"
                                        id={`editBannerFile-${index}`}
                                        accept="image/*"
                                        onChange={(e) => setEditingBanner(prev => ({ ...prev, newFile: e.target.files[0] }))}
                                        className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-50 file:text-gray-700 hover:file:bg-gray-100"
                                      />
                                      {editingBanner.newFile && <span className="text-xs text-gray-500 mt-1 block">SELECTED: {editingBanner.newFile.name}</span>}
                                    </div>
                                    <div className="flex justify-end gap-2">
                                      <button
                                        onClick={() => setEditingBanner(null)}
                                        className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-md text-xs font-semibold uppercase hover:bg-gray-300"
                                      >
                                        CANCEL
                                      </button>
                                      <button
                                        onClick={handleUpdateBanner}
                                        disabled={uploading}
                                        className={`px-3 py-1.5 rounded-md font-bold text-white uppercase text-xs flex items-center justify-center
                                          ${uploading ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                                      >
                                        {uploading ? <Loader className="animate-spin h-3 w-3 mr-1" /> : <PencilIcon className="h-3 w-3 mr-1" />}
                                        SAVE
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <img src={banner.image_url} alt={`banner ${index}`} className="w-full h-24 object-cover rounded-md mb-2" />
                                    <div className="flex justify-end gap-2 mt-2">
                                      <button
                                        onClick={() => setEditingBanner({ index, oldUrl: banner.image_url, newFile: null })}
                                        className="p-1.5 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 transition-colors"
                                      >
                                        <PencilIcon className="h-4 w-4" />
                                      </button>
                                      <button
                                        onClick={() => handleRemoveBanner(banner.image_url)}
                                        className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                      >
                                        <TrashIcon className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-gray-500 col-span-2 uppercase tracking-wider text-center py-4">NO BANNERS UPLOADED YET.</p>
                          )}
                        </div>
                      </div>

                      {/* OFFERS SECTION */}
                      <div className="bg-gray-50 p-6 rounded-xl shadow-inner border border-gray-100">
                        <h3 className="text-xl font-bold text-gray-800 uppercase tracking-wide mb-4 flex items-center">
                          <Tag className="h-5 w-5 mr-2 text-green-500" /> OFFERS ({offers.length}/5)
                        </h3>
                        {offers.length < 5 && (
                          <div className="flex flex-col md:flex-row gap-4 mb-6 p-4 border border-green-200 rounded-lg bg-green-50">
                            <div className="flex-grow">
                              <label htmlFor="newOfferTitle" className="block text-xs font-semibold text-gray-700 uppercase mb-1">OFFER TITLE</label>
                              <input
                                type="text"
                                id="newOfferTitle"
                                value={newOfferTitle}
                                onChange={(e) => setNewOfferTitle(e.target.value)}
                                placeholder="E.G., 50% OFF ON HAIR SPA"
                                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500 text-black"
                              />
                            </div>
                            <div className="flex-grow">
                              <label htmlFor="newOfferDiscount" className="block text-xs font-semibold text-gray-700 uppercase mb-1">DISCOUNT (%)</label>
                              <input
                                type="number"
                                id="newOfferDiscount"
                                value={newOfferDiscount}
                                onChange={(e) => setNewOfferDiscount(e.target.value)}
                                placeholder="E.G., 50"
                                min="0"
                                max="100"
                                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-green-500 focus:border-green-500 text-black"
                              />
                            </div>
                            <button
                              onClick={handleAddOffer}
                              disabled={uploading || offers.length >= 5}
                              className={`mt-auto px-4 py-2 rounded-md font-bold text-white uppercase tracking-wider text-sm flex items-center justify-center transition-all duration-200
                                ${uploading || offers.length >= 5 ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                            >
                              {uploading ? <Loader className="animate-spin h-4 w-4 mr-2" /> : <PlusIcon className="h-4 w-4 mr-2" />}
                              ADD OFFER
                            </button>
                          </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {offers.length > 0 ? (
                            offers.map((offer, index) => (
                              <div key={index} className="relative border border-gray-200 rounded-lg p-3 shadow-sm bg-white">
                                {editingOffer && editingOffer.index === index ? (
                                  <div className="space-y-3">
                                    <h4 className="text-sm font-bold uppercase tracking-wide text-gray-700">EDIT OFFER</h4>
                                    <div>
                                      <label htmlFor={`editOfferTitle-${index}`} className="block text-xs font-semibold text-gray-700 uppercase mb-1">NEW TITLE</label>
                                      <input
                                        type="text"
                                        id={`editOfferTitle-${index}`}
                                        value={editingOffer.newTitle}
                                        onChange={(e) => setEditingOffer(prev => ({ ...prev, newTitle: e.target.value }))}
                                        className="w-full p-2 border border-gray-300 rounded-md text-sm text-black"
                                      />
                                    </div>
                                    <div>
                                      <label htmlFor={`editOfferDiscount-${index}`} className="block text-xs font-semibold text-gray-700 uppercase mb-1">NEW DISCOUNT (%)</label>
                                      <input
                                        type="number"
                                        id={`editOfferDiscount-${index}`}
                                        value={editingOffer.newDiscount}
                                        onChange={(e) => setEditingOffer(prev => ({ ...prev, newDiscount: e.target.value }))}
                                        min="0"
                                        max="100"
                                        className="w-full p-2 border border-gray-300 rounded-md text-sm text-black"
                                      />
                                    </div>
                                    <div className="flex justify-end gap-2">
                                      <button
                                        onClick={() => setEditingOffer(null)}
                                        className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded-md text-xs font-semibold uppercase hover:bg-gray-300"
                                      >
                                        CANCEL
                                      </button>
                                      <button
                                        onClick={handleUpdateOffer}
                                        disabled={uploading}
                                        className={`px-3 py-1.5 rounded-md font-bold text-white uppercase text-xs flex items-center justify-center
                                          ${uploading ? 'bg-gray-300 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                                      >
                                        {uploading ? <Loader className="animate-spin h-3 w-3 mr-1" /> : <PencilIcon className="h-3 w-3 mr-1" />}
                                        SAVE
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <h4 className="font-semibold text-gray-800 uppercase tracking-wide mb-2">{offer.title}</h4>
                                    <p className="text-sm text-gray-600 mb-2">{offer.discount}% DISCOUNT</p>
                                    <div className="flex justify-end gap-2 mt-2">
                                      <button
                                        onClick={() => setEditingOffer({ index, oldTitle: offer.title, newTitle: offer.title, newDiscount: offer.discount })}
                                        className="p-1.5 bg-yellow-500 text-white rounded-full hover:bg-yellow-600 transition-colors"
                                      >
                                        <PencilIcon className="h-4 w-4" />
                                      </button>
                                      <button
                                        onClick={() => handleRemoveOffer(offer.title)}
                                        className="p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                      >
                                        <TrashIcon className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-gray-500 col-span-full uppercase tracking-wider text-center py-4">NO OFFERS ADDED YET.</p>
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
