'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { XMarkIcon, PhotoIcon, TrashIcon, PlusIcon, PencilIcon } from '@heroicons/react/24/outline';
import { Loader2Icon, UploadCloud } from "lucide-react";
import { toast, ToastContainer } from 'react-toastify';


const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const UploadShopImages = ({ shopId, isOpen, onClose }) => {
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedFileForPreview, setSelectedFileForPreview] = useState(null);

  const fetchImages = async () => {
    if (!shopId) return;

    const { data, error } = await supabase
      .from('shops')
      .select('image_url')
      .eq('shop_id', shopId)
      .single();

    if (data) {
      setImages(data.image_url || []);
    }
  };

  useEffect(() => {
    if (isOpen && shopId) {
      fetchImages();
    }
  }, [isOpen, shopId]);

  useEffect(() => {
    if (!isOpen) {
      setImages([]);
      setUploading(false);
      setSelectedFileForPreview(null);
    }
  }, [isOpen]);

  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) {
      setSelectedFileForPreview(null);
      return;
    }
    
    setSelectedFileForPreview(file);

    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size must be under 2MB.');
      setSelectedFileForPreview(null);
      return;
    }

    if (images.length >= 5) {
      toast.error('You can only upload up to 5 images.');
      setSelectedFileForPreview(null);
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', 'trimtadka');

      const res = await fetch(`https://api.cloudinary.com/v1_1/db3kzpzi3/image/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!data.secure_url) throw new Error('Cloudinary upload failed');
      const imageUrl = data.secure_url;

      const { data: updatedImages, error } = await supabase.rpc('add_image_url', {
        shop_id: shopId,
        new_url: imageUrl,
      });

      if (error) throw error;
      setImages(updatedImages);
      toast.success('Image uploaded successfully!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload image.');
    } finally {
      setUploading(false);
      event.target.value = null;
      setSelectedFileForPreview(null);
    }
  };

  const handleDelete = async (url) => {
    try {
      const { data: updatedImages, error } = await supabase.rpc('remove_image_url', {
        shop_id: shopId,
        url_to_remove: url,
      });

      if (error) throw error;
      setImages(updatedImages);
      toast.success('Image deleted successfully!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete image.');
    }
  };

  const handleUpdate = async (oldUrl, newFile) => {
    if (!newFile) return;

    if (newFile.size > 2 * 1024 * 1024) {
      toast.error('New file size must be under 2MB.');
      return;
    }

    setUploading(true);
    try {
      await supabase.rpc('remove_image_url', {
        shop_id: shopId,
        url_to_remove: oldUrl,
      });

      const formData = new FormData();
      formData.append('file', newFile);
      formData.append('upload_preset', 'trimtadka');

      const res = await fetch(`https://api.cloudinary.com/v1_1/db3kzpzi3/image/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!data.secure_url) throw new Error('Cloudinary upload failed');
      const imageUrl = data.secure_url;

      await supabase.rpc('add_image_url', {
        shop_id: shopId,
        new_url: imageUrl,
      });

      toast.success('Image updated successfully!');
      fetchImages();
    } catch (err) {
      console.error(err);
      toast.error('Failed to update image.');
    } finally {
      setUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 animate-fade-in">
      {/* The inner container now takes up the full screen */}
      <div className="bg-white w-screen h-screen flex flex-col relative animate-scale-up">

        {/* Header - Fixed to the top */}
        <div className="p-6 bg-white shadow-sm flex items-center justify-between sticky top-0 z-10">
          <h3 className="text-xl sm:text-2xl font-extrabold text-[#cb3a1e] uppercase tracking-wider">
            Manage Shop Images
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-[#cb3a1e] focus:outline-none transition-colors duration-200"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="border border-orange-200 rounded-lg p-5 bg-orange-50 shadow-inner">
            <p className="text-sm font-semibold text-orange-800 uppercase tracking-wide mb-4">
              ADD A NEW IMAGE:
            </p>
            <div className="w-full">
              <label
                htmlFor="upload-button"
                className={`
                  flex flex-col items-center justify-center p-6 border-2 border-dashed border-orange-400 rounded-lg cursor-pointer bg-orange-100
                  transition-colors duration-200 hover:bg-orange-200
                  ${images?.length >= 5 || uploading ? 'opacity-60 cursor-not-allowed' : ''}
                `}
              >
                <UploadCloud className="h-10 w-10 text-orange-600 mb-3" />
                <span className="text-sm font-semibold text-orange-800 uppercase tracking-wide text-center">
                  DRAG & DROP OR CLICK TO UPLOAD
                </span>
                <span className="text-xs text-orange-600 mt-1 uppercase tracking-tight text-center">
                  (MAX 5 IMAGES TOTAL)
                </span>
                <input
                  id="upload-button"
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,image/jpg"
                  onChange={handleUpload}
                  disabled={images?.length >= 5 || uploading}
                  className="hidden"
                />
              </label>

              {selectedFileForPreview && (
                <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col sm:flex-row items-center gap-4">
                  <div className="flex-shrink-0">
                    <img
                      src={URL.createObjectURL(selectedFileForPreview)}
                      alt="IMAGE PREVIEW"
                      className="w-24 h-16 object-cover rounded-md border border-gray-300 shadow"
                      onLoad={(e) => URL.revokeObjectURL(e.target.src)}
                    />
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <p className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                      SELECTED: {selectedFileForPreview.name}
                    </p>
                    <p className="text-xs text-gray-600 uppercase tracking-tight mt-1">
                      {(selectedFileForPreview.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                    <p className="text-xs text-orange-700 uppercase tracking-tight mt-2">
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
                  <li>MAX 2MB FILE SIZE.</li>
                  <li>LANDSCAPE ORIENTATION (WIDTH &gt; HEIGHT).</li>
                  <li>IDEAL ASPECT RATIO: 5:3.</li>
                  <li>SUPPORTED FORMATS: JPG, PNG, GIF, WEBP.</li>
                </ul>
              </div>

              <button
                onClick={() => document.getElementById('upload-button').click()}
                disabled={images?.length >= 5 || uploading}
                className={`mt-6 w-full px-4 py-3 rounded-md font-bold text-white uppercase tracking-wider text-sm flex items-center justify-center transition-all duration-200 shadow-md hover:shadow-lg
                  ${images?.length >= 5 || uploading
                    ? "bg-gray-300 cursor-not-allowed"
                    : "bg-[#cb3a1e] hover:bg-[#a62d18] active:bg-[#852313]"
                  }`}
              >
                {uploading ? (
                  <>
                    <Loader2Icon className="h-5 w-5 mr-3 animate-spin" />
                    <span className="uppercase tracking-wider">UPLOADING...</span>
                  </>
                ) : (
                  <>
                    <PlusIcon className="h-5 w-5 mr-3" />
                    <span className="uppercase tracking-wider">UPLOAD NEW IMAGE ({images?.length || 0}/5)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-black mb-2 flex items-center uppercase tracking-wider">
              <PhotoIcon className="h-4 w-4 mr-1 text-[#cb3a1e]" /> Existing Images:
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-60 overflow-y-auto p-2 rounded-md bg-gray-100">
              {images?.length > 0 ? (
                images.map((url, index) => (
                  <div key={index} className="relative">
                    <img src={url} alt={`shop image ${index}`} className="w-full h-28 object-cover rounded-md shadow-sm" />
                    <div className="absolute top-2 right-2 flex flex-col space-y-2">
                      <label className="bg-gray-900/60 backdrop-blur-sm p-1 rounded-full border border-white cursor-pointer transition-colors duration-200">
                        <PencilIcon className="h-4 w-4 text-white" />
                        <input
                          type="file"
                          onChange={(e) => handleUpdate(url, e.target.files[0])}
                          className="hidden"
                        />
                      </label>
                      <button onClick={() => handleDelete(url)} className="bg-gray-900/60 backdrop-blur-sm p-1 rounded-full border border-white text-red-400 transition-colors duration-200">
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 col-span-3 uppercase tracking-wider text-center py-4">No images uploaded yet.</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer - Fixed to the bottom */}
        <div className="p-6 bg-white shadow-sm flex justify-end sticky bottom-0 z-10">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors duration-200 uppercase tracking-wider font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadShopImages;
