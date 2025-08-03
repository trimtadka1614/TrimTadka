'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { XMarkIcon, PhotoIcon, TrashIcon, PlusIcon, PencilIcon } from '@heroicons/react/24/outline';
import { Loader2Icon } from "lucide-react";
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const UploadShopImages = ({ shopId, isOpen, onClose }) => {
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);

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
    }
  }, [isOpen]);

  const handleUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('File size must be under 2MB.');
      return;
    }

    if (images.length >= 5) {
      toast.error('You can only upload up to 5 images.');
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
      // Clear the file input
      event.target.value = null;
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
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 animate-fade-in">


      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 relative animate-scale-up">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-[#cb3a1e] focus:outline-none transition-colors duration-200"
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
        <h3 className="text-xl sm:text-2xl font-extrabold text-[#cb3a1e] mb-4 pb-2 border-b border-gray-200 uppercase tracking-wider">
          Manage Shop Images
        </h3>

        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <label className="block text-sm font-medium text-black mb-2 sm:mb-0 flex items-center uppercase tracking-wider">
              <PhotoIcon className="h-4 w-4 mr-1 text-[#cb3a1e]" /> Add New Image:
            </label>
            <label
              htmlFor="upload-button"
              className={`
                px-4 py-2 text-sm font-semibold rounded-md border border-[#cb3a1e] text-[#cb3a1e] cursor-pointer
                transition-colors duration-200
                ${images?.length >= 5 || uploading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#cb3a1e] hover:text-white'}
                flex items-center justify-center
              `}
            >
              {uploading ? (
                <>
                  <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                  <span className="uppercase tracking-wider">Uploading...</span>
                </>
              ) : (
                <>
                  <PlusIcon className="h-4 w-4 inline-block mr-2" />
                  <span className="uppercase tracking-wider">Upload Image ({images?.length || 0}/5)</span>
                </>
              )}
              <input
                id="upload-button"
                type="file"
                accept="image/*"
                onChange={handleUpload}
                disabled={images?.length >= 5 || uploading}
                className="hidden"
              />
            </label>
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
                    <div className="absolute top-2 left-2">
                        <label className="bg-white/80 backdrop-blur-sm p-1 rounded-full border border-white cursor-pointer transition-colors duration-200">
                          <PencilIcon className="h-4 w-4" />
                          <input
                            type="file"
                            onChange={(e) => handleUpdate(url, e.target.files[0])}
                            className="hidden"
                          />
                        </label>
                    </div>
                    <div className="absolute top-2 right-2">
                      <button onClick={() => handleDelete(url)} className="bg-white/80 backdrop-blur-sm p-1 rounded-full border border-white text-red-500 transition-colors duration-200">
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

          <div className="flex justify-end border-t border-gray-200 pt-4 mt-6">
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
    </div>
  );
};

export default UploadShopImages;
