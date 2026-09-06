import mqtt from 'mqtt';
import { parseCNCResponse } from '../hardware/cnc-protocol';

export interface TelemetryData {
  temp?: number;
  temperature?: number;
  vib?: number;
  vibration?: number;
  load?: number;
  flow?: number;
  cncStatus?: string;
  cncOk?: boolean;
  cncErrorCode?: number;
  cncAlarmCode?: number;
  position?: { x: number; y: number; z: number };
  [key: string]: any; // Allow other parsed JSON fields
}

export class HardwareController {
  private readonly simulationEnabled: boolean;
  private port: any | null = null;
  private writer: WritableStreamDefaultWriter<string> | null = null;
  private ws: WebSocket | null = null;
  private mqttClient: mqtt.MqttClient | null = null;

  private sensorListeners: Set<(data: TelemetryData) => void> = new Set();
  private rawDataListeners: Set<(data: string) => void> = new Set();
  onSensorData: ((data: TelemetryData) => void) | null = null;
  onError: ((error: string) => void) | null = null;

  constructor(options?: { simulation?: boolean }) {
    this.simulationEnabled = options?.simulation ?? import.meta.env.VITE_HARDWARE_SIMULATION === 'true';
  }

  addSensorListener(cb: (data: TelemetryData) => void) {
    this.sensorListeners.add(cb);
    return () => {
      this.sensorListeners.delete(cb);
    };
  }

  addRawDataListener(cb: (data: string) => void) {
    this.rawDataListeners.add(cb);
    return () => {
      this.rawDataListeners.delete(cb);
    };
  }

  emitSensorData(data: TelemetryData) {
    if (this.onSensorData) this.onSensorData(data);
    this.sensorListeners.forEach(cb => cb(data));
  }

  private isReading = false;

  async connectStream(url: string, topic?: string) {
    if (!url) {
      if (this.onError) this.onError('Connection failed: Empty URL provided');
      return false;
    }

    return new Promise<boolean>((resolve) => {
      try {
        const protocol = url.split(':')[0];
        if (['mqtt', 'ws', 'wss'].includes(protocol)) {
          if (protocol === 'mqtt' || topic) {
            this.mqttClient = mqtt.connect(url, {
              connectTimeout: 5000,
              reconnectPeriod: 2000
            });
            this.mqttClient.on('connect', () => {
              console.log('Connected to MQTT Broker:', url);
              if (topic) this.mqttClient?.subscribe(topic);
              else this.mqttClient?.subscribe('#');
              resolve(true);
            });
            this.mqttClient.on('error', (err) => {
              console.error('MQTT Error:', err);
              if (this.onError) this.onError(`MQTT Error: ${err.message}`);
              resolve(false);
            });
            this.mqttClient.on('message', (_receivedTopic, message) => {
              try {
                const msg = message.toString();
                this.parseHardwareData(msg);
              } catch (e) {
                console.error('Error processing MQTT message:', e);
              }
            });
          } else {
            this.ws = new WebSocket(url);
            this.ws.onopen = () => {
              console.log('Connected to WebSocket:', url);
              resolve(true);
            };
            this.ws.onerror = (e) => {
              console.error('WebSocket Error:', e);
              if (this.onError) this.onError('WebSocket connection failed. Verify URL and network.');
              resolve(false);
            };
            this.ws.onmessage = (event) => {
              try {
                this.parseHardwareData(event.data);
              } catch (e) {
                console.error('Error processing WebSocket message:', e);
              }
            };
          }
        } else {
          throw new Error(`Unsupported protocol: ${protocol}. Use ws://, wss:// or mqtt://`);
        }
      } catch (err: any) {
         console.error('Stream connection setup error:', err);
         if (this.onError) this.onError(`Setup failed: ${err.message}`);
         resolve(false);
      }
    });
  }

  async connect() {
    const nav = navigator as any;
    if (!('serial' in nav)) {
      const errorMsg = 'Web Serial API is not supported in this environment.';
      console.error(errorMsg);
      if (this.onError) this.onError(errorMsg);
      return false;
    }

    try {
      this.port = await nav.serial.requestPort();
      await this.port.open({ baudRate: 115200 });
      
      const textEncoder = new TextEncoderStream();
      textEncoder.readable.pipeTo(this.port.writable as WritableStream).catch(e => {
        console.error('Writable stream error:', e);
        if (this.onError) this.onError(`Serial write error: ${e.message}`);
      });
      this.writer = textEncoder.writable.getWriter();

      this.isReading = true;
      this.readLoop();

      console.log('Successfully connected to serial hardware.');
      return true;
    } catch (err: any) {
      console.error('Serial connection error:', err);
      if (this.onError) this.onError(`Hardware connection failed: ${err.message || 'Unknown error'}`);
      return false;
    }
  }

  private async readLoop() {
    if (!this.port || !this.port.readable) return;
    
    // We create a decoder that splits the stream by strings
    const textDecoder = new TextDecoderStream();
    this.port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();

    let buffer = '';

    try {
      while (this.isReading) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          let lines = buffer.split('\n');
          // keep the last incomplete chunk in the buffer
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
              console.log('📬 ARDUINO RX:', trimmed);
              this.parseHardwareData(trimmed);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error leyendo del puerto serial:', error);
    } finally {
      reader.releaseLock();
    }
  }

  private parseHardwareData(data: string) {
    if (!data) return;
    this.rawDataListeners.forEach(cb => cb(data));

    const trimmed = data.trim();
    if (trimmed.startsWith('<') || /^(ok|error:|alarm:)/i.test(trimmed)) {
      const cnc = parseCNCResponse(trimmed);
      this.emitSensorData({
        cncStatus: cnc.status,
        cncOk: cnc.ok,
        cncErrorCode: cnc.errorCode,
        cncAlarmCode: cnc.alarmCode,
        position: cnc.position,
      });
      return;
    }

    try {
      // Intentar forzar parseo JSON por si es un payload estructurado
      const parsed = JSON.parse(data);
      
      // Buscar recursivamente las métricas que nos importan dentro de la estructura (ej: AWS IoT envueltos)
      const extractMetrics = (obj: any): any => {
         let result: any = {};
         for (const key in obj) {
            if (typeof obj[key] === 'object' && obj[key] !== null) {
               Object.assign(result, extractMetrics(obj[key]));
            } else if (typeof obj[key] === 'number') {
               const k = key.toLowerCase();
               if (k === 'temp' || k === 'temperature') result.temperature = obj[key];
               if (k === 'vib' || k === 'vibration') result.vibration = obj[key];
               if (k === 'load' || k === 'rpm') result.load = obj[key];
            }
         }
         return result;
      };

      const extracted = extractMetrics(parsed);
      
      // Si logramos extraer algo útil, lo emitimos
      if (extracted.temperature !== undefined || extracted.vibration !== undefined || extracted.load !== undefined) {
          this.emitSensorData(extracted);
          return;
      }
      // Si no, emitimos el objeto crudo por si otra capa lo necesita
      this.emitSensorData(parsed);

    } catch (e) {
      // No era JSON, usar expresiones regulares robustas para data serial convencional
      let tempMatch = data.match(/(?:T|TEMP|TEMPERATURE)[:=\s]*([\d.-]+)/i);
      let vibeMatch = data.match(/(?:V|VIB|VIBRATION)[:=\s]*([\d.-]+)/i);
      let loadMatch = data.match(/(?:L|LOAD|RPM)[:=\s]*([\d.-]+)/i);

      let payload: any = {};
      let hasData = false;

      if (tempMatch) { payload.temperature = parseFloat(tempMatch[1]); hasData = true; }
      if (vibeMatch) { payload.vibration = parseFloat(vibeMatch[1]); hasData = true; }
      if (loadMatch) { payload.load = parseFloat(loadMatch[1]); hasData = true; }

      if (hasData) {
        this.emitSensorData(payload);
      }
    }
  }

  async sendCommand(gcode: string, fromSyncQueue: boolean = false) {
    if (typeof window !== 'undefined' && !navigator.onLine && !fromSyncQueue) {
      console.warn('[HardwareController] Device is offline. Queueing command:', gcode);
      const { offlineSync } = await import('./offlineSync');
      offlineSync.addTask('local_machine', 'sendCommand', { gcode });
      return;
    }

    console.log(`Enviando a máquina: ${gcode}`);
    try {
      if (this.writer) {
        await this.writer.write(gcode + '\n');
        return true;
      }

      if (this.simulationEnabled) {
        console.warn('Simulando envío de comando G-CODE:', gcode);
        // Wait for simulation
        await new Promise(resolve => setTimeout(resolve, 500));
        this.simulateGCodeEffect(gcode);
        return true;
      }

      const error = 'Hardware no conectado. Conecta un dispositivo o activa VITE_HARDWARE_SIMULATION para laboratorio.';
      if (this.onError) this.onError(error);
      return false;
    } catch (err: any) {
      console.error('Error enviando comando:', err);
      if (!fromSyncQueue && typeof window !== 'undefined') {
         console.warn('[HardwareController] Command failed. Queueing for retry:', gcode);
         const { offlineSync } = await import('./offlineSync');
         offlineSync.addTask('local_machine', 'sendCommand', { gcode });
      }
      if (this.onError) this.onError(`Command failed: ${err.message || 'Port disconnected'}`);
      return false;
    }
  }

  // Interprete virtual de G-code para simular la respuesta de los sensores al comando
  private simulateGCodeEffect(gcode: string) {
    const upperCmd = gcode.toUpperCase();
    
    let tempDiff = 0;
    let vibDiff = 0;
    let loadDiff = 0;

    // Reducir avance o detener
    if (upperCmd.includes('M5') || upperCmd.includes('M05')) { // Parada del cabezal
       tempDiff = -200;
       vibDiff = -3;
       loadDiff = -40;
    } else if (upperCmd.includes('M0') || upperCmd.includes('M112')) { // Pausa o Parada de emergencia
       tempDiff = -300;
       vibDiff = -5;
       loadDiff = -80;
    } 

    if (upperCmd.includes('F')) {
       // Feedrate detectado
       const match = upperCmd.match(/F(\d+)/);
       if (match && parseInt(match[1]) < 1000) {
         tempDiff -= 50;
         vibDiff -= 1;
       }
    }

    if (upperCmd.includes('S')) {
       // Spindle speed
       const match = upperCmd.match(/S(\d+)/);
       if (match && parseInt(match[1]) < 5000) {
         tempDiff -= 100;
         vibDiff -= 1.5;
         loadDiff -= 20;
       }
    }

    if (tempDiff !== 0 || vibDiff !== 0 || loadDiff !== 0) {
       console.log(`Interpreter: applying virtual telemetry diff`, {tempDiff, vibDiff, loadDiff});
       // Send a delta packet or absolute reading to App.tsx
       // We'll rely on App's state updater logic which currently might just override.
       // So we'll emit an event that signifies a "trend" or specific value drop. 
       // For a robust simulation, we'd keep true state here, but let's just trigger a sudden drop
       this.emitSensorData({
         temp: 350,   // Forced safe values for simulation
         vib: 1.5,
         load: 35
       });
       this.rawDataListeners.forEach(cb => cb(`ok (simulated effect)`));
    } else {
       this.rawDataListeners.forEach(cb => cb(`ok`));
    }
  }

  async disconnect() {
    if (this.mqttClient) {
      this.mqttClient.end();
      this.mqttClient = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.writer) {
      this.writer.releaseLock();
    }
    if (this.port) {
      await this.port.close();
      this.port = null;
    }
    console.log('Desconectado del hardware.');
  }

  // Comandos de automatización predefinidos
  async emergencyStop() {
    return this.sendCommand('M112'); // Parada de emergencia estándar
  }

  async startSpindle(rpm: number) {
    await this.sendCommand(`M3 S${rpm}`); // Iniciar husillo
  }

  async stopSpindle() {
    await this.sendCommand('M5'); // Detener husillo
  }

  async moveTo(x: number, y: number, z: number, feedrate: number) {
    await this.sendCommand(`G1 X${x} Y${y} Z${z} F${feedrate}`);
  }
}

export const hardware = new HardwareController();
