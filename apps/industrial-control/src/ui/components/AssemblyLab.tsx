import React, { useState, useEffect, Suspense, useRef } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  Grid,
  Html,
  QuadraticBezierLine,
  Line,
} from "@react-three/drei";
import {
  Plus,
  Boxes,
  Trash2,
  Cloud,
  UploadCloud,
  LogIn,
  Upload,
  Link2,
  Unlink,
  X,
  Activity,
  WifiOff,
  Clock,
  ArrowRightCircle,
  Sparkles,
  Loader2,
  Ruler,
  Cpu,
} from "lucide-react";
import {
  db,
  auth,
  handleSupabaseError,
  OperationType,
  isSupabaseEnabled,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  User,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from "../../supabase";
import * as THREE from "three";
// @ts-ignore
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
// @ts-ignore
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { offlineSync, OfflineTask } from "../../services/offlineSync";
import { PrototypeBox } from "./PrototypeBox";
import { eventBus } from "../../services/eventBus";
import {
  getSpatialAnalysis,
  SpatialSuggestion,
} from "../../services/spatialAnalysisService";
import { SuggestionMarker } from "./SuggestionMarker";
import { ScanningLaser } from "./ScanningLaser";
import { ArduinoFirmwareDialog } from "./ArduinoFirmwareDialog";

const CustomModel = ({ url, fileExt }: { url: string; fileExt: string }) => {
  const isGLTF = fileExt === "gltf" || fileExt === "glb";
  const Loader = isGLTF ? GLTFLoader : OBJLoader;

  try {
    const object = useLoader(Loader as any, url);
    const scene = isGLTF ? (object as any).scene : object;
    return <primitive object={scene.clone()} />;
  } catch (err) {
    return (
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="red" />
      </mesh>
    );
  }
};

const MachineNode = ({
  id,
  index,
  position,
  type,
  url,
  fileExt,
  images,
  isSelected,
  isValidTarget,
  isInvalidTarget,
  onNodeClick,
  onRemove,
}: {
  id: string;
  index: number;
  position: [number, number, number];
  type: string;
  url?: string;
  fileExt?: string;
  images?: string[];
  isSelected?: boolean;
  isValidTarget?: boolean;
  isInvalidTarget?: boolean;
  onNodeClick?: (id: string) => void;
  onRemove: () => void;
}) => {
  return (
    <group
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onNodeClick?.(id);
      }}
    >
      {isSelected && (
        <mesh position={[0, 0.1, 0]}>
          <ringGeometry args={[1.5, 1.7, 32]} />
          <meshBasicMaterial color="#4285F4" side={2} />
          <lineSegments>
            <edgesGeometry args={[new THREE.RingGeometry(1.5, 1.7, 32)]} />
            <lineBasicMaterial color="#4285F4" />
          </lineSegments>
        </mesh>
      )}
      {isValidTarget && (
        <mesh position={[0, 0.1, 0]}>
          <ringGeometry args={[1.5, 1.7, 32]} />
          <meshBasicMaterial
            color="#34a853"
            side={2}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}

      {type === "cnc" && (
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[1.5, 1, 1]} />
          <meshStandardMaterial
            color={isSelected ? "#60a5fa" : "#3b82f6"}
            metalness={0.5}
            roughness={0.5}
          />
        </mesh>
      )}
      {type === "robot" && (
        <group position={[0, 0, 0]}>
          <mesh position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.3, 0.4, 0.5]} />
            <meshStandardMaterial color={isSelected ? "#fbbf24" : "#f59e0b"} />
          </mesh>
          <mesh position={[0, 1, 0]}>
            <boxGeometry args={[0.2, 1.2, 0.2]} />
            <meshStandardMaterial color={isSelected ? "#fde047" : "#fcd34d"} />
          </mesh>
        </group>
      )}
      {type === "conveyor" && (
        <mesh position={[0, 0.2, 0]}>
          <boxGeometry args={[3, 0.4, 0.8]} />
          <meshStandardMaterial color={isSelected ? "#94a3b8" : "#64748b"} />
        </mesh>
      )}
      {type === "custom" && url && fileExt && (
        <Suspense
          fallback={
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[1, 1, 1]} />
              <meshStandardMaterial color="gray" />
            </mesh>
          }
        >
          <CustomModel url={url} fileExt={fileExt} />
        </Suspense>
      )}
      {type === "prototype" && images && (
        <Suspense
          fallback={
            <mesh position={[0, 0.5, 0]}>
              <boxGeometry args={[1.5, 1.5, 1.5]} />
              <meshStandardMaterial color="gray" />
            </mesh>
          }
        >
          <PrototypeBox images={images} position={[0, 0.75, 0]} />
        </Suspense>
      )}
      {type === "motor" && (
        <group position={[0, 0.3, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.4, 0.4, 1, 32]} />
            <meshStandardMaterial
              color="#475569"
              metalness={0.8}
              roughness={0.2}
            />
          </mesh>
          <mesh position={[0.6, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.1, 0.1, 0.5]} />
            <meshStandardMaterial color="#cbd5e1" />
          </mesh>
        </group>
      )}
      {type === "servo" && (
        <group position={[0, 0.25, 0]}>
          <mesh>
            <boxGeometry args={[0.8, 0.5, 0.4]} />
            <meshStandardMaterial color="#1e293b" />
          </mesh>
          <mesh position={[0.2, 0.3, 0]}>
            <cylinderGeometry args={[0.2, 0.2, 0.1]} />
            <meshStandardMaterial color="#4285F4" />
          </mesh>
        </group>
      )}
      {type === "valve" && (
        <group position={[0, 0.4, 0]}>
          <mesh>
            <cylinderGeometry args={[0.3, 0.3, 0.8]} />
            <meshStandardMaterial color="#94a3b8" />
          </mesh>
          <mesh position={[0, 0.5, 0]}>
            <boxGeometry args={[0.4, 0.4, 0.4]} />
            <meshStandardMaterial color="#ef4444" />
          </mesh>
        </group>
      )}
      {type === "roller" && (
        <mesh position={[0, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.2, 0.2, 2]} />
          <meshStandardMaterial color="#334155" />
        </mesh>
      )}

      <Html position={[0, 2, 0]} center zIndexRange={[100, 0]}>
        <div
          className={`bg-slate-900/80 text-white px-2 py-1 rounded-md text-xs whitespace-nowrap backdrop-blur-sm border ${isSelected ? "border-google-blue" : isValidTarget ? "border-google-green text-google-green" : isInvalidTarget ? "border-transparent opacity-40 cursor-not-allowed text-slate-500" : "border-slate-700"} shadow-sm flex items-center gap-2 ${isInvalidTarget ? "" : "cursor-pointer"} transition-all ${!isInvalidTarget && "hover:border-google-blue"}`}
        >
          <span>AUTOMATA {index}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Eliminar Automata"
            className={`text-rose-400 hover:text-rose-300 ${isInvalidTarget ? "pointer-events-none" : ""}`}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </Html>
    </group>
  );
};

export function AssemblyLab() {
  const [machines, setMachines] = useState<
    {
      id: string;
      type: string;
      position: [number, number, number];
      sensors?: string[];
      images?: string[];
    }[]
  >([]);
  const [customMachines, setCustomMachines] = useState<
    {
      id: string;
      type: string;
      position: [number, number, number];
      url: string;
      fileExt: string;
      sensors?: string[];
      images?: string[];
    }[]
  >([]);
  const [connections, setConnections] = useState<
    { id: string; fromId: string; toId: string }[]
  >([]);
  const [connectMode, setConnectMode] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedMachineDetails, setSelectedMachineDetails] =
    useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<SpatialSuggestion[]>([]);
  const [isFirmwareOpen, setIsFirmwareOpen] = useState(false);
  const [generatedFirmware, setGeneratedFirmware] = useState("");
  const [measureMode, setMeasureMode] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<THREE.Vector3[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);

  const [isOnline, setIsOnline] = useState(offlineSync.isOnline);
  const [offlineTasks, setOfflineTasks] = useState<OfflineTask[]>([]);

  useEffect(() => {
    const unsub = offlineSync.subscribe(() => {
      setIsOnline(offlineSync.isOnline);
      if (selectedMachineDetails) {
        setOfflineTasks(
          offlineSync.getTasksByMachine(selectedMachineDetails.id),
        );
      }
    });
    // Initialize offline state for the current selection
    if (selectedMachineDetails) {
      setOfflineTasks(offlineSync.getTasksByMachine(selectedMachineDetails.id));
    }
    return () => {
      unsub();
    };
  }, [selectedMachineDetails, isOnline]); // Añadida dependencia para estabilidad

  const allNodes: Array<{
    id: string;
    type: string;
    position: [number, number, number];
    url?: string;
    fileExt?: string;
    sensors?: string[];
    images?: string[];
  }> = [...machines, ...customMachines];

  useEffect(() => {
    if (!isSupabaseEnabled) {
      setUser({
        uid: "local-user",
        email: "local-user@example.com",
        displayName: "Local Engineer",
        photoURL:
          "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100",
      } as any);
      return;
    }
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) {
      setMachines([]);
      return;
    }

    if (!isSupabaseEnabled) {
      const localData = localStorage.getItem("nexus_cam_machines");
      if (localData) {
        try {
          setMachines(JSON.parse(localData));
        } catch (e) {
          console.error("Error loading machines from local storage", e);
        }
      } else {
        setMachines([]);
      }
      return;
    }

    const machinesRef = collection(db, "users", user.uid, "machines");
    const unsub = onSnapshot(
      machinesRef,
      (snapshot) => {
        const loadedMachines: any[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          loadedMachines.push({
            id: doc.id,
            type: data.type,
            position: [data.positionX, data.positionY, data.positionZ],
            sensors: data.sensors || [],
            images: data.images || [],
          });
        });
        setMachines(loadedMachines);
      },
      (error) => {
        handleSupabaseError(
          error,
          OperationType.LIST,
          `users/${user.uid}/machines`,
        );
      },
    );
    return unsub;
  }, [user]);

  useEffect(() => {
    const unsub = eventBus.on(
      "add-machine",
      (data: { type: string; extraData?: any }) => {
        addMachine(data.type, data.extraData || {});
      },
    );
    return unsub;
  }, [user]); // Re-bind if user changes since addMachine depends on user

  const handleSignIn = async () => {
    if (!isSupabaseEnabled) return;
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSpatialAnalysis = async () => {
    if (customMachines.length === 0) return;
    setIsAnalyzing(true);
    try {
      // Simulamos el análisis del primer modelo cargado
      // En una versión final, iteraríamos sobre customMachines
      const metadata = [
        {
          nodes: customMachines.map((m) => ({
            name: m.id,
            type: m.type,
            pos: m.position,
          })),
        },
      ];
      const results = await getSpatialAnalysis(metadata);
      setSuggestions(results);
      alert(
        `IA: Se han identificado ${results.length} puntos de actuación potenciales.`,
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split(".").pop()?.toLowerCase();
    if (fileExt !== "gltf" && fileExt !== "glb" && fileExt !== "obj") {
      alert("Please upload a .gltf, .glb, or .obj file.");
      return;
    }

    const url = URL.createObjectURL(file);
    const id = Math.random().toString(36).substring(7);
    const position = [(Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6];

    setCustomMachines([
      ...customMachines,
      {
        id,
        type: "custom",
        position: position as [number, number, number],
        url,
        fileExt,
      },
    ]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleNodeClick = (id: string, index: number) => {
    if (!connectMode) {
      const node = allNodes.find((n) => n.id === id);
      if (node) {
        setSelectedMachineDetails({ ...node, index });
      }
      return;
    }

    if (!selectedNodeId) {
      setSelectedNodeId(id);
    } else if (selectedNodeId !== id) {
      // Create connection
      setConnections((prev: { id: string; fromId: string; toId: string }[]) => [
        ...prev,
        {
          id: Math.random().toString(36).substring(7),
          fromId: selectedNodeId,
          toId: id,
        },
      ]);
      setSelectedNodeId(null);
      setConnectMode(false);
    } else {
      setSelectedNodeId(null);
    }
  };

  const handleInstallSuggestion = (suggestion: SpatialSuggestion) => {
    // Mapeo de hardware de IA a tipos de nodos del Laboratorio
    let nodeType = "motor";
    if (suggestion.hardware === "servo") nodeType = "servo";
    if (suggestion.hardware === "ultrasonic") nodeType = "sensor"; // Podríamos añadir un nodo visual para sensores

    addMachine(
      nodeType,
      {
        suggestedPin: suggestion.suggestedPin,
        label: suggestion.nodeName,
      },
      suggestion.position,
    );

    // Generar comando de prueba G-Code automático para el componente instalado
    const testCmd =
      suggestion.type === "actuator"
        ? `G01 X${suggestion.position?.[0].toFixed(2)} Y${suggestion.position?.[2].toFixed(2)} F1000`
        : `PING_${suggestion.nodeName.toUpperCase().replace(/\s+/g, "_")}`;

    eventBus.emit("arduino-command", testCmd);

    // Eliminar la sugerencia una vez instalada
    setSuggestions((prev) =>
      prev.filter((s) => s.nodeName !== suggestion.nodeName),
    );
  };

  const handleGenerateFirmware = () => {
    const actuators = allNodes.filter((n) =>
      ["motor", "servo", "valve"].includes(n.type),
    );

    let code = `// AUTO-GENERATED BY J.A.R.V.I.S. ASSEMBLY LAB\n#include <Servo.h>\n\n// Hardware Mapping\n`;

    actuators.forEach((n, i) => {
      const pin = (n as any).suggestedPin || 3 + i;
      if (n.type === "servo") {
        code += `Servo servo_${n.id.substring(0, 4)}; // Port: Pin ${pin}\n`;
      } else {
        code += `const int pin_${n.id.substring(0, 4)} = ${pin};\n`;
      }
    });

    code += `\nvoid setup() {\n  Serial.begin(115200);\n  Serial.println("READY_TO_OPERATE");\n\n`;

    actuators.forEach((n) => {
      const pin = (n as any).suggestedPin || 3;
      if (n.type === "servo") {
        code += `  servo_${n.id.substring(0, 4)}.attach(${pin});\n`;
      } else {
        code += `  pinMode(pin_${n.id.substring(0, 4)}, OUTPUT);\n`;
      }
    });

    code += `}\n\nvoid loop() {\n  if (Serial.available() > 0) {\n    String cmd = Serial.readStringUntil('\\n');\n    cmd.trim();\n\n`;

    actuators.forEach((n) => {
      const id = n.id.substring(0, 4);
      if (n.type === "servo") {
        code += `    if (cmd.startsWith("MOVE_${id}")) { int pos = cmd.substring(9).toInt(); servo_${id}.write(pos); }\n`;
      } else {
        code += `    if (cmd == "ON_${id}") digitalWrite(pin_${id}, HIGH);\n`;
        code += `    if (cmd == "OFF_${id}") digitalWrite(pin_${id}, LOW);\n`;
      }
    });

    code += `  }\n}`;

    setGeneratedFirmware(code);
    setIsFirmwareOpen(true);
  };

  const addMachine = async (
    type: string,
    extraData: any = {},
    positionOverride?: [number, number, number],
  ) => {
    if (!user) return alert("Please sign in to save your lab layout.");

    const id = Math.random().toString(36).substring(7);
    const position = positionOverride || [
      (Math.random() - 0.5) * 6,
      0,
      (Math.random() - 0.5) * 6,
    ];

    if (!isSupabaseEnabled) {
      const newMachine = {
        id,
        type,
        position: position as [number, number, number],
        sensors: [],
        images: extraData.images || [],
      };
      const updated = [...machines, newMachine];
      setMachines(updated);
      localStorage.setItem("nexus_cam_machines", JSON.stringify(updated));
      return;
    }

    try {
      setSaving(true);
      await setDoc(doc(db, "users", user.uid, "machines", id), {
        type,
        positionX: position[0],
        positionY: position[1],
        positionZ: position[2],
        userId: user.uid,
        sensors: [],
        ...extraData,
      });
    } catch (error) {
      handleSupabaseError(
        error,
        OperationType.CREATE,
        `users/${user.uid}/machines/${id}`,
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleSensor = async (machineId: string, sensorType: string) => {
    if (!user) return;
    const machine =
      machines.find((m) => m.id === machineId) ||
      customMachines.find((m) => m.id === machineId);
    if (!machine) return;

    const currentSensors = machine.sensors || [];
    const newSensors = currentSensors.includes(sensorType)
      ? currentSensors.filter((s) => s !== sensorType)
      : [...currentSensors, sensorType];

    if (!isSupabaseEnabled) {
      const updated = machines.map((m) =>
        m.id === machineId ? { ...m, sensors: newSensors } : m,
      );
      setMachines(updated);
      localStorage.setItem("nexus_cam_machines", JSON.stringify(updated));
      if (selectedMachineDetails && selectedMachineDetails.id === machineId) {
        setSelectedMachineDetails({
          ...selectedMachineDetails,
          sensors: newSensors,
        });
      }
      return;
    }

    try {
      setSaving(true);
      await setDoc(
        doc(db, "users", user.uid, "machines", machineId),
        {
          sensors: newSensors,
        },
        { merge: true },
      );

      // Update local state immediately for UI responsiveness
      if (selectedMachineDetails && selectedMachineDetails.id === machineId) {
        setSelectedMachineDetails({
          ...selectedMachineDetails,
          sensors: newSensors,
        });
      }
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const removeMachine = async (id: string, isCustom: boolean = false) => {
    // Remove connections involving this node
    setConnections((prev) =>
      prev.filter((c) => c.fromId !== id && c.toId !== id),
    );

    if (isCustom) {
      setCustomMachines(customMachines.filter((m) => m.id !== id));
      return;
    }

    if (!isSupabaseEnabled) {
      const updated = machines.filter((m) => m.id !== id);
      setMachines(updated);
      localStorage.setItem("nexus_cam_machines", JSON.stringify(updated));
      return;
    }

    if (!user) return;
    try {
      setSaving(true);
      await deleteDoc(doc(db, "users", user.uid, "machines", id));
    } catch (error) {
      handleSupabaseError(
        error,
        OperationType.DELETE,
        `users/${user.uid}/machines/${id}`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-black/40 border border-white/5 rounded-xl overflow-hidden glass-panel shrink-0 w-full col-span-3">
      <div className="flex justify-between items-center p-4 border-b border-white/10 bg-black/40 flex-wrap gap-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 text-google-blue p-2 rounded-lg relative">
            <Boxes size={20} />
            {saving && (
              <UploadCloud
                size={10}
                className="absolute -top-1 -right-1 text-slate-300 animate-pulse"
              />
            )}
          </div>
          <div>
            <h2 className="font-bold text-white tracking-tight flex items-center">
              ASSEMBLY LAB 3D
              {user && (
                <Cloud
                  size={14}
                  className="ml-2 text-google-green drop-[0_0_5px_rgba(52,168,83,0.5)]"
                />
              )}
            </h2>
            <p className="text-xs text-slate-400 font-mono">
              Factory Layout & Virtual Setup Simulator
            </p>
          </div>
        </div>

        <div className="flex gap-2 items-center">
          <input
            type="file"
            accept=".gltf,.glb,.obj"
            ref={fileInputRef}
            onChange={handleFileUpload}
            title="Cargar archivo de modelo 3D (.gltf, .glb, .obj)"
            className="hidden"
          />
          <button
            onClick={() => {
              setConnectMode(!connectMode);
              if (connectMode) setSelectedNodeId(null);
            }}
            className={`flex items-center gap-1 border text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${
              connectMode
                ? "bg-google-blue text-white border-google-blue shadow-[0_0_10px_rgba(66,133,244,0.3)]"
                : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
            }`}
          >
            <Link2 size={14} /> LINK
          </button>

          <button
            onClick={() => {
              setMeasureMode(!measureMode);
              setMeasurePoints([]);
            }}
            className={`flex items-center gap-1 border text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${
              measureMode
                ? "bg-rose-600 text-white border-rose-500 shadow-[0_0_10px_rgba(225,29,72,0.3)]"
                : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
            }`}
          >
            <Ruler size={14} /> {measureMode ? "STOP MEASURE" : "MEASURE"}
          </button>

          <button
            onClick={handleGenerateFirmware}
            disabled={allNodes.length === 0}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-all disabled:opacity-50 shadow-[0_0_10px_rgba(52,168,83,0.3)]"
          >
            <Cpu size={14} /> GENERAR FIRMWARE
          </button>

          <button
            onClick={handleSpatialAnalysis}
            disabled={isAnalyzing || customMachines.length === 0}
            className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-all disabled:opacity-50 shadow-[0_0_10px_rgba(79,70,229,0.4)]"
          >
            {isAnalyzing ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            ANALIZAR ESPACIAL
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 bg-white/5 border border-white/10 hover:border-google-blue hover:bg-white/10 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
          >
            <Upload size={14} className="text-google-blue" /> IMPORT 3D
          </button>

          <div className="h-6 w-px bg-white/10 mx-1"></div>

          {!user ? (
            <button
              onClick={handleSignIn}
              className="flex items-center gap-2 bg-google-blue hover:bg-blue-600 text-white text-xs font-semibold px-4 py-1.5 rounded-md transition-colors shadow-[0_0_10px_rgba(66,133,244,0.3)]"
            >
              <LogIn size={14} /> LOGIN TO SAVE
            </button>
          ) : (
            <>
              <button
                onClick={() => addMachine("cnc")}
                className="flex items-center gap-1 bg-white/5 border border-white/10 hover:border-google-blue hover:bg-white/10 text-white text-[10px] font-semibold px-2 py-1 rounded transition-colors"
              >
                <Plus size={12} className="text-google-blue" /> CNC
              </button>
              <button
                onClick={() => addMachine("robot")}
                className="flex items-center gap-1 bg-white/5 border border-white/10 hover:border-google-yellow hover:bg-white/10 text-white text-[10px] font-semibold px-2 py-1 rounded transition-colors"
              >
                <Plus size={12} className="text-google-yellow" /> ROBOT
              </button>
              <button
                onClick={() => addMachine("motor")}
                className="flex items-center gap-1 bg-white/5 border border-white/10 hover:border-google-red hover:bg-white/10 text-white text-[10px] font-semibold px-2 py-1 rounded transition-colors"
              >
                <Plus size={12} className="text-google-red" /> MOTOR
              </button>
              <button
                onClick={() => addMachine("servo")}
                className="flex items-center gap-1 bg-white/5 border border-white/10 hover:border-google-green hover:bg-white/10 text-white text-[10px] font-semibold px-2 py-1 rounded transition-colors"
              >
                <Plus size={12} className="text-google-green" /> SERVO
              </button>
              <button
                onClick={() => addMachine("valve")}
                className="flex items-center gap-1 bg-white/5 border border-white/10 hover:border-orange-500 hover:bg-white/10 text-white text-[10px] font-semibold px-2 py-1 rounded transition-colors"
              >
                <Plus size={12} className="text-orange-500" /> VÁLVULA
              </button>
              <button
                onClick={() => {
                  const url = prompt(
                    "Introduce URL de imagen para el prototipo (o deja vacío para usar ejemplo):",
                  );
                  const images = url
                    ? [url]
                    : [
                        "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=400",
                      ];
                  addMachine("prototype", { images });
                }}
                className="flex items-center gap-1 bg-white/5 border border-white/10 hover:border-purple-400 hover:bg-white/10 text-white text-[10px] font-semibold px-2 py-1 rounded transition-colors"
              >
                <Plus size={12} className="text-purple-400" /> PROTOTIPO
              </button>
              <div className="h-6 w-px bg-white/10 mx-1"></div>
              <img
                src={user.photoURL || ""}
                alt=""
                className="w-6 h-6 rounded-full border border-white/20"
                title={user.email || ""}
              />
            </>
          )}
        </div>
      </div>

      {connectMode && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-google-blue/20 border border-google-blue text-white px-4 py-2 rounded-full text-xs font-mono backdrop-blur-md z-20 flex items-center gap-2 shadow-[0_0_15px_rgba(66,133,244,0.3)]">
          <Link2 size={14} />
          {selectedNodeId ? "SELECT TARGET NODE..." : "SELECT SOURCE NODE..."}
        </div>
      )}

      <div className="flex-1 relative bg-black/60">
        <Canvas
          camera={{ position: [5, 8, 5], fov: 45 }}
          onPointerMissed={() => {
            if (connectMode) {
              setSelectedNodeId(null);
              setConnectMode(false);
            }
          }}
        >
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
          <Environment preset="city" />

          <Grid
            args={[20, 20]}
            cellSize={1}
            cellThickness={1}
            cellColor="#475569"
            sectionSize={5}
            sectionThickness={1.5}
            sectionColor="#64748b"
            fadeDistance={30}
            fadeStrength={1}
            followCamera={false}
          />

          {/* Plano invisible para capturar clics de medición */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.01, 0]}
            onPointerDown={(e) => {
              if (measureMode) {
                e.stopPropagation();
                setMeasurePoints((prev) =>
                  prev.length >= 2 ? [e.point] : [...prev, e.point],
                );
              }
            }}
          >
            <planeGeometry args={[100, 100]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>

          {/* Efecto de Barrido Láser de Escaneo IA */}
          <ScanningLaser active={isAnalyzing} />

          {/* Renderizado de la herramienta de medición */}
          {measurePoints.length > 0 && (
            <group>
              {measurePoints.map((p, i) => (
                <mesh key={i} position={p}>
                  <sphereGeometry args={[0.06]} />
                  <meshBasicMaterial color="#f87171" />
                </mesh>
              ))}
              {measurePoints.length === 2 && (
                <>
                  <Line
                    points={[measurePoints[0], measurePoints[1]]}
                    color="#f87171"
                    lineWidth={2}
                  />
                  <Html
                    position={measurePoints[0]
                      .clone()
                      .add(measurePoints[1])
                      .multiplyScalar(0.5)
                      .add(new THREE.Vector3(0, 0.5, 0))}
                    center
                  >
                    <div className="bg-slate-900/90 border border-rose-500 text-white px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap backdrop-blur-sm shadow-xl">
                      DIST:{" "}
                      {measurePoints[0].distanceTo(measurePoints[1]).toFixed(3)}{" "}
                      units
                    </div>
                  </Html>
                </>
              )}
            </group>
          )}

          {/* Capa de Hologramas de IA */}
          <group name="ai-suggestions-layer">
            {suggestions.map((s, idx) => (
              <SuggestionMarker
                key={`${s.nodeName}-${idx}`}
                suggestion={s}
                onInstall={handleInstallSuggestion}
              />
            ))}
          </group>

          {allNodes.map((m, index) => {
            let isValidTarget = false;
            let isInvalidTarget = false;

            if (connectMode && selectedNodeId && selectedNodeId !== m.id) {
              const fromNode = allNodes.find((n) => n.id === selectedNodeId);
              if (fromNode) {
                const isInvalidRobotConveyor =
                  (fromNode.type === "robot" && m.type === "conveyor") ||
                  (fromNode.type === "conveyor" && m.type === "robot");
                if (isInvalidRobotConveyor) {
                  isInvalidTarget = true;
                } else {
                  isValidTarget = true;
                }
              }
            }

            return (
              <MachineNode
                key={m.id}
                id={m.id}
                index={index + 1}
                position={m.position}
                type={m.type}
                url={m.url}
                fileExt={m.fileExt}
                images={m.images}
                isSelected={selectedNodeId === m.id}
                isValidTarget={isValidTarget}
                isInvalidTarget={isInvalidTarget}
                onNodeClick={(id) => {
                  if (isInvalidTarget) return;
                  handleNodeClick(id, index + 1);
                }}
                onRemove={() => removeMachine(m.id, m.type === "custom")}
              />
            );
          })}

          {connections.map((c) => {
            const startNode = allNodes.find((n) => n.id === c.fromId);
            const endNode = allNodes.find((n) => n.id === c.toId);
            if (!startNode || !endNode) return null;

            const start = [...startNode.position] as [number, number, number];
            const end = [...endNode.position] as [number, number, number];

            // Generate a mid point for the generic quadratic bezier arc
            const mid = [
              (start[0] + end[0]) / 2,
              Math.max(start[1], end[1]) + 2,
              (start[2] + end[2]) / 2,
            ] as [number, number, number];

            return (
              <group key={c.id}>
                <QuadraticBezierLine
                  start={start}
                  end={end}
                  mid={mid}
                  color="#34A853" // google green
                  lineWidth={3}
                  dashed={true}
                  dashScale={4}
                  dashSize={1}
                />

                <Html position={mid} center zIndexRange={[100, 0]}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConnections((prev: any[]) =>
                        prev.filter((x) => x.id !== c.id),
                      );
                    }}
                    title="Desvincular componentes"
                    className="bg-black/80 hover:bg-rose-900 border border-slate-700 hover:border-rose-500 rounded-full p-1 text-slate-400 hover:text-white transition-colors"
                  >
                    <Unlink size={12} />
                  </button>
                </Html>
              </group>
            );
          })}

          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.05}
            maxPolarAngle={Math.PI / 2 - 0.05}
            enabled={
              !connectMode && !selectedMachineDetails
            } /* disable orbit when connecting or modal open */
          />
        </Canvas>

        <ArduinoFirmwareDialog
          isOpen={isFirmwareOpen}
          onClose={() => setIsFirmwareOpen(false)}
          generatedCode={generatedFirmware}
        />

        {selectedMachineDetails && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur flex items-center justify-center p-6">
            <div className="bg-slate-900 border border-white/20 w-full max-w-2xl rounded-xl shadow-[0_0_30px_rgba(66,133,244,0.15)] overflow-hidden flex flex-col pointer-events-auto">
              <div className="p-4 border-b border-white/10 flex justify-between items-center bg-black/40">
                <h2 className="text-lg font-bold text-white font-mono flex items-center gap-2">
                  <Activity className="text-google-blue" size={18} />
                  AUTOMATA {selectedMachineDetails.index} - FICHA TÉCNICA
                </h2>
                <button
                  onClick={() => setSelectedMachineDetails(null)}
                  title="Cerrar panel de detalles"
                  className="text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 p-1 rounded transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-slate-300 text-sm">
                <div>
                  <h3 className="text-google-blue font-bold mb-3 border-b border-white/10 pb-2 text-xs tracking-widest">
                    ESPECIFICACIONES
                  </h3>
                  <ul className="space-y-3 font-mono text-xs">
                    <li className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-500">TIPO DE CÉLULA:</span>{" "}
                      <span className="text-white">
                        {selectedMachineDetails.type.toUpperCase()}
                      </span>
                    </li>
                    <li className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-500">ESTADO SENSORIAL:</span>{" "}
                      <span className="text-google-green">EN LÍNEA</span>
                    </li>
                    <li className="flex justify-between border-b border-white/5 pb-1">
                      <span className="text-slate-500">ID ÚNICO:</span>{" "}
                      <span className="text-slate-400">
                        {selectedMachineDetails.id}
                      </span>
                    </li>
                    <li className="flex flex-col border-b border-white/5 pb-1 space-y-1">
                      <span className="text-slate-500">
                        COORDENADAS ESPACIALES:
                      </span>
                      <span className="text-slate-300">
                        X: {selectedMachineDetails.position[0].toFixed(2)}, Y:{" "}
                        {selectedMachineDetails.position[1].toFixed(2)}, Z:{" "}
                        {selectedMachineDetails.position[2].toFixed(2)}
                      </span>
                    </li>
                  </ul>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2">
                    <h3 className="text-google-blue font-bold text-xs tracking-widest">
                      CONTROLES ADAPTATIVOS
                    </h3>
                    {!isOnline && (
                      <span className="text-[10px] text-amber-500 flex items-center font-mono gap-1">
                        <WifiOff size={10} /> OFFLINE MODE
                      </span>
                    )}
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-slate-500 font-bold text-[10px] tracking-widest uppercase mb-1">
                      Librerías de Sensores (Arduino Style)
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      <SensorToggle
                        label="TERMOPAR K"
                        active={selectedMachineDetails.sensors?.includes(
                          "thermal",
                        )}
                        onClick={() =>
                          toggleSensor(selectedMachineDetails.id, "thermal")
                        }
                      />
                      <SensorToggle
                        label="ACELERÓMETRO"
                        active={selectedMachineDetails.sensors?.includes(
                          "vibration",
                        )}
                        onClick={() =>
                          toggleSensor(selectedMachineDetails.id, "vibration")
                        }
                      />
                      <SensorToggle
                        label="ENCODER"
                        active={selectedMachineDetails.sensors?.includes(
                          "load",
                        )}
                        onClick={() =>
                          toggleSensor(selectedMachineDetails.id, "load")
                        }
                      />
                      <SensorToggle
                        label="CAUDALÍMETRO"
                        active={selectedMachineDetails.sensors?.includes(
                          "flow",
                        )}
                        onClick={() =>
                          toggleSensor(selectedMachineDetails.id, "flow")
                        }
                      />
                    </div>

                    <h3 className="text-slate-500 font-bold text-[10px] tracking-widest uppercase mt-4 mb-1">
                      Ejecución Manual
                    </h3>
                    <button
                      onClick={() =>
                        offlineSync.addTask(
                          selectedMachineDetails.id,
                          "INICIAR SECUENCIA BASE",
                        )
                      }
                      className="w-full bg-white/5 hover:bg-white/10 border border-white/10 rounded py-2 font-mono text-[10px] flex justify-between px-3 transition-colors text-white"
                    >
                      <span>INICIAR SECUENCIA BASE</span>
                      <span className="text-slate-500">
                        {isOnline ? "EJECUTAR" : "ENCOLAR"}
                      </span>
                    </button>
                    <button
                      onClick={() =>
                        offlineSync.addTask(
                          selectedMachineDetails.id,
                          "DETENER OPERACIÓN",
                        )
                      }
                      className="w-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded py-2 font-mono text-[10px] text-rose-400 hover:text-rose-300 flex justify-between px-3 transition-colors"
                    >
                      <span>DETENER OPERACIÓN</span>{" "}
                      <span className="text-rose-500">EMERGENCIA</span>
                    </button>
                  </div>
                </div>

                {offlineTasks.length > 0 && (
                  <div className="mt-4 border border-white/10 rounded-lg bg-black/40 overflow-hidden">
                    <div className="bg-white/5 px-3 py-2 border-b border-white/10 flex items-center justify-between">
                      <span className="text-[10px] text-google-blue font-bold font-mono tracking-widest flex items-center gap-1">
                        <Clock size={12} /> TAREAS ENCOLADAS (
                        {offlineTasks.length})
                      </span>
                      {isOnline && (
                        <span className="text-[10px] text-google-green animate-pulse">
                          Sincronizando...
                        </span>
                      )}
                    </div>
                    <div className="max-h-32 overflow-y-auto p-2 space-y-1">
                      {offlineTasks.map((t) => (
                        <div
                          key={t.id}
                          className="flex justify-between items-center text-[10px] font-mono px-2 py-1.5 bg-white/5 rounded border border-white/5"
                        >
                          <span className="text-slate-300 flex items-center gap-1">
                            <ArrowRightCircle
                              size={10}
                              className="text-google-blue"
                            />
                            {t.action}
                          </span>
                          <span
                            className={
                              t.status === "pending"
                                ? "text-amber-500"
                                : "text-google-green"
                            }
                          >
                            {t.status.toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="p-4 bg-black/60 border-t border-white/10 text-xs font-mono text-slate-500 flex justify-between items-center">
                <span>INTEGRACIÓN DINÁMICA DE LIBRERÍAS (V2)</span>
                <span className="text-google-green animate-pulse">
                  MONITOREANDO...
                </span>
              </div>
            </div>
          </div>
        )}

        {machines.length === 0 && customMachines.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="bg-black/60 backdrop-blur border border-white/10 p-6 rounded-xl shadow-lg text-center max-w-sm">
              <Boxes className="w-12 h-12 text-slate-500 mx-auto mb-4" />
              <h3 className="text-white font-bold mb-2">
                {!user ? "Login Required" : "Empty Laboratory Floor"}
              </h3>
              <p className="text-slate-400 text-sm">
                {!user
                  ? "Sign in with Google to create and save your custom digital twin layouts (Imported models are kept local)."
                  : "Use the tools above to add virtual equipment, import 3D models, and optimize your production lines."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SensorToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded border text-[9px] font-bold tracking-widest transition-all flex items-center justify-between ${
        active
          ? "bg-google-blue/20 border-google-blue text-white shadow-[0_0_10px_rgba(66,133,244,0.2)]"
          : "bg-black/40 border-white/10 text-slate-500 hover:border-white/20"
      }`}
    >
      {label}
      <div
        className={`w-2 h-2 rounded-full ${active ? "bg-google-green animate-pulse shadow-[0_0_5px_#34a853]" : "bg-slate-700"}`}
      ></div>
    </button>
  );
}
