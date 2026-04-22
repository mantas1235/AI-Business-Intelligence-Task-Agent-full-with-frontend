import { useState } from 'react';
import { Maximize2, Download, X } from 'lucide-react';
import { API_BASE_URL } from '../api/client';

interface ChartImageProps {
  url: string;
}

export default function ChartImage({ url }: ChartImageProps) {
  const [isZoomed, setIsZoomed] = useState(false);
  const [loading, setLoading] = useState(true);

  const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

  const handleDownload = async () => {
    const response = await fetch(fullUrl);
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `chart-${Date.now()}.png`;
    link.click();
  };

  return (
    <div className="relative mt-3 group">
      {/* Pagrindinis paveikslėlis */}
      <div className="relative overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
        {loading && (
          <div className="flex h-48 items-center justify-center bg-slate-800 text-slate-400">
            Kraunamas grafikas...
          </div>
        )}
        <img
          src={fullUrl}
          alt="AI generated analysis chart"
          className={`w-full transition-opacity duration-300 ${loading ? 'opacity-0' : 'opacity-100'}`}
          onLoad={() => setLoading(false)}
        />
        
        {/* Valdymo mygtukai (pasirodo užvedus pelę) */}
        {!loading && (
          <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={() => setIsZoomed(true)}
              className="p-1.5 bg-slate-900/80 rounded-md text-white hover:bg-brand-600"
            >
              <Maximize2 size={16} />
            </button>
            <button 
              onClick={handleDownload}
              className="p-1.5 bg-slate-900/80 rounded-md text-white hover:bg-brand-600"
            >
              <Download size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Zoom Modal (Padidinimas per visą ekraną) */}
      {isZoomed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 animate-in fade-in duration-200">
          <button 
            onClick={() => setIsZoomed(false)}
            className="absolute top-6 right-6 text-white hover:text-brand-400"
          >
            <X size={32} />
          </button>
          <img src={fullUrl} alt="Zoomed chart" className="max-w-full max-h-full rounded-lg shadow-2xl" />
        </div>
      )}
    </div>
  );
}