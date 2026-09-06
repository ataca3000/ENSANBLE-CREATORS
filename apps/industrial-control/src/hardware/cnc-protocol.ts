export type CNCStatus = "Idle" | "Run" | "Hold" | "Alarm" | "Door" | "Unknown";

export type CNCResponse = {
  status: CNCStatus;
  text: string;
  ok: boolean;
  errorCode?: number;
  alarmCode?: number;
  position?: { x: number; y: number; z: number };
  feedrate?: number;
  spindle?: number;
};

function parsePosition(value: string) {
  const [x, y, z] = value.split(",").map(Number);
  if (![x, y, z].every(Number.isFinite)) return undefined;
  return { x, y, z };
}

export function parseCNCResponse(response: string): CNCResponse {
  const text = response.trim();
  const result: CNCResponse = {
    status: "Unknown",
    text,
    ok: false,
  };

  if (!text) return result;
  if (text.toLowerCase() === "ok") {
    return { ...result, status: "Idle", ok: true };
  }

  const error = text.match(/^error:(\d+)/i);
  if (error) return { ...result, status: "Alarm", errorCode: Number(error[1]) };

  const alarm = text.match(/^ALARM:(\d+)/i);
  if (alarm) return { ...result, status: "Alarm", alarmCode: Number(alarm[1]) };

  const status = text.match(/^<([^|>]+)/);
  if (!status) return result;

  const parsedStatus = status[1] as CNCStatus;
  const position = text.match(/(?:MPos|WPos):([^|]+)/i);
  const feedAndSpindle = text.match(/FS:([^|>]+)/i);
  const [feedrate, spindle] = feedAndSpindle
    ? feedAndSpindle[1].split(",").map(Number)
    : [];

  return {
    ...result,
    status: ["Idle", "Run", "Hold", "Alarm", "Door"].includes(parsedStatus)
      ? parsedStatus
      : "Unknown",
    ok: true,
    position: position ? parsePosition(position[1]) : undefined,
    feedrate: Number.isFinite(feedrate) ? feedrate : undefined,
    spindle: Number.isFinite(spindle) ? spindle : undefined,
  };
}
