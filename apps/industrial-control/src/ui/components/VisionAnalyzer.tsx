import { useState, useRef, useCallback, useEffect } from 'react';
import Webcam from 'react-webcam';
import { Camera, Scan, Cpu, Smartphone, X } from 'lucide-react';
import { getCurrentUser, isSupabaseEnabled, onAuthStateChanged, User } from '../../supabase';
import { Peer } from 'peerjs';
import { QRCodeSVG } from 'qrcode.react';

export function VisionAnalyzer() {
  const webcamRef = useRef<Webcam>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [user, setUser] = useState<User | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    if (!isSupabaseEnabled) {
      setUser({
        uid: 'local-user',
        email: 'local-user@example.com',
        displayName: 'Local Engineer'
      } as any);
      return;
    }
    const unsub = onAuthStateChanged(setUser);
    getCurrentUser().then(setUser);
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    
    // Destroy existing peer if any
    if (peer) peer.destroy();
    
    const p = new Peer(`vision-desk-${user.uid}`);
    setPeer(p);

    p.on('call', (call) => {
      call.answer(); // answer without returning a stream (one-way video)
      call.on('stream', (stream) => {
        setRemoteStream(stream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = stream;
        }
      });
      call.on('close', () => {
        setRemoteStream(null);
      });
    });

    return () => {
      p.destroy();
    };
  }, [user]);

  // If the remote stream is set but the video isn't tracking it properly, attach it.
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);


  const analyzeFrame = useCallback(async () => {
    let imageSrc: string | null = null;
    
    if (remoteStream && remoteVideoRef.current) {
       // Capture frame from standard `<video>`
       const canvas = document.createElement('canvas');
       canvas.width = remoteVideoRef.current.videoWidth || 640;
       canvas.height = remoteVideoRef.current.videoHeight || 480;
       const ctx = canvas.getContext('2d');
       if (ctx) {
           ctx.drawImage(remoteVideoRef.current, 0, 0, canvas.width, canvas.height);
           imageSrc = canvas.toDataURL('image/jpeg', 0.8);
       }
    } else if (webcamRef.current) {
       // Capture frame from webcam
       imageSrc = webcamRef.current.getScreenshot();
    }
    
    if (!imageSrc) {
       setError("No frame available to analyze");
       return;
    }

    setAnalyzing(true);
    setError(null);
    try {
      const response = await fetch('/api/analyze-vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageSrc })
      });

      if (!response.ok) {
        throw new Error('Vision API error');
      }

      const data = await response.json();
      setResults(data.responses?.[0] || null);
    } catch (err: any) {
      console.error(err);
      setError('Error analyzing frame');
    } finally {
      setAnalyzing(false);
    }
  }, [remoteStream]);

  const mobileUrl = `${window.location.protocol}//${window.location.host}/?role=mobile-cam`;

  return (
    <div className="glass-panel p-5 border border-white/10 shrink-0 relative">
      {/* QR Code Modal for Phone Sync */}
      {showQR && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur flex flex-col items-center justify-center p-6 rounded-xl border border-white/20">
           <button onClick={() => setShowQR(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
             <X size={24} />
           </button>
           <h3 className="text-white font-mono font-bold text-lg mb-2 flex items-center gap-2"><Smartphone /> LINK MOBILE SCANNER</h3>
           <p className="text-slate-400 text-xs mb-6 text-center max-w-[250px]">
             Scan this QR code with your phone. Ensure you log in with the exact same Google account to auto-sync the camera!
           </p>
           <div className="bg-white p-4 rounded-xl shadow-[0_0_20px_rgba(66,133,244,0.4)]">
              <QRCodeSVG value={mobileUrl} size={150} level="H" />
           </div>
           <a href={mobileUrl} target="_blank" className="mt-6 text-google-blue font-mono text-xs hover:underline">
             Open link directly (for testing)
           </a>
        </div>
      )}

      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-bold tracking-widest flex items-center gap-2 text-google-blue">
            <Camera size={16} /> GOOGLE CLOUD VISION API
          </h3>
          {user && (
            <button 
              onClick={() => setShowQR(true)}
              className={`border text-[10px] px-2 py-1 flex items-center gap-1 rounded font-mono transition-colors ${
                remoteStream 
                  ? 'border-google-green text-google-green bg-google-green/10 shadow-[0_0_10px_rgba(52,168,83,0.3)]' 
                  : 'border-slate-600 text-slate-400 bg-black/40 hover:text-white hover:border-white'
              }`}
            >
              <Smartphone size={12} /> {remoteStream ? 'PHONE SYNCED' : 'SYNC PHONE'}
            </button>
          )}
        </div>
        <button 
          onClick={analyzeFrame}
          disabled={analyzing}
          className="bg-google-blue hover:bg-blue-600 text-white font-mono text-xs px-3 py-1.5 rounded disabled:opacity-50 flex items-center gap-2 shadow-[0_0_10px_rgba(66,133,244,0.3)] transition-all"
        >
           {analyzing ? <Scan size={14} className="animate-spin" /> : <Cpu size={14} />} 
           {analyzing ? 'ANALYZING...' : 'CAPTURE & ANALYZE'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="relative rounded-lg overflow-hidden bg-black/60 border border-white/10 aspect-video flex items-center justify-center">
          {remoteStream ? (
             <video
               ref={remoteVideoRef}
               autoPlay
               playsInline
               muted
               className="w-full h-full object-cover"
             />
          ) : (
             <Webcam
               audio={false}
               ref={webcamRef}
               screenshotFormat="image/jpeg"
               className="w-full h-full object-cover"
               onUserMediaError={() => setError("No se detectó ninguna cámara. Por favor, conecta una o usa la sincronización móvil.")}
             />
          )}
          
          {remoteStream && (
            <div className="absolute top-2 left-2 bg-google-green/20 border border-google-green text-google-green px-2 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 backdrop-blur-md">
               <div className="w-1.5 h-1.5 bg-google-green rounded-full animate-pulse" /> LIVE STREAM PAIRED
            </div>
          )}

          {analyzing && (
            <div className="absolute inset-0 bg-blue-500/20 z-10 animate-pulse pointer-events-none border-2 border-google-blue" />
          )}
          <div className="absolute inset-0 z-20 pointer-events-none bg-[linear-gradient(transparent_0%,rgba(66,133,244,0.1)_50%,transparent_100%)] bg-[length:100%_4px] animate-scan" />
        </div>

        <div className="bg-black/40 border border-white/10 rounded-lg p-4 font-mono text-xs overflow-y-auto max-h-[300px] custom-scrollbar">
          {error && <div className="text-google-red mb-2">{error}</div>}
          
          {!results && !error && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
               <Scan size={32} className="mb-2" />
               <p>Awaiting Image Capture</p>
            </div>
          )}

          {results && (
            <div className="space-y-4">
              {results.labelAnnotations && (
                <div>
                  <div className="text-google-blue font-bold border-b border-white/10 pb-1 mb-2">Google Vision Labels</div>
                  <div className="space-y-1">
                    {results.labelAnnotations.map((lbl: any, i: number) => (
                      <div key={i} className="flex justify-between items-center text-slate-300">
                        <span>{lbl.description}</span>
                        <span className="text-emerald-400">{(lbl.score * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {results.localizedObjectAnnotations && (
                <div>
                  <div className="text-google-yellow font-bold border-b border-white/10 pb-1 mb-2">Detected Objects</div>
                  <div className="space-y-1 text-slate-300">
                     {results.localizedObjectAnnotations.map((obj: any, i: number) => (
                        <div key={i} className="flex justify-between items-center">
                          <span>{obj.name}</span>
                          <span className="text-emerald-400">{(obj.score * 100).toFixed(1)}%</span>
                        </div>
                     ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
