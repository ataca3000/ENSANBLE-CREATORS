import { useState, useEffect } from 'react';
import { hardware } from '../../services/hardwareController';
import { Play, Square, AlertOctagon, Terminal, Cpu, Settings2, Power, Droplets, Wind, Blocks, Bot, Search, PlusCircle, Download } from 'lucide-react';
import { ArduinoFirmwareDialog } from './ArduinoFirmwareDialog';

export function HardwareControl() {
  const [activeTab, setActiveTab] = useState<'hmi' | 'lego'>('hmi');
  const [connected, setConnected] = useState(false);
  const [gcode, setGcode] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [showFirmwareDialog, setShowFirmwareDialog] = useState(false);
  
  // HMI State
  const [feedrate, setFeedrate] = useState(100);
  const [spindleSpeed, setSpindleSpeed] = useState(0);
  const [coolant, setCoolant] = useState(false);
  const [airAssist, setAirAssist] = useState(false);
  const [conveyor, setConveyor] = useState(false);

  // Sensor State
  const [sensorData, setSensorData] = useState<{ temp: number | null, vib: number | null, load: number | null }>({ temp: null, vib: null, load: null });
  const [lastUpdate, setLastUpdate] = useState<string>('--:--:--');

  useEffect(() => {
    const unsubSensor = hardware.addSensorListener((data) => {
      setSensorData(prev => ({
        temp: data.temp !== undefined ? data.temp : (data.temperature !== undefined ? data.temperature : prev.temp),
        vib: data.vib !== undefined ? data.vib : (data.vibration !== undefined ? data.vibration : prev.vib),
        load: data.load !== undefined ? data.load : prev.load
      }));
      setLastUpdate(new Date().toISOString().split('T')[1].slice(0,8));
    });

    const unsubRaw = hardware.addRawDataListener((rawData) => {
      // Don't show large JSONs in console normally, truncate if necessary
      const val = typeof rawData === 'string' ? rawData : JSON.stringify(rawData);
      setLogs(prev => [...prev.slice(-19), `[RX] ${val.length > 60 ? val.substring(0, 60) + '...' : val}`]);
    });

    return () => {
       unsubSensor();
       unsubRaw();
    };
  }, []);

  // Lego Builder State
  const [legoQuery, setLegoQuery] = useState('');
  const [legoLogs, setLegoLogs] = useState<{msg: string, isAi: boolean}[]>([
    { msg: "INIT ULTRON MANAGER (GEMINI CORE).", isAi: true },
    { msg: "Awaiting component request for compatibility check...", isAi: true }
  ]);
  const [components, setComponents] = useState([
    { defaultId: 'VLV-01', name: 'Electrovalve 12V', type: 'ACTUATOR', pin: 'D4' },
    { defaultId: 'SRV-X', name: 'NEMA 17 Stepper', type: 'SERVO', pin: 'PWM_1' }
  ]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-19), msg]);
  };

  // Stream Connection State
  const [streamUrl, setStreamUrl] = useState('wss://broker.hivemq.com:8443/mqtt');
  const [streamTopic, setStreamTopic] = useState('telemetry/#');
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const handleConnectStream = async () => {
    setConnectionStatus('connecting');
    setConnectionError(null);
    addLog(`[SYSTEM] Iniciando enlace a stream: ${streamUrl}`);
    try {
      const success = await hardware.connectStream(streamUrl, streamTopic || undefined);
      if (success) {
        setConnectionStatus('connected');
        setConnected(true);
        addLog('[SYSTEM] Conectado exitosamente al stream de datos.');
      } else {
        setConnectionStatus('error');
        setConnectionError('Fallo al establecer servidor de stream.');
        addLog('[ERROR] Fallo al establecer enlace web socket.');
      }
    } catch(err: any) {
      setConnectionStatus('error');
      setConnectionError(err.message || 'Fallo inesperado');
      addLog(`[ERROR] Conexión stream: ${err.message || 'Fallo inesperado'}`);
    }
  };

  const handleConnect = async () => {
    setConnectionStatus('connecting');
    setConnectionError(null);
    try {
      const success = await hardware.connect();
      if (success) {
        setConnectionStatus('connected');
        setConnected(true);
        addLog('[SYSTEM] Conectado a PLC/Controlador Industrial');
      } else {
        setConnectionStatus('error');
        setConnectionError('Conexión fallida.');
        addLog('[SYSTEM] Conexión fallida');
      }
    } catch (err: any) {
      setConnectionStatus('error');
      setConnectionError(err.message || 'Fallo inesperado');
      addLog(`[ERROR] Conexión PLC: ${err.message || 'Fallo inesperado'}`);
    }
  };

  const handleDisconnect = async () => {
    try {
      await hardware.disconnect();
      setConnected(false);
      setConnectionStatus('idle');
      addLog('[SYSTEM] Desconectado del hardware');
    } catch(err: any) {
      addLog(`[ERROR] Desconexión PLC: ${err.message || 'Fallo inesperado'}`);
    }
  };

  const handleEmergency = async () => {
    const sent = await hardware.emergencyStop();
    addLog(sent ? '[CRÍTICO] E-STOP ACTIVADO (HALT)' : '[ERROR] E-STOP no enviado: hardware no conectado');
  };


  const sendCustomGcode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gcode) return;
    const sent = await hardware.sendCommand(gcode);
    addLog(sent ? `[TX] ${gcode}` : `[ERROR] Comando no enviado: ${gcode}`);
    if (sent) setGcode('');
  };

  const handleLegoQuery = (e: React.FormEvent) => {
    e.preventDefault();
    if (!legoQuery) return;
    
    setLegoLogs(prev => [...prev, { msg: legoQuery, isAi: false }]);
    const query = legoQuery;
    setLegoQuery('');

    // Simulate ULTRON Agent using Gemini backend
    setTimeout(() => {
      setLegoLogs(prev => [...prev, { msg: `[ULTRON] Searching datasheet and compatibility for: "${query}"...`, isAi: true }]);
      
      setTimeout(() => {
        const id = Math.random().toString(36).substring(2, 6).toUpperCase();
        setLegoLogs(prev => [...prev, { msg: `[ULTRON] Match found! Suggested configuration: Pin mapping compatible with Arduino Mega / PLC Modbus RTU. Adding logic block.`, isAi: true }]);
        setComponents(prev => [...prev, { defaultId: `MOD-${id}`, name: query, type: 'SENSOR/ACTUATOR', pin: 'AUTO' }]);
      }, 1500);
    }, 500);
  };

  return (
    <div className="glass-panel p-5 flex flex-col h-full shrink-0 border border-white/5 bg-black/40">
       <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
         <div className="flex gap-4">
           <button 
             onClick={() => setActiveTab('hmi')}
             className={`text-sm font-medium font-mono tracking-widest flex items-center gap-2 transition-all ${activeTab === 'hmi' ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
           >
             <Cpu size={16} className={activeTab === 'hmi' ? 'text-blue-500' : ''} /> PLC HARDWARE LINK
           </button>
           <button 
             onClick={() => setActiveTab('lego')}
             className={`text-sm font-medium flex items-center gap-2 transition-all ${activeTab === 'lego' ? 'text-slate-800' : 'text-slate-400 hover:text-slate-600'}`}
           >
             <Blocks size={16} className={activeTab === 'lego' ? 'text-indigo-500' : ''} /> LEGO AUTOMATION (ULTRON)
           </button>
         </div>
         
         {activeTab === 'hmi' && (
          <div className="flex flex-col gap-2 relative z-10">
            <div className="flex items-center justify-end gap-2">
              {connectionError && (
                <div className="text-[10px] text-rose-500 font-mono flex items-center gap-1 bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20 shadow-sm animate-pulse">
                  <AlertOctagon size={10} /> {connectionError}
                </div>
              )}
              {connectionStatus === 'connecting' && (
                <div className="text-[10px] text-google-blue font-mono flex items-center gap-1 bg-google-blue/10 px-2 py-1 rounded border border-google-blue/20 shadow-sm">
                  <Power size={10} className="animate-spin" /> CONNECTING...
                </div>
              )}
              <button 
                onClick={() => setShowFirmwareDialog(true)}
                className="bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] px-2 py-1 rounded text-slate-300 font-mono flex items-center gap-1 shadow-sm transition-all"
              >
                <Download size={10} /> FIRMWARE SETUP
              </button>
              {connected ? (
                <button onClick={handleDisconnect} className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs px-2 py-1 rounded text-rose-500 font-mono flex items-center gap-1 shadow-sm">
                  <Square size={10} /> DISCONNECT
                </button>
              ) : (
                <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded p-1 shadow-inner">
                  <input 
                    type="text" 
                    value={streamUrl} 
                    onChange={e => {
                       setStreamUrl(e.target.value);
                       setConnectionError(null);
                    }} 
                    placeholder="wss:// / mqtt://" 
                    className={`text-[10px] p-1 font-mono outline-none bg-transparent text-slate-300 placeholder:text-slate-600 ${streamUrl.includes('mqtt') ? 'w-24' : 'w-36'}`}
                    title="Stream URL (ws:// or mqtt://)"
                    disabled={connectionStatus === 'connecting'}
                  />
                  {streamUrl.includes('mqtt') && (
                    <>
                      <div className="w-px h-3 bg-white/10 mx-0.5"></div>
                      <input 
                        type="text" 
                        value={streamTopic} 
                        onChange={e => setStreamTopic(e.target.value)} 
                        placeholder="topic" 
                        className="w-16 text-[10px] p-1 font-mono outline-none bg-transparent text-slate-300 placeholder:text-slate-600"
                        title="MQTT Topic"
                        disabled={connectionStatus === 'connecting'}
                      />
                    </>
                  )}
                  <button 
                    onClick={handleConnectStream} 
                    disabled={connectionStatus === 'connecting' || !streamUrl}
                    className="bg-google-blue hover:bg-blue-600 disabled:bg-slate-700 text-white text-[10px] px-2 py-1 rounded font-mono shadow-sm transition-all flex items-center gap-1"
                  >
                    <Power size={10} /> STREAM
                  </button>
                  <div className="w-px h-4 bg-white/20 mx-1"></div>
                  <button 
                    onClick={handleConnect} 
                    disabled={connectionStatus === 'connecting'}
                    className="bg-emerald-600 border border-emerald-500/50 hover:bg-emerald-500 disabled:bg-slate-700 text-white text-[10px] px-2 py-1 rounded font-mono shadow-sm transition-all flex items-center gap-1"
                    title="Connect via Web Serial API (USB)"
                  >
                    <Play size={10} /> SERIAL
                  </button>
                </div>
              )}
            </div>
          </div>
         )}
      </div>

      <ArduinoFirmwareDialog isOpen={showFirmwareDialog} onClose={() => setShowFirmwareDialog(false)} />

      {activeTab === 'hmi' ? (
        <div className="flex flex-col gap-4 flex-1 h-full overflow-hidden">
          <div className="grid grid-cols-12 gap-4 shrink-0">
            {/* Left Panel: Primary Controls */}
            <div className="col-span-12 md:col-span-5 flex flex-col gap-3">
              <button onClick={handleEmergency} className="w-full bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/50 text-rose-500 shadow-[0_0_15px_rgba(234,67,53,0.3)] py-4 rounded-md font-black flex flex-col items-center justify-center gap-1 uppercase tracking-widest transition-all">
                <AlertOctagon size={24} />
                E-STOP (HALT)
              </button>
              
              <div className="bg-black/50 border border-white/10 rounded-md p-3 flex-1 flex flex-col justify-center shadow-inner">
                <div className="flex justify-between text-xs text-slate-500 mb-2 font-mono">
                  <span>SPINDLE RPM</span>
                  <span className="text-white">{spindleSpeed}</span>
                </div>
                <input 
                  type="range" min="0" max="24000" step="1000" 
                  value={spindleSpeed} 
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setSpindleSpeed(val);
                    if (val > 0) hardware.startSpindle(val);
                    else hardware.stopSpindle();
                  }}
                  className="w-full accent-slate-800 mb-4"
                />

                <div className="flex justify-between text-xs text-slate-500 mb-2 font-mono">
                  <span>AUTO FEEDRATE (%)</span>
                  <span className="text-white">{feedrate}%</span>
                </div>
                <input 
                  type="range" min="10" max="200" step="10" 
                  value={feedrate} 
                  onChange={(e) => setFeedrate(parseInt(e.target.value))}
                  className="w-full accent-slate-800"
                />
              </div>
            </div>

            {/* Right Panel: Toggles & Consoles */}
            <div className="col-span-12 md:col-span-7 flex flex-col gap-3">
              {/* Action Grid */}
              <div className="grid grid-cols-3 gap-2">
                <button 
                  onClick={() => { setCoolant(!coolant); addLog(`[HMI] COOLANT ${!coolant ? 'ON' : 'OFF'}`); }}
                  className={`p-2 rounded border flex flex-col items-center justify-center gap-1 transition-all ${coolant ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.2)]' : 'bg-white/5 border-white/10 text-slate-500 hover:bg-white/10 hover:text-slate-300'}`}
                >
                  <Droplets size={16} /> <span className="text-[10px] font-mono">COOLANT</span>
                </button>
                <button 
                  onClick={() => { setAirAssist(!airAssist); addLog(`[HMI] AIR ASSIST ${!airAssist ? 'ON' : 'OFF'}`); }}
                  className={`p-2 rounded border flex flex-col items-center justify-center gap-1 transition-all ${airAssist ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.2)]' : 'bg-white/5 border-white/10 text-slate-500 hover:bg-white/10 hover:text-slate-300'}`}
                >
                  <Wind size={16} /> <span className="text-[10px] font-mono">AIR ASST.</span>
                </button>
                <button 
                  onClick={() => { setConveyor(!conveyor); addLog(`[HMI] CONVEYOR ${!conveyor ? 'RUNNING' : 'STOP'}`); }}
                  className={`p-2 rounded border flex flex-col items-center justify-center gap-1 transition-all ${conveyor ? 'bg-orange-500/10 border-orange-500/30 text-orange-400 shadow-[0_0_10px_rgba(249,115,22,0.2)]' : 'bg-white/5 border-white/10 text-slate-500 hover:bg-white/10 hover:text-slate-300'}`}
                >
                  <Settings2 size={16} /> <span className="text-[10px] font-mono">CONVEYOR</span>
                </button>
              </div>

              <form onSubmit={sendCustomGcode} className="flex gap-2">
                <div className="relative flex-1">
                  <Terminal size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    value={gcode}
                    onChange={(e) => setGcode(e.target.value.toUpperCase())}
                    placeholder="PROMPT / G-CODE" 
                    className="w-full pl-7 bg-black/40 border border-white/10 rounded-md py-1.5 text-sm font-mono text-emerald-400 focus:outline-none focus:border-emerald-500 uppercase placeholder:normal-case placeholder:text-slate-600 shadow-inner"
                  />
                </div>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 border border-emerald-500/50 text-white px-3 rounded-md text-xs font-mono font-medium transition-colors">
                  TX
                </button>
              </form>

              <div className="flex-1 bg-black/50 border border-white/10 rounded-md p-2 font-mono text-[10px] text-emerald-400 overflow-y-auto relative min-h-[140px] shadow-inner flex flex-col justify-end">
                <div className="text-slate-500 mb-1 sticky top-0 bg-transparent pb-1 text-xs border-b border-white/10 flex justify-between">
                  <span>=== G-CODE TERMINAL ===</span>
                  <span className="text-emerald-600 animate-pulse">● LIVE</span>
                </div>
                <div className="flex flex-col mt-auto pt-2">
                  {logs.map((log, i) => {
                    let logColor = 'text-emerald-400';
                    if (log.includes('CRÍTICO') || log.includes('ERROR')) logColor = 'text-rose-500 font-bold';
                    else if (log.startsWith('[TX]')) logColor = 'text-blue-400';
                    else if (log.startsWith('[SYSTEM]') || log.startsWith('[HMI]')) logColor = 'text-slate-400';
                    return (
                      <div key={i} className={`whitespace-pre-wrap break-all ${logColor}`}>
                        {log}
                      </div>
                    );
                  })}
                  {!logs.length && <div className="text-slate-600">Waiting for connection...</div>}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 bg-black/40 border border-white/10 rounded-md p-2 flex flex-col overflow-hidden">
            <h4 className="text-[10px] text-google-blue font-mono mb-2 shrink-0 tracking-widest border-b border-white/10 pb-1 uppercase">REAL-TIME PLC REGISTERS</h4>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-black/90 backdrop-blur z-10 shadow-sm border-b border-white/10">
                  <tr className="text-[9px] text-slate-500 font-mono tracking-wider border-b border-white/10">
                    <th className="py-1 px-2 font-medium">TAG NAME</th>
                    <th className="py-1 px-2 font-medium">VALUE</th>
                    <th className="py-1 px-2 font-medium">TIMESTAMP</th>
                    <th className="py-1 px-2 font-medium">STATUS</th>
                  </tr>
                </thead>
                <tbody className="text-[10px] font-mono text-slate-400">
                  <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-1.5 px-2 text-google-blue">M_SPINDLE_RPM</td>
                    <td className="py-1.5 px-2 font-bold text-white">{spindleSpeed}</td>
                    <td className="py-1.5 px-2 text-slate-500">{lastUpdate !== '--:--:--' ? lastUpdate : new Date().toISOString().split('T')[1].slice(0,8)}</td>
                    <td className="py-1.5 px-2 text-google-green">OK</td>
                  </tr>
                  <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-1.5 px-2 text-google-blue">VLV_COOLANT_ST</td>
                    <td className="py-1.5 px-2 text-white">{coolant ? 'TRUE' : 'FALSE'}</td>
                    <td className="py-1.5 px-2 text-slate-500">{lastUpdate !== '--:--:--' ? lastUpdate : new Date().toISOString().split('T')[1].slice(0,8)}</td>
                    <td className="py-1.5 px-2">{coolant ? <span className="text-cyan-400 font-bold">ACTIVE</span> : <span className="text-slate-600">IDLE</span>}</td>
                  </tr>
                  <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-1.5 px-2 text-google-blue">AIR_ASSIST_VLV</td>
                    <td className="py-1.5 px-2 text-white">{airAssist ? '1' : '0'}</td>
                    <td className="py-1.5 px-2 text-slate-500">{lastUpdate !== '--:--:--' ? lastUpdate : new Date().toISOString().split('T')[1].slice(0,8)}</td>
                    <td className="py-1.5 px-2 text-google-green">OK</td>
                  </tr>
                  <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-1.5 px-2 text-google-blue">CONV_MTR_SPD</td>
                    <td className="py-1.5 px-2 text-white">{conveyor ? '1500' : '0'}</td>
                    <td className="py-1.5 px-2 text-slate-500">{lastUpdate !== '--:--:--' ? lastUpdate : new Date().toISOString().split('T')[1].slice(0,8)}</td>
                    <td className="py-1.5 px-2">{conveyor ? <span className="text-orange-400 font-bold">RUNNING</span> : <span className="text-slate-600">IDLE</span>}</td>
                  </tr>
                  <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-1.5 px-2 text-google-blue">TEMP_SENSOR</td>
                    <td className="py-1.5 px-2 font-bold text-white">{sensorData.temp !== null ? `${sensorData.temp.toFixed(1)} °C` : '---'}</td>
                    <td className="py-1.5 px-2 text-slate-500">{lastUpdate}</td>
                    <td className="py-1.5 px-2">{sensorData.temp !== null && sensorData.temp > 800 ? <span className="text-rose-500 font-bold">WARN</span> : <span className="text-google-green">OK</span>}</td>
                  </tr>
                  <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-1.5 px-2 text-google-blue">VIB_SENSOR</td>
                    <td className="py-1.5 px-2 font-bold text-white">{sensorData.vib !== null ? `${sensorData.vib.toFixed(2)} mm/s` : '---'}</td>
                    <td className="py-1.5 px-2 text-slate-500">{lastUpdate}</td>
                    <td className="py-1.5 px-2">{sensorData.vib !== null && sensorData.vib > 5 ? <span className="text-rose-500 font-bold">WARN</span> : <span className="text-google-green">OK</span>}</td>
                  </tr>
                  <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-1.5 px-2 text-google-blue">LOAD_SENSOR</td>
                    <td className="py-1.5 px-2 font-bold text-white">{sensorData.load !== null ? `${sensorData.load.toFixed(1)} %` : '---'}</td>
                    <td className="py-1.5 px-2 text-slate-500">{lastUpdate}</td>
                    <td className="py-1.5 px-2">{sensorData.load !== null && sensorData.load > 85 ? <span className="text-rose-500 font-bold">WARN</span> : <span className="text-google-green">OK</span>}</td>
                  </tr>
                  <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-1.5 px-2 text-google-blue">AXIS_X_POS</td>
                    <td className="py-1.5 px-2 text-white">145.23</td>
                    <td className="py-1.5 px-2 text-slate-500">{lastUpdate !== '--:--:--' ? lastUpdate : new Date().toISOString().split('T')[1].slice(0,8)}</td>
                    <td className="py-1.5 px-2 text-google-green">OK</td>
                  </tr>
                  <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-1.5 px-2 text-google-blue">AXIS_Y_POS</td>
                    <td className="py-1.5 px-2 text-white">-22.10</td>
                    <td className="py-1.5 px-2 text-slate-500">{lastUpdate !== '--:--:--' ? lastUpdate : new Date().toISOString().split('T')[1].slice(0,8)}</td>
                    <td className="py-1.5 px-2 text-google-green">OK</td>
                  </tr>
                  <tr className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-1.5 px-2 text-google-blue">ESTOP_RELAY</td>
                    <td className="py-1.5 px-2 font-bold text-rose-500">FALSE</td>
                    <td className="py-1.5 px-2 text-slate-500">{lastUpdate !== '--:--:--' ? lastUpdate : new Date().toISOString().split('T')[1].slice(0,8)}</td>
                    <td className="py-1.5 px-2 text-google-green">SECURE</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4 flex-1">
          {/* Builder Blocks */}
          <div className="col-span-12 md:col-span-7 flex flex-col gap-3">
             <div className="flex justify-between items-center">
               <span className="text-xs text-google-blue font-mono tracking-widest font-bold">CURRENT LOGIC BLOCKS</span>
               <span className="text-[10px] bg-google-blue/10 text-google-blue px-2 py-0.5 rounded border border-google-blue/20">MODBUS COMPATIBLE</span>
             </div>
             <div className="flex-1 bg-black/40 border border-white/10 rounded-lg p-3 overflow-y-auto space-y-2">
                {components.map((c, i) => (
                  <div key={i} className="flex items-center justify-between bg-black/60 border border-white/5 p-2 rounded-md hover:border-google-blue transition-colors cursor-grab shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="bg-google-blue/10 text-google-blue text-[10px] font-bold px-2 py-1 rounded w-16 text-center border border-google-blue/20">{c.defaultId}</div>
                      <div>
                        <div className="text-sm font-semibold text-white">{c.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{c.type}</div>
                      </div>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 bg-white/5 border border-white/5 px-2 py-1 rounded">PIN: {c.pin}</div>
                  </div>
                ))}
                <div className="border border-dashed border-white/20 rounded-md p-3 flex flex-col items-center justify-center text-slate-500 hover:text-google-blue hover:border-google-blue/50 transition-colors cursor-pointer opacity-80 bg-white/5 shadow-sm">
                   <PlusCircle size={20} className="mb-1" />
                   <span className="text-xs font-mono tracking-widest uppercase">DRAG & DROP MODULE</span>
                </div>
             </div>
          </div>

          {/* Ultron Chatbot */}
          <div className="col-span-12 md:col-span-5 flex flex-col gap-3 min-h-[200px]">
            <div className="flex-1 bg-black/40 border border-white/10 rounded-lg flex flex-col overflow-hidden relative shadow-sm">
              <div className="bg-black/60 border-b border-white/10 p-2 flex items-center gap-2">
                <Bot size={14} className="text-google-blue" />
                <span className="text-[10px] text-white font-mono font-bold tracking-wider">ULTRON AUTO-CONFIG AGENT</span>
              </div>
              
              <div className="flex-1 p-3 overflow-y-auto space-y-3 font-mono text-[10px] bg-black/20">
                {legoLogs.map((log, i) => (
                  <div key={i} className={`flex ${log.isAi ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[85%] rounded p-2 border shadow-sm ${log.isAi ? 'bg-google-blue/10 border-google-blue/20 text-google-blue' : 'bg-white/5 border-white/10 text-slate-300'}`}>
                      {log.msg}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-2 border-t border-white/10 bg-black/40">
                <form onSubmit={handleLegoQuery} className="flex gap-2">
                  <div className="relative flex-1">
                    <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input 
                      type="text" 
                      value={legoQuery}
                      onChange={(e) => setLegoQuery(e.target.value)}
                      placeholder="e.g. Add 24V Solenoid Valve" 
                      className="w-full pl-6 bg-black/50 border border-white/10 rounded px-2 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-google-blue placeholder:text-slate-600"
                    />
                  </div>
                  <button type="submit" className="bg-google-blue/10 hover:bg-google-blue/20 border border-google-blue/30 text-google-blue px-3 py-1.5 rounded text-[10px] font-bold transition-colors">
                    ASK
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
