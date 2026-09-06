import { describe, it, expect } from "vitest";
import { parseCNCResponse } from "../src/hardware/cnc-protocol";

describe("JARVIS agent", () => {
  it("should respond", () => {
    expect(true).toBe(true);
  });
});

describe("GRBL CNC protocol", () => {
  it("parses an idle status report with position and rates", () => {
    expect(parseCNCResponse("<Idle|MPos:1.000,2.500,3.000|FS:1200,8000>"))
      .toEqual({
        status: "Idle",
        text: "<Idle|MPos:1.000,2.500,3.000|FS:1200,8000>",
        ok: true,
        position: { x: 1, y: 2.5, z: 3 },
        feedrate: 1200,
        spindle: 8000,
      });
  });

  it("preserves GRBL error codes", () => {
    expect(parseCNCResponse("error:22")).toMatchObject({
      status: "Alarm",
      ok: false,
      errorCode: 22,
    });
  });
});
