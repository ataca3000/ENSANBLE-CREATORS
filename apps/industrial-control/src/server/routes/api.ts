import { Router } from "express";
import dotenv from "dotenv";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import axios from "axios";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { networkInterfaces } from "os";
import { exec } from "child_process";
import { Jimp } from "jimp";
import { supabaseAdmin } from "./supabase";

dotenv.config();

const router = Router();

// Helper para registrar/actualizar usuarios en Supabase
async function syncUserToDb(user: {
  email: string;
  name?: string;
  provider: string;
}) {
  if (!supabaseAdmin) return;
  try {
    const { error } = await supabaseAdmin.from("users").upsert(
      {
        id: user.email,
        ...user,
        last_login: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    );
    if (error) throw error;
  } catch (error) {
    console.error("Error syncing user to Supabase:", error);
  }
}

const s3Client = new S3Client({
  region: process.env.AWS_REGION || process.env.VITE_AWS_REGION || "us-east-1",
  credentials: process.env.AWS_ACCESS_KEY_ID
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      }
    : undefined,
});

const CHAT_FALLBACK_ENABLED = process.env.CHAT_USE_GEMINI_FALLBACK !== "false";
const VISION_FALLBACK_ENABLED =
  process.env.VISION_USE_GEMINI_FALLBACK !== "false";
const VISION_OLLAMA_REASONING_ENABLED =
  process.env.VISION_USE_OLLAMA_REASONING !== "false";
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 15000);
const VISION_GEMINI_TIMEOUT_MS = Number(
  process.env.VISION_GEMINI_TIMEOUT_MS || 20000,
);
const VISION_OLLAMA_TIMEOUT_MS = Number(
  process.env.VISION_OLLAMA_TIMEOUT_MS || 15000,
);
const GEMINI_FALLBACK_MAX_PER_MINUTE = Math.max(
  1,
  Number(process.env.GEMINI_FALLBACK_MAX_PER_MINUTE || 20),
);

const geminiFallbackMeter: Record<
  "chat" | "vision",
  { count: number; windowStart: number }
> = {
  chat: { count: 0, windowStart: Date.now() },
  vision: { count: 0, windowStart: Date.now() },
};

function canUseGeminiFallback(endpoint: "chat" | "vision") {
  const entry = geminiFallbackMeter[endpoint];
  const now = Date.now();
  if (now - entry.windowStart > 60_000) {
    entry.count = 0;
    entry.windowStart = now;
  }

  if (entry.count >= GEMINI_FALLBACK_MAX_PER_MINUTE) {
    return false;
  }

  entry.count += 1;
  return true;
}

async function analyzeImageEdge(imageBase64: string) {
  const base64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");
  const image = await Jimp.read(buffer);

  const width = image.bitmap.width;
  const height = image.bitmap.height;
  const sampleStep = 10;
  let totalBrightness = 0;
  let darkPixels = 0;
  let totalSamples = 0;

  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const idx = image.getPixelIndex(x, y);
      const r = image.bitmap.data[idx + 0];
      const g = image.bitmap.data[idx + 1];
      const b = image.bitmap.data[idx + 2];
      const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      totalBrightness += brightness;
      if (brightness < 0.25) darkPixels += 1;
      totalSamples += 1;
    }
  }

  const averageBrightness = totalBrightness / Math.max(1, totalSamples);
  const darkRatio = darkPixels / Math.max(1, totalSamples);
  const defectLikely = darkRatio > 0.2 || averageBrightness < 0.3;

  return {
    metadata: {
      width,
      height,
      imageFormat: (image as any).getMIME?.() || image.mime || "image/png",
      averageBrightness: Number(averageBrightness.toFixed(3)),
      darkRatio: Number(darkRatio.toFixed(3)),
      defectLikely,
    },
    detections: [
      {
        label: defectLikely ? "potential_defect" : "operational_area",
        confidence: defectLikely
          ? Number(Math.min(0.98, 0.5 + darkRatio).toFixed(2))
          : Number(Math.max(0.6, averageBrightness).toFixed(2)),
        bbox: [0, 0, 1, 1],
      },
    ],
  };
}

async function logFallbackEvent(
  endpoint: "chat" | "vision",
  success: boolean,
  reason: string,
  details?: Record<string, unknown>,
) {
  const logEntry = {
    endpoint,
    success,
    reason,
    details: details || {},
    timestamp: new Date(),
  };

  if (supabaseAdmin) {
    try {
      await supabaseAdmin?.from("fallback_logs").insert(logEntry);
    } catch (err) {
      console.warn("Could not persist fallback log:", err);
    }
  } else {
    console.log("Fallback event:", logEntry);
  }
}

router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Check if Ollama is running and has models
router.get("/ollama/status", async (_req, res) => {
  try {
    const response = await axios.get("http://localhost:11434/api/tags", {
      timeout: 2000,
    });
    res.json({ online: true, models: response.data.models });
  } catch (error) {
    res.json({ online: false, error: "Ollama is not reachable" });
  }
});

// Trigger model download from UI
router.post("/ollama/install", async (req, res) => {
  const { model } = req.body;
  const modelName = model || "mistral";

  // Ejecución asíncrona para no bloquear el hilo principal
  exec(`ollama pull ${modelName}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error pulling model: ${error.message}`);
      return;
    }
    console.log(`Model ${modelName} installed/updated`);
  });

  res.json({ message: `Installation of ${modelName} started in background.` });
});

router.get("/network-info", (_req, res) => {
  const nets = networkInterfaces();
  const results = Object.values(nets)
    .flat()
    .filter((net): net is any => net?.family === "IPv4" && !net.internal)
    .map((net) => net.address);

  res.json({ ip: results[0] || "127.0.0.1" });
});

router.post("/chat", async (req, res) => {
  try {
    const { prompt, history, currentScene } = req.body;
    const defaultBackend = process.env.VERCEL === "1" ? "gemini" : "ollama";
    const preferredBackend = process.env.AGENT_BACKEND || defaultBackend;
    let result = null;
    let errorLog = [];

    // Intento 1: Ollama (si está preferido o como primera opción local)
    if (preferredBackend === "ollama") {
      try {
        const ollamaRes = await axios.post(
          "http://localhost:11434/api/generate",
          {
            model: process.env.VITE_OLLAMA_MODEL || "mistral",
            prompt: `System: You are Jarvis. Return ONLY JSON. Context: ${JSON.stringify(currentScene)}. User: ${prompt}`,
            stream: false,
            format: "json",
          },
          { timeout: 15000 },
        );

        result =
          typeof ollamaRes.data.response === "string"
            ? JSON.parse(ollamaRes.data.response)
            : ollamaRes.data.response;
      } catch (e) {
        errorLog.push("Ollama offline or timed out. Falling back to Gemini...");
      }
    }

    // If Ollama did not produce a result, try Gemini fallback if configured and enabled
    if (!result) {
      const geminiKey = process.env.GEMINI_API_KEY;
      const canFallback = CHAT_FALLBACK_ENABLED && canUseGeminiFallback("chat");
      if (geminiKey && canFallback) {
        try {
          const modelName = process.env.GEMINI_MODEL || "text-bison-001";
          const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generate?key=${geminiKey}`;
          const payload = {
            prompt: {
              text: `System: You are Jarvis. Return ONLY JSON. Context: ${JSON.stringify(currentScene)}. User: ${prompt}`,
            },
            temperature: 0.2,
            maxOutputTokens: 512,
          };

          const gemRes = await axios.post(url, payload, {
            timeout: GEMINI_TIMEOUT_MS,
          });

          const textOutput =
            (gemRes.data?.candidates && gemRes.data.candidates[0]?.content) ||
            gemRes.data?.output ||
            gemRes.data;
          result = { message: textOutput };
          await logFallbackEvent("chat", true, "gemini_success", {
            model: modelName,
          });
        } catch (ge: any) {
          await logFallbackEvent("chat", false, "gemini_error", {
            error: String(ge?.message || ge),
          });
          console.warn("Gemini fallback failed:", ge?.message || ge);
        }
      } else if (!canFallback && geminiKey) {
        await logFallbackEvent("chat", false, "gemini_rate_limit", {});
      }

      if (!result) {
        return res.status(500).json({
          error:
            "No local AI backend is available. Inicia Ollama localmente en el puerto 11434, o configura GEMINI_API_KEY para fallback.",
        });
      }
    }

    if (result) {
      await saveChatLog(prompt, result, req);
      return res.json({ result });
    }

    res.status(404).json({ error: "No response generated" });
  } catch (error) {
    console.error("AI chat API Error:", error);
    res.status(500).json({ error: "Failed to process request." });
  }
});

// Simple vision analysis stub: accepts { imageBase64: string }
router.post("/vision", async (req, res) => {
  try {
    const { imageBase64 } = req.body || {};
    if (!imageBase64)
      return res.status(400).json({ error: "imageBase64 required" });

    const edgeAnalysis = await analyzeImageEdge(imageBase64);
    const responsePayload: any = {
      ok: true,
      source: "local_edge",
      edgeAnalysis,
      detections: edgeAnalysis.detections,
      recommendation: {
        action: edgeAnalysis.metadata.defectLikely ? "inspect" : "monitor",
        reason: edgeAnalysis.metadata.defectLikely
          ? "Low brightness or high dark pixel ratio detected in the image."
          : "Image appears stable within the current lightweight edge analysis.",
      },
      reasoning: null,
      fallback: null,
    };

    const ollamaReasoningEnabled =
      VISION_OLLAMA_REASONING_ENABLED && process.env.VITE_OLLAMA_MODEL;
    if (ollamaReasoningEnabled) {
      try {
        const modelName = process.env.VITE_OLLAMA_MODEL || "mistral";
        const prompt = `System: You are a vision assistant. Use the provided edge metadata to improve detections or recommendation. Return ONLY JSON with keys: detections, recommendation, notes. Edge metadata: ${JSON.stringify(edgeAnalysis.metadata)}. Detections: ${JSON.stringify(edgeAnalysis.detections)}.`;
        const ollamaRes = await axios.post(
          "http://localhost:11434/api/generate",
          {
            model: modelName,
            prompt,
            stream: false,
            format: "json",
          },
          { timeout: VISION_OLLAMA_TIMEOUT_MS },
        );

        const reasoned =
          typeof ollamaRes.data.response === "string"
            ? JSON.parse(ollamaRes.data.response)
            : ollamaRes.data.response;

        if (reasoned?.detections)
          responsePayload.detections = reasoned.detections;
        if (reasoned?.recommendation)
          responsePayload.recommendation = reasoned.recommendation;
        responsePayload.reasoning = reasoned;
        responsePayload.source = "local_edge+ollama";
        await logFallbackEvent("vision", true, "ollama_reasoning_success", {
          model: modelName,
        });
      } catch (oe: any) {
        await logFallbackEvent("vision", false, "ollama_reasoning_error", {
          error: String(oe?.message || oe),
        });
        responsePayload.ollamaError = String(oe?.message || oe);
      }
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const canFallback =
      VISION_FALLBACK_ENABLED && canUseGeminiFallback("vision");
    if (
      (!responsePayload.reasoning || responsePayload.ollamaError) &&
      geminiKey &&
      canFallback
    ) {
      try {
        const modelName = process.env.GEMINI_MODEL || "text-bison-001";
        const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generate?key=${geminiKey}`;
        const prompt = `You are a vision assistant. Return only JSON. Analyze the image data and provided edge metadata, then return detections, recommendation, and notes. Image metadata: ${JSON.stringify(edgeAnalysis.metadata)}.`;
        const payload = {
          prompt: { text: prompt },
          temperature: 0.1,
          maxOutputTokens: 512,
        };

        const gemRes = await axios.post(url, payload, {
          timeout: VISION_GEMINI_TIMEOUT_MS,
        });
        const textOutput =
          (gemRes.data?.candidates && gemRes.data.candidates[0]?.content) ||
          gemRes.data?.output ||
          gemRes.data;

        try {
          const parsed =
            typeof textOutput === "string"
              ? JSON.parse(textOutput)
              : textOutput;
          if (parsed?.detections)
            responsePayload.detections = parsed.detections;
          if (parsed?.recommendation)
            responsePayload.recommendation = parsed.recommendation;
          responsePayload.gemini = parsed;
          responsePayload.source = "local_edge+gemini";
        } catch (parseErr) {
          responsePayload.gemini = { raw: textOutput };
        }
        responsePayload.fallback = "gemini";
        await logFallbackEvent("vision", true, "gemini_success", {
          model: modelName,
        });
      } catch (ge: any) {
        await logFallbackEvent("vision", false, "gemini_error", {
          error: String(ge?.message || ge),
        });
        responsePayload.geminiError = String(ge?.message || ge);
      }
    } else if (geminiKey && !canFallback) {
      await logFallbackEvent("vision", false, "gemini_rate_limit", {});
    }

    return res.json(responsePayload);
  } catch (err: any) {
    console.error("Vision stub error:", err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
});

// Endpoint de auditoría para movimientos del Gemelo Digital
router.post("/telemetry/log", async (req, res) => {
  const { action, details, objectId, isRealData, severity } = req.body;
  if (!supabaseAdmin) return res.status(500).json({ error: "Supabase not initialized" });

  const { error } = await supabaseAdmin.from("audit_logs").insert({
    action,
    details: isRealData
      ? details
      : { ...details, status: "SIMULATED_NOT_DETECTED" },
    objectId,
    isRealData: !!isRealData,
    severity: severity || (action.includes("DISCONNECT") ? "CRITICAL" : "INFO"),
    timestamp: new Date().toISOString(),
    user: (req as any).session?.user?.email || "anonymous",
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Helper para persistencia
async function saveChatLog(prompt: string, result: any, req: any) {
  if (supabaseAdmin) {
    await supabaseAdmin
      .from("chat_logs")
      .insert({
        prompt,
        timestamp: new Date().toISOString(),
        user: (req as any).session?.user?.email || "anonymous",
        response: result.message || "",
      })
      .then(({ error }) => {
        if (error) console.error("Supabase Save Error:", error);
      });
  }
}

// G-Code validation currently disabled for local-only deployments
router.post("/gcode/validate", async (_req, res) => {
  res.status(501).json({
    error: "G-Code validation is disabled in this local-only configuration.",
  });
});

// S3 presign endpoint (server-side). The frontend should call this to get a PUT presigned URL.
router.post("/s3/presign", async (req, res) => {
  try {
    const { key, contentType, expiresIn } = req.body;
    if (!process.env.S3_BUCKET)
      return res.status(400).json({ error: "S3_BUCKET env not set" });

    const cmd = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(s3Client, cmd, {
      expiresIn: expiresIn || 900,
    });
    res.json({ url });
  } catch (err: any) {
    console.error("S3 presign error:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// --- Authentication routes: Google, GitHub, magic-email ---
// Note: session middleware must be applied in server.ts so `req.session` is available.

// Magic link: request a token emailed to the user (development: token logged)
router.post("/auth/magic", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email required" });

  const token = crypto.randomBytes(24).toString("hex");
  const expires = Date.now() + 15 * 60 * 1000; // 15 min

  // store in session for demo; production should persist
  (req as any).session.magic = { email, token, expires };

  const link = `${req.protocol}://${req.get("host")}/api/auth/magic/verify?token=${token}`;

  // Try to send email if SMTP configured, otherwise log link
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: email,
        subject: "Your GoPilot magic login link",
        text: `Use this link to login: ${link}`,
      });
    } catch (err) {
      console.error("Email send failed:", err);
    }
  } else {
    console.log("Magic login link (dev):", link);
  }

  res.json({ ok: true });
});

router.get("/auth/magic/verify", (req, res) => {
  const { token } = req.query;
  const sess = (req as any).session?.magic;
  if (!sess || !token) return res.status(400).send("Invalid or expired token");
  if (sess.token !== token || Date.now() > sess.expires)
    return res.status(400).send("Invalid or expired token");

  // create session user
  (req as any).session.user = { provider: "magic", email: sess.email };

  // Sincronizar con Firestore
  syncUserToDb({ email: sess.email, provider: "magic" });

  delete (req as any).session.magic;

  // redirect to app root
  res.redirect("/");
});

// Google OAuth start
router.get("/auth/google", (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirect = `${_req.protocol}://${_req.get("host")}/api/auth/google/callback`;
  const scope = encodeURIComponent("openid email profile");
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent`;
  res.redirect(url);
});

router.get("/auth/google/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: `${req.protocol}://${req.get("host")}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } },
    );

    const accessToken = tokenRes.data.access_token;
    const userRes = await axios.get(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const user = userRes.data;
    const userData = {
      provider: "google",
      email: user.email,
      name: user.name,
    };

    (req as any).session.user = userData;

    // Registro de usuario nuevo o actualización
    await syncUserToDb(userData);

    res.redirect("/");
  } catch (err) {
    console.error("Google OAuth error", err);
    res.status(500).send("Authentication failed");
  }
});

// GitHub OAuth start
router.get("/auth/github", (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirect = `${req.protocol}://${req.get("host")}/api/auth/github/callback`;
  const url = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&scope=user:email`;
  res.redirect(url);
});

router.get("/auth/github/callback", async (req, res) => {
  try {
    const code = req.query.code as string;
    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: "application/json" } },
    );

    const accessToken = tokenRes.data.access_token;
    const userRes = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const emailsRes = await axios.get("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const primaryEmail =
      (emailsRes.data || []).find((e: any) => e.primary)?.email ||
      emailsRes.data[0]?.email;
    const userData = {
      provider: "github",
      email: primaryEmail,
      name: userRes.data.name || userRes.data.login,
    };

    (req as any).session.user = userData;

    // Registro de usuario nuevo o actualización
    await syncUserToDb(userData);

    res.redirect("/");
  } catch (err) {
    console.error("GitHub OAuth error", err);
    res.status(500).send("Authentication failed");
  }
});

// Simple route to get current session user
router.get("/auth/me", (req, res) => {
  res.json({ user: (req as any).session.user || null });
});

// Logout route to clear session
router.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: "Could not log out" });
    }
    res.json({ ok: true });
  });
});

export default router;
