import { useState, useRef, useEffect, useCallback } from "react";

const API_BASE = "http://localhost:8080/api";

const MODES = [
  { id: "scene",    label: "Describe",  icon: "👁️",  color: "#F59E0B" },
  { id: "text",     label: "Read Text", icon: "📖",  color: "#34D399" },
  { id: "hazard",   label: "Safety",    icon: "⚠️",  color: "#F87171" },
  { id: "navigate", label: "Navigate",  icon: "🧭",  color: "#60A5FA" },
  { id: "social",   label: "People",    icon: "🤝",  color: "#C084FC" },
];

const VOICE_COMMANDS = {
  scene:    ["describe", "what do you see", "scene", "look", "tell me", "what is"],
  text:     ["read", "text", "sign", "menu", "label", "what does it say"],
  hazard:   ["safe", "danger", "hazard", "obstacle", "warning", "is it safe"],
  navigate: ["navigate", "go", "walk", "path", "direction", "where"],
  social:   ["people", "who", "person", "crowd", "anyone", "someone"],
  capture:  ["capture", "take photo", "snap", "shoot", "scan", "analyze"],
  repeat:   ["repeat", "again", "say again", "replay"],
  help:     ["help", "commands", "what can you do"],
};

const HELP_TEXT = "Say capture to take a photo. Say describe to narrate the scene. Say read to read text. Say safe for a safety check. Say navigate for directions. Say people for social cues. Say repeat to hear the last answer again.";

function matchCommand(transcript) {
  const t = transcript.toLowerCase();
  for (const [cmd, phrases] of Object.entries(VOICE_COMMANDS)) {
    if (phrases.some(p => t.includes(p))) return cmd;
  }
  return null;
}

export default function AccessAI() {
  const [mode, setMode]         = useState(MODES[0]);
  const [imgSrc, setImgSrc]     = useState(null);
  const [imgB64, setImgB64]     = useState(null);
  const [mime, setMime]         = useState("image/jpeg");
  const [response, setResponse] = useState("");
  const [status, setStatus]     = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [started, setStarted]   = useState(false);
  const [lastResp, setLastResp] = useState("");
  const [serverOk, setServerOk] = useState(null);

  const videoRef     = useRef(null);
  const canvasRef    = useRef(null);
  const fileRef      = useRef(null);
  const streamRef    = useRef(null);
  const listeningRef = useRef(false);

  useEffect(() => {
    fetch(`${API_BASE}/health`)
      .then(r => r.ok ? setServerOk(true) : setServerOk(false))
      .catch(() => setServerOk(false));
  }, []);

  const speak = useCallback((text, onEnd) => {
    window.speechSynthesis?.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = 0.88; utt.pitch = 1.0;
    utt.onstart = () => setStatus("speaking");
    utt.onend   = () => { setStatus("idle"); onEnd?.(); };
    utt.onerror = () => { setStatus("idle"); onEnd?.(); };
    window.speechSynthesis?.speak(utt);
  }, []);

  const stopSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    setStatus("idle");
  }, []);

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { speak("Speech recognition needs Chrome browser."); return; }
    if (listeningRef.current) return;
    const recog = new SR();
    recog.continuous = false; recog.interimResults = true; recog.lang = "en-US";
    recog.onstart    = () => { listeningRef.current = true; setStatus("listening"); setTranscript(""); };
    recog.onresult   = (e) => setTranscript(Array.from(e.results).map(r => r[0].transcript).join(""));
    recog.onspeechend = () => recog.stop();
    recog.onend      = () => { listeningRef.current = false; setStatus("idle"); };
    recog.onerror    = () => { listeningRef.current = false; setStatus("idle"); };
    try { recog.start(); } catch {}
  }, [speak]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      speak("Camera unavailable. You can upload an image instead.");
    }
  }, [speak]);

  const captureFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return null;
    const v = videoRef.current, c = canvasRef.current;
    c.width = v.videoWidth || 640; c.height = v.videoHeight || 480;
    c.getContext("2d").drawImage(v, 0, 0);
    const dataUrl = c.toDataURL("image/jpeg", 0.85);
    const b64 = dataUrl.split(",")[1];
    setImgSrc(dataUrl); setImgB64(b64); setMime("image/jpeg");
    stopCamera();
    return b64;
  }, [stopCamera]);

  const analyzeImage = useCallback(async (b64, mimeType, targetMode) => {
    if (!b64) { speak("No image yet. Say capture to take a photo first."); return; }
    setStatus("thinking"); setResponse(""); stopSpeech();
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: b64, mimeType: mimeType, mode: targetMode }),
      });
      const data = await res.json();
      if (data.success) {
        setResponse(data.result); setLastResp(data.result); speak(data.result);
      } else { throw new Error(data.error || "Server error"); }
    } catch (err) {
      const msg = "Analysis failed. Make sure Spring Boot is running on port 8080.";
      setResponse(msg); speak(msg); setStatus("idle");
    }
  }, [speak, stopSpeech]);

  const handleCommand = useCallback((cmd) => {
    if (cmd === "help")   { speak(HELP_TEXT); return; }
    if (cmd === "repeat") { lastResp ? speak(lastResp) : speak("Nothing to repeat yet."); return; }
    if (cmd === "capture") {
      const b64 = captureFrame();
      if (b64) speak("Photo taken. Say describe, read, safe, navigate, or people.");
      else startCamera().then(() => speak("Camera on. Say capture again to take a photo."));
      return;
    }
    const m = MODES.find(x => x.id === cmd);
    if (m) {
      setMode(m);
      imgB64 ? analyzeImage(imgB64, mime, m.id) : speak(`${m.label} selected. Say capture to take a photo first.`);
    }
  }, [captureFrame, startCamera, lastResp, imgB64, mime, analyzeImage, speak]);

  useEffect(() => {
    if (status !== "idle" || !transcript || !started) return;
    const cmd = matchCommand(transcript);
    cmd ? handleCommand(cmd) : speak(`I heard ${transcript}. Say help to hear what I can do.`);
    setTranscript("");
  }, [status, transcript, started, handleCommand, speak]);

  const handleBigButton = () => {
    if (status === "speaking") { stopSpeech(); return; }
    if (status === "listening" || status === "thinking") return;
    if (!started) {
      setStarted(true);
      speak("Welcome to AccessAI. I am your voice assistant. Say capture to start the camera. Say help for all commands.", () => {
        startCamera();
        setTimeout(startListening, 400);
      });
      return;
    }
    startListening();
  };

  const handleFile = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target.result.split(",")[1];
      setImgSrc(ev.target.result); setImgB64(b64); setMime(file.type || "image/jpeg");
      setResponse(""); stopCamera();
      speak("Image loaded. Say describe, read, safe, navigate, or people.");
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => () => { stopCamera(); stopSpeech(); }, [stopCamera, stopSpeech]);

  const btnColor = status === "listening" ? "#EF4444" : status === "thinking" ? "#F59E0B" : status === "speaking" ? "#34D399" : "#F59E0B";
  const btnIcon  = status === "listening" ? "🎙️" : status === "thinking" ? "⏳" : status === "speaking" ? "🔊" : started ? "🎙️" : "👆";
  const btnLabel = status === "listening" ? "Listening…" : status === "thinking" ? "Analyzing…" : status === "speaking" ? "Tap to stop" : started ? "Tap to speak" : "Tap to begin";

  return (
    <div style={{ minHeight: "100vh", background: "#030712", color: "#F9FAFB", fontFamily: "Georgia, serif", display: "flex", flexDirection: "column" }}>

      <div style={{ padding: "18px 20px 10px", borderBottom: "1px solid #111827", display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 480, margin: "0 auto", width: "100%" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 24 }}>👁️</span>
            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>Access<span style={{ color: "#F59E0B" }}>AI</span></span>
          </div>
          <div style={{ fontSize: 9, color: "#4B5563", letterSpacing: "0.1em", marginLeft: 32 }}>SPRING BOOT + REACT · VOICE FIRST</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: serverOk === true ? "#34D399" : serverOk === false ? "#EF4444" : "#6B7280" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: serverOk === true ? "#34D399" : serverOk === false ? "#EF4444" : "#6B7280" }} />
            {serverOk === true ? "Server OK" : serverOk === false ? "Server down" : "Checking…"}
          </div>
          <button onClick={() => fileRef.current?.click()} style={{ fontSize: 11, color: "#6B7280", border: "1px solid #1F2937", borderRadius: 20, padding: "5px 10px", background: "transparent", cursor: "pointer" }}>📁</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      </div>

      <div style={{ flex: 1, maxWidth: 480, margin: "0 auto", width: "100%", padding: "14px 16px 28px", display: "flex", flexDirection: "column", gap: 12 }}>

        {serverOk === false && (
          <div style={{ background: "#1F0000", border: "1px solid #7F1D1D", borderRadius: 12, padding: "10px 14px", fontSize: 12, color: "#FCA5A5" }}>
            ⚠️ Spring Boot not detected on port 8080. Press Shift+F10 in IntelliJ to start it.
          </div>
        )}

        <div style={{ position: "relative", borderRadius: 18, overflow: "hidden", background: "#0F172A", border: "1px solid #1F2937", aspectRatio: "16/9", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          {imgSrc && !streamRef.current && <img src={imgSrc} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />}
          {!imgSrc && !streamRef.current && (
            <div style={{ position: "absolute", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "#374151" }}>
              <span style={{ fontSize: 40, opacity: 0.3 }}>📷</span>
              <span style={{ fontSize: 12 }}>Tap the button to start</span>
            </div>
          )}
          {status === "thinking" && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(3,7,18,0.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, border: "3px solid #F59E0B", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <span style={{ color: "#F59E0B", fontSize: 12, fontStyle: "italic" }}>Sending to Spring Boot → Claude…</span>
            </div>
          )}
          <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.75)", border: `1px solid ${mode.color}`, borderRadius: 20, padding: "3px 10px", fontSize: 11, color: mode.color }}>
            {mode.icon} {mode.label}
          </div>
        </div>

        <canvas ref={canvasRef} style={{ display: "none" }} />

        {transcript && (
          <div style={{ background: "#0F172A", borderLeft: `3px solid ${btnColor}`, borderRadius: 10, padding: "8px 14px", fontSize: 13, color: "#D1D5DB", fontStyle: "italic" }}>
            🎙️ "{transcript}"
          </div>
        )}

        {response && (
          <div style={{ background: "#0F172A", border: "1px solid #1F2937", borderRadius: 16, padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span>{mode.icon}</span>
              <span style={{ fontSize: 11, color: mode.color, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{mode.label}</span>
            </div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8, color: "#E5E7EB" }}>{response}</p>
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #1F2937", display: "flex", gap: 8 }}>
              <button onClick={() => speak(response)} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, border: "1px solid #374151", background: "transparent", color: "#9CA3AF", cursor: "pointer" }}>🔊 Replay</button>
              <button onClick={() => { setImgSrc(null); setImgB64(null); setResponse(""); startCamera(); }} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 20, border: "1px solid #374151", background: "transparent", color: "#9CA3AF", cursor: "pointer" }}>📷 New Photo</button>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 6 }}>
          <div style={{ position: "relative", width: 100, height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {status === "listening" && <>
              <div style={{ position: "absolute", width: 100, height: 100, borderRadius: "50%", border: "2px solid rgba(239,68,68,0.5)", animation: "ping 1s ease infinite" }} />
              <div style={{ position: "absolute", width: 80, height: 80, borderRadius: "50%", border: "2px solid rgba(239,68,68,0.2)", animation: "ping 1s ease infinite 0.3s" }} />
            </>}
            {status === "speaking" && <div style={{ position: "absolute", width: 100, height: 100, borderRadius: "50%", border: "2px solid rgba(52,211,153,0.4)", animation: "ping 1.5s ease infinite" }} />}
            <button onClick={handleBigButton} style={{ width: 76, height: 76, borderRadius: "50%", background: `radial-gradient(circle, ${btnColor}20, ${btnColor}08)`, border: `3px solid ${btnColor}`, cursor: status === "thinking" ? "not-allowed" : "pointer", fontSize: 28, boxShadow: `0 0 24px ${btnColor}40`, transition: "all 0.25s" }}>
              {btnIcon}
            </button>
          </div>
          <span style={{ fontSize: 13, color: status !== "idle" ? btnColor : "#6B7280", fontWeight: status !== "idle" ? 600 : 400 }}>{btnLabel}</span>
        </div>

        <div style={{ background: "#0A0F1A", border: "1px solid #111827", borderRadius: 14, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, color: "#4B5563", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Voice Commands</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 14px" }}>
            {[["🎙️ \"capture\"","Take photo"],["👁️ \"describe\"","Narrate scene"],["📖 \"read\"","Read all text"],["⚠️ \"safe\"","Safety check"],["🧭 \"navigate\"","Get directions"],["🤝 \"people\"","Social cues"],["🔊 \"repeat\"","Replay answer"],["❓ \"help\"","All commands"]].map(([cmd, desc]) => (
              <div key={cmd}>
                <div style={{ fontSize: 11, color: "#F59E0B", fontWeight: 600 }}>{cmd}</div>
                <div style={{ fontSize: 10, color: "#4B5563" }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ping { 75%, 100% { transform: scale(1.5); opacity: 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes bounce { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1.2); } }
      `}</style>
    </div>
  );
}
