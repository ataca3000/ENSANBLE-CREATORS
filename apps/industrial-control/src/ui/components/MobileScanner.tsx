import { useEffect, useRef, useState } from 'react';
import { Camera, X, RefreshCw, Signal } from 'lucide-react';
import { getCurrentUser, isSupabaseEnabled, onAuthStateChanged, signInWithGoogle } from '../../supabase';
import Peer from 'peerjs';

export function MobileScanner() {
  const [user, setUser] = useState<any>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [status, setStatus] = useState<string>('Initializing...');
  const [connected, setConnected] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  const login = () => {
    if (!isSupabaseEnabled) return;
    signInWithGoogle().catch(console.error);
  };

  const startCameraAndCall = async () => {
    if (!user) return;
    setStatus('Requesting camera access...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setStatus('Connecting to desktop...');
      const p = new Peer(`vision-mob-${user.uid}`);
      setPeer(p);

      p.on('open', () => {
        setStatus('Linking to desktop session...');
        const call = p.call(`vision-desk-${user.uid}`, stream);
        
        call.on('stream', () => {
          // the desktop might send stream back, we ignore.
        });

        call.on('close', () => {
          setConnected(false);
          setStatus('Desktop disconnected.');
        });
        
        call.on('error', (err) => {
          setStatus('Call Error: ' + err.message);
          setConnected(false);
        });

        // assuming connected if call starts
        setConnected(true);
        setStatus('Streaming live. Point at equipment!');
      });

      p.on('error', (err) => {
        setStatus('Connection error: ' + err.message);
      });

    } catch (err: any) {
      setStatus('Camera error: ' + err.message);
    }
  };

  useEffect(() => {
    if (user && !connected && !streamRef.current) {
      startCameraAndCall();
    }
  }, [user]);

  const cleanup = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (peer) {
      peer.destroy();
    }
  };

  useEffect(() => {
    return cleanup;
  }, []);

  if (!user) {
    return (
      <div className="fixed inset-0 bg-black flex flex-col items-center justify-center p-6 z-50">
        <Camera size={48} className="text-google-blue mb-4" />
        <h1 className="text-white text-xl font-bold font-mono tracking-widest mb-6 text-center">REMOTE SCANNER LOGIN</h1>
        <p className="text-slate-400 text-center mb-8 text-sm">Please sign in with the same account as your Desktop to sync the camera stream.</p>
        <button onClick={login} className="bg-google-blue hover:bg-blue-600 text-white font-mono font-bold px-6 py-3 rounded-lg flex items-center gap-2 shadow-[0_0_15px_rgba(66,133,244,0.5)]">
          SIGN IN TO SYNC
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black flex flex-col z-[100] text-white">
      <div className="p-4 bg-black/80 backdrop-blur border-b border-white/10 flex justify-between items-center z-10 shrink-0">
        <div className="flex items-center gap-2">
          <Camera size={20} className={connected ? "text-google-green" : "text-slate-500"} />
          <span className="font-mono font-bold text-sm">MOBILE SCANNER</span>
        </div>
        <div className="flex items-center gap-2">
           <Signal size={16} className={connected ? "text-google-green" : "text-rose-500"} />
           <span className="font-mono text-xs">{connected ? "LINKED" : "OFFLINE"}</span>
        </div>
      </div>

      <div className="flex-1 relative bg-black">
        <video 
          ref={videoRef} 
          width="100%" 
          height="100%" 
          autoPlay 
          playsInline 
          muted 
          className="w-full h-full object-cover"
        />
        
        {/* Overlays */}
        {!connected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-20">
             <RefreshCw size={32} className="text-google-blue animate-spin mb-4" />
             <div className="font-mono text-sm text-google-blue text-center px-6">{status}</div>
             <button onClick={() => { cleanup(); startCameraAndCall(); }} className="mt-6 border border-white/20 px-4 py-2 rounded font-mono text-xs hover:bg-white/10">
               RETRY CONNECTION
             </button>
          </div>
        )}

        {connected && (
          <div className="absolute inset-0 pointer-events-none z-20">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-dashed border-white/30 rounded-3xl" />
             <div className="absolute top-4 left-0 w-full text-center">
               <span className="bg-black/50 text-white font-mono text-xs px-3 py-1 rounded-full backdrop-blur">Scan objects for Desktop Analysis</span>
             </div>
          </div>
        )}
      </div>

      <div className="p-6 bg-black/80 backdrop-blur border-t border-white/10 flex justify-between items-center z-10 shrink-0">
         <button onClick={() => window.location.href = '/'} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
            <X size={20} /> <span className="font-mono text-sm">CLOSE</span>
         </button>
         {connected && <div className="text-xs font-mono text-emerald-400 animate-pulse flex items-center"><div className="w-2 h-2 rounded-full bg-emerald-500 mr-2" /> LIVE STREAMING</div>}
      </div>
    </div>
  );
}
