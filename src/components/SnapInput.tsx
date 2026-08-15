import { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2, AlertCircle }
  from 'lucide-react';
import { toast } from 'sonner';
import { auth } from '../lib/firebase';

interface SnapInputProps {
  onImageAnalysed: (text: string) => void;
  isPro: boolean;
}

export const SnapInput = ({ 
  onImageAnalysed, 
  isPro 
}: SnapInputProps) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState('image/jpeg');
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const openCamera = async () => {
    setCameraError('');
    try {
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };
      const stream = await navigator.mediaDevices
        .getUserMedia(constraints);
      streamRef.current = stream;
      setShowCamera(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(console.error);
        }
      }, 200);
    } catch (err: any) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError' || 
          err.name === 'PermissionDeniedError') {
        setCameraError(
          'Camera access denied. Click the padlock in ' +
          'your browser address bar and allow camera access.'
        );
      } else if (err.name === 'NotFoundError') {
        setCameraError(
          'No camera found on this device. ' +
          'Try uploading a photo instead.'
        );
      } else if (err.name === 'NotReadableError') {
        setCameraError(
          'Camera is being used by another app. ' +
          'Close other apps and try again.'
        );
      } else {
        setCameraError(
          'Could not open camera: ' + err.message + 
          '. Try uploading a photo instead.'
        );
      }
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current || 
      document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setPreview(dataUrl);
    setMimeType('image/jpeg');
    closeCamera();
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks()
        .forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setShowCamera(false);
  };

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image too large. Maximum 5MB.');
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreview(ev.target?.result as string);
      setMimeType(file.type);
    };
    reader.onerror = () => {
      toast.error('Could not read file. Please try again.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const analyseImage = async () => {
    if (!preview) {
      toast.error('Please take or upload a photo first.');
      return;
    }

    setIsAnalysing(true);
    try {
      const base64 = preview.split(',')[1];
      if (!base64) {
        toast.error('Invalid image data. Please try again.');
        return;
      }

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth.currentUser) {
        const idToken = await auth.currentUser.getIdToken();
        headers['Authorization'] = `Bearer ${idToken}`;
      }

      const response = await fetch('/api/analyze-image', {
        method: 'POST',
        headers,
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error === 'TOKEN_LIMIT_EXCEEDED') {
          toast.error('AI limit reached. Please try again later.');
        } else {
          toast.error(data.error || 'Analysis failed. Please try again.');
        }
        return;
      }

      onImageAnalysed(data.result);
      toast.success('Image analysed successfully!');
    } catch (err: any) {
      console.error('Snap analysis error:', err);
      toast.error(
        'Analysis failed: ' + (err.message || 'Unknown error') +
        '. Check your internet and try again.'
      );
    } finally {
      setIsAnalysing(false);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera View */}
      {showCamera && (
        <div className="space-y-3">
          <div className="relative bg-black rounded-xl 
            overflow-hidden aspect-video">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={capturePhoto}
              type="button"
              className="flex-1 py-3 bg-purple-600 
                hover:bg-purple-700 text-white rounded-xl 
                font-semibold transition-colors"
            >
              Capture Photo
            </button>
            <button
              onClick={closeCamera}
              type="button"
              className="px-4 py-3 bg-white/10 
                hover:bg-white/20 text-white rounded-xl 
                transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Camera Error */}
      {cameraError && !showCamera && (
        <div className="flex items-start gap-2 p-3 
          bg-red-500/10 border border-red-500/20 
          rounded-xl">
          <AlertCircle size={14} 
            className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300">
            {cameraError}
          </p>
        </div>
      )}

      {/* Image Preview */}
      {preview && !showCamera && (
        <div className="space-y-4">
          <div className="relative">
            <img
              src={preview}
              alt="Preview"
              className="w-full rounded-xl object-contain 
                max-h-64 bg-black/20"
            />
            <button
              onClick={() => {
                setPreview(null);
                setCameraError('');
              }}
              type="button"
              className="absolute top-2 right-2 w-8 h-8 
                bg-black/70 rounded-full flex items-center 
                justify-center text-white 
                hover:bg-black/90 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          <button
            onClick={analyseImage}
            disabled={isAnalysing}
            type="button"
            className="w-full py-3 bg-purple-600 
              hover:bg-purple-700 disabled:opacity-50 
              disabled:cursor-not-allowed text-white 
              rounded-xl font-semibold transition-colors 
              flex items-center justify-center gap-2"
          >
            {isAnalysing ? (
              <>
                <Loader2 size={18} 
                  className="animate-spin" />
                Analysing image...
              </>
            ) : (
              'Analyse & Generate Study Kit'
            )}
          </button>
        </div>
      )}

      {/* Initial State - no camera, no preview */}
      {!showCamera && !preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={openCamera}
              type="button"
              className="flex flex-col items-center 
                justify-center gap-3 p-6 rounded-2xl 
                border-2 border-dashed border-white/20 
                hover:border-purple-500/50 
                hover:bg-purple-500/5 
                transition-all cursor-pointer"
            >
              <Camera size={28} 
                className="text-purple-400" />
              <span className="text-sm font-medium 
                text-white/70">
                Take Photo
              </span>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              type="button"
              className="flex flex-col items-center 
                justify-center gap-3 p-6 rounded-2xl 
                border-2 border-dashed border-white/20 
                hover:border-purple-500/50 
                hover:bg-purple-500/5 
                transition-all cursor-pointer"
            >
              <Upload size={28} 
                className="text-purple-400" />
              <span className="text-sm font-medium 
                text-white/70">
                Upload Photo
              </span>
            </button>
          </div>

          <p className="text-xs text-center text-white/30">
            JPG, PNG, WebP - max 5MB
          </p>
          <p className="text-xs text-center text-white/20">
            Take a photo of your notes, textbook or 
            whiteboard and AI will extract the content
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      )}
    </div>
  );
};

export default SnapInput;
