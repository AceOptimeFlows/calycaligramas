/* exportmp4.js — exportación fiable de clip 20 s en WebM/MP4
   Estrategia:
   - WebM: grabación directa con MediaRecorder.
   - MP4: primero comprobamos que el navegador tenga un encoder MP4 funcional.
   - Si además hay WebM + captureStream() en <video>, usamos un flujo más estable:
       1) grabamos el clip real a WebM
       2) lo reproducimos oculto en un <video>
       3) recapturamos ese <video> a MP4
     Esto evita varios fallos habituales al grabar canvas+audio directamente a MP4.
   - Si esa vía no existe, caemos a grabación directa a MP4.
*/
(function(){
  "use strict";

  const FORMAT_CANDIDATES = Object.freeze({
    webm: Object.freeze({
      label: "WebM",
      extension: "webm",
      mimeTypes: Object.freeze([
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm"
      ])
    }),
    mp4: Object.freeze({
      label: "MP4",
      extension: "mp4",
      mimeTypes: Object.freeze([
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4;codecs=avc1.4D401E,mp4a.40.2",
        "video/mp4;codecs=avc1.64001F,mp4a.40.2",
        "video/mp4;codecs=avc1,mp4a.40.2",
        "video/mp4;codecs=h264,mp4a.40.2",
        "video/mp4;codecs=avc1",
        "video/mp4"
      ])
    })
  });

  const PROBE_CACHE = new Map();
  const MP4_VALIDATION_TIMEOUT_MS = 5000;
  const PROBE_DURATION_MS = 260;

  function clamp01(value){
    return Math.max(0, Math.min(1, Number(value) || 0));
  }

  function emitProgress(onProgress, details = {}){
    if(typeof onProgress !== "function") return;

    try{
      const payload = { ...details };
      if(payload.progress !== undefined){
        payload.progress = clamp01(payload.progress);
      }
      onProgress(payload);
    }catch{}
  }

  function createTimedProgressReporter(options = {}){
    const {
      onProgress,
      phase = "record",
      startProgress = 0,
      endProgress = 1,
      durationMs = 0
    } = options;

    if(typeof onProgress !== "function"){
      return { start(){}, finish(){}, cancel(){} };
    }

    const from = clamp01(startProgress);
    const to = clamp01(endProgress);
    let rafId = 0;
    let running = false;
    let startedAt = 0;

    const tick = ()=>{
      if(!running) return;
      const elapsed = performance.now() - startedAt;
      const raw = durationMs > 0 ? Math.min(1, elapsed / durationMs) : 1;
      emitProgress(onProgress, {
        phase,
        progress: from + (to - from) * raw
      });
      if(raw < 1){
        rafId = requestAnimationFrame(tick);
      }
    };

    return {
      start(){
        if(running) return;
        running = true;
        startedAt = performance.now();
        tick();
      },
      finish(extra = {}){
        if(running && rafId){
          cancelAnimationFrame(rafId);
        }
        rafId = 0;
        running = false;
        emitProgress(onProgress, {
          phase,
          progress: to,
          ...extra
        });
      },
      cancel(){
        if(running && rafId){
          cancelAnimationFrame(rafId);
        }
        rafId = 0;
        running = false;
      }
    };
  }

  function createMediaProgressReporter(mediaElement, options = {}){
    const {
      onProgress,
      phase = "transcode",
      startProgress = 0,
      endProgress = 1
    } = options;

    if(typeof onProgress !== "function" || !mediaElement){
      return { start(){}, finish(){}, cancel(){} };
    }

    const from = clamp01(startProgress);
    const to = clamp01(endProgress);
    let rafId = 0;
    let running = false;

    const tick = ()=>{
      if(!running) return;
      const duration = Number.isFinite(mediaElement.duration) && mediaElement.duration > 0 ? mediaElement.duration : 0;
      const ratio = duration > 0 ? clamp01(mediaElement.currentTime / duration) : 0;
      emitProgress(onProgress, {
        phase,
        progress: from + (to - from) * ratio
      });
      rafId = requestAnimationFrame(tick);
    };

    return {
      start(){
        if(running) return;
        running = true;
        tick();
      },
      finish(extra = {}){
        if(running && rafId){
          cancelAnimationFrame(rafId);
        }
        rafId = 0;
        running = false;
        emitProgress(onProgress, {
          phase,
          progress: to,
          ...extra
        });
      },
      cancel(){
        if(running && rafId){
          cancelAnimationFrame(rafId);
        }
        rafId = 0;
        running = false;
      }
    };
  }

  function composeMediaStream(videoStream, audioStream){
    const composed = new MediaStream();
    videoStream?.getVideoTracks?.().forEach((track)=> composed.addTrack(track));
    audioStream?.getAudioTracks?.().forEach((track)=> composed.addTrack(track));
    return composed;
  }

  async function startAudioBundle(audioBundle){
    if(audioBundle?.start){
      await audioBundle.start();
    }
  }

  function stopAudioBundle(audioBundle){
    if(audioBundle?.stop){
      try{ audioBundle.stop(); }catch{}
    }
  }

  async function disposeAudioBundle(audioBundle){
    if(!audioBundle) return;

    stopAudioBundle(audioBundle);

    if(audioBundle?.dispose){
      try{ await audioBundle.dispose(); }catch{}
      return;
    }

    if(audioBundle?.cleanup){
      audioBundle.cleanup.forEach((fn)=>{
        try{ fn(); }catch{}
      });
    }

    if(audioBundle?.audioCtx){
      try{ await audioBundle.audioCtx.close(); }catch{}
    }
  }

  function hasMediaRecorder(){
    return typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined";
  }

  function normalizeFormat(format){
    const value = String(format || "").trim().toLowerCase();
    return value === "mp4" ? "mp4" : "webm";
  }

  function getFormatConfig(format){
    return FORMAT_CANDIDATES[normalizeFormat(format)] || FORMAT_CANDIDATES.webm;
  }

  function uniqueStrings(values){
    const seen = new Set();
    const out = [];
    for(const value of values || []){
      const normalized = String(value || "").trim();
      if(!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
    return out;
  }

  function sleep(ms){
    return new Promise((resolve)=> setTimeout(resolve, ms));
  }

  function isMimeForFormat(format, mimeType){
    const mime = String(mimeType || "").toLowerCase();
    const normalizedFormat = normalizeFormat(format);
    if(!mime) return false;
    return normalizedFormat === "mp4" ? mime.includes("mp4") : mime.includes("webm");
  }

  function streamHasAudio(stream){
    return !!stream?.getAudioTracks?.().length;
  }

  function mimeTypeLikelySupportsAudio(format, mimeType){
    const normalizedFormat = normalizeFormat(format);
    const mime = String(mimeType || "").trim().toLowerCase();
    if(!mime) return false;
    if(/opus|vorbis|mp4a|aac/.test(mime)) return true;

    if(normalizedFormat === "webm"){
      if(mime === "video/webm") return true;
      if(/codecs\s*=\s*[^;]*(vp8|vp9)/.test(mime) && !/opus|vorbis/.test(mime)) return false;
      return mime.includes("webm");
    }

    if(normalizedFormat === "mp4"){
      if(mime === "video/mp4") return true;
      if(/codecs\s*=\s*[^;]*(avc1|h264)/.test(mime) && !/mp4a|aac/.test(mime)) return false;
      return mime.includes("mp4");
    }

    return false;
  }

  function prioritizeAudioCandidateMimeTypes(format, candidates, expectAudio){
    const rawCandidates = Array.isArray(candidates) ? candidates : [];
    const normalized = [];
    let includeDefaultRecorder = false;

    for(const candidate of rawCandidates){
      const value = String(candidate || "").trim();
      if(!value){
        includeDefaultRecorder = true;
        continue;
      }
      normalized.push(value);
    }

    const uniqueCandidates = uniqueStrings(normalized);
    if(!expectAudio){
      if(includeDefaultRecorder && !uniqueCandidates.includes("")) uniqueCandidates.push("");
      return uniqueCandidates;
    }

    const audioFirst = [];
    const fallback = [];
    for(const mimeType of uniqueCandidates){
      if(mimeTypeLikelySupportsAudio(format, mimeType)) audioFirst.push(mimeType);
      else fallback.push(mimeType);
    }

    const ordered = [...audioFirst, ...fallback];
    if(includeDefaultRecorder && !ordered.includes("")) ordered.push("");
    return ordered;
  }

  function getCandidateMimeTypes(format){
    const config = getFormatConfig(format);
    if(!hasMediaRecorder()) return [];

    if(typeof MediaRecorder.isTypeSupported !== "function"){
      return [...config.mimeTypes];
    }

    return config.mimeTypes.filter((mimeType)=>{
      try{
        return MediaRecorder.isTypeSupported(mimeType);
      }catch{
        return false;
      }
    });
  }

  function getAdvertisedMimeType(format){
    const candidates = getCandidateMimeTypes(format);
    return candidates[0] || "";
  }

  function getFormatInfo(format){
    const normalizedFormat = normalizeFormat(format);
    const config = getFormatConfig(normalizedFormat);
    const mimeType = getAdvertisedMimeType(normalizedFormat);
    return {
      format: normalizedFormat,
      label: config.label,
      extension: config.extension,
      mimeType,
      supported: !!mimeType
    };
  }

  function getAvailableFormats(){
    return Object.keys(FORMAT_CANDIDATES).map((format)=> getFormatInfo(format));
  }

  function downloadBlob(blob, filename){
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(()=>{
      try{ URL.revokeObjectURL(link.href); }catch{}
    }, 1500);
  }

  function stopStreamTracks(stream){
    stream?.getTracks?.().forEach((track)=>{
      try{ track.stop(); }catch{}
    });
  }

  function getMediaElementCapture(mediaElement){
    if(!mediaElement) return null;
    if(typeof mediaElement.captureStream === "function") return ()=> mediaElement.captureStream();
    if(typeof mediaElement.mozCaptureStream === "function") return ()=> mediaElement.mozCaptureStream();
    return null;
  }

  function canUseMediaElementFallback(){
    if(typeof document === "undefined") return false;
    const video = document.createElement("video");
    return typeof video.captureStream === "function" || typeof video.mozCaptureStream === "function";
  }

  function buildRecorderOptionVariants(mimeType, videoBitsPerSecond, audioBitsPerSecond){
    const base = {};
    if(mimeType) base.mimeType = mimeType;

    const variants = [];
    const pushVariant = (optionSet)=>{
      const key = JSON.stringify(optionSet);
      if(!variants.some((entry)=> entry.key === key)){
        variants.push({ key, options: optionSet });
      }
    };

    const full = { ...base };
    if(Number.isFinite(videoBitsPerSecond)) full.videoBitsPerSecond = videoBitsPerSecond;
    if(Number.isFinite(audioBitsPerSecond)) full.audioBitsPerSecond = audioBitsPerSecond;
    pushVariant(full);

    const videoOnly = { ...base };
    if(Number.isFinite(videoBitsPerSecond)) videoOnly.videoBitsPerSecond = videoBitsPerSecond;
    pushVariant(videoOnly);

    pushVariant({ ...base });

    if(!mimeType){
      pushVariant({});
    }

    return variants.map((entry)=> entry.options);
  }

  function buildRecorderAttempts(format, explicitCandidates, allowEmptyFallback){
    const normalizedFormat = normalizeFormat(format);
    const candidates = uniqueStrings([
      ...(explicitCandidates || []),
      ...getCandidateMimeTypes(normalizedFormat)
    ]);

    if(allowEmptyFallback && !candidates.includes("")){
      candidates.push("");
    }

    return candidates;
  }

  function finalizeMimeType(format, recorderMimeType, attemptedMimeType){
    if(isMimeForFormat(format, recorderMimeType)) return recorderMimeType;
    if(isMimeForFormat(format, attemptedMimeType)) return attemptedMimeType;
    return normalizeFormat(format) === "mp4" ? "video/mp4" : "video/webm";
  }

  async function canPlayVideoBlob(blob, timeoutMs = MP4_VALIDATION_TIMEOUT_MS){
    if(typeof document === "undefined") return true;

    return await new Promise((resolve)=>{
      const video = document.createElement("video");
      const url = URL.createObjectURL(blob);
      let settled = false;

      const done = (ok)=>{
        if(settled) return;
        settled = true;
        cleanup();
        resolve(ok);
      };

      const cleanup = ()=>{
        clearTimeout(timer);
        video.onloadedmetadata = null;
        video.oncanplay = null;
        video.onerror = null;
        try{ video.pause(); }catch{}
        video.removeAttribute("src");
        try{ video.load(); }catch{}
        try{ URL.revokeObjectURL(url); }catch{}
      };

      const timer = setTimeout(()=> done(false), timeoutMs);

      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = ()=> done(true);
      video.oncanplay = ()=> done(true);
      video.onerror = ()=> done(false);
      video.src = url;
    });
  }

  async function collectRecording(recorder, { durationMs, stopPromise, timesliceMs, onStart, onStop } = {}){
    const chunks = [];

    return await new Promise((resolve, reject)=>{
      let finished = false;
      let stopTimer = null;

      const safeStop = ()=>{
        if(recorder.state !== "inactive"){
          try{ recorder.stop(); }catch{}
        }
      };

      const cleanup = ()=>{
        clearTimeout(stopTimer);
        recorder.removeEventListener("dataavailable", onDataAvailable);
        recorder.removeEventListener("stop", onStopEvent);
        recorder.removeEventListener("error", onError);
      };

      const runStopHook = ()=>{
        try{ onStop?.(); }catch{}
      };

      const fail = (error)=>{
        if(finished) return;
        finished = true;
        cleanup();
        runStopHook();
        reject(error);
      };

      const finish = ()=>{
        if(finished) return;
        finished = true;
        cleanup();
        runStopHook();
        const mimeType = recorder.mimeType || "";
        const blob = chunks.length
          ? new Blob(chunks, { type: mimeType || "application/octet-stream" })
          : new Blob([], { type: mimeType || "application/octet-stream" });

        if(!blob.size){
          const error = new Error("Recorded blob is empty");
          error.code = "EMPTY_BLOB";
          reject(error);
          return;
        }

        resolve({ blob, mimeType });
      };

      const onDataAvailable = (event)=>{
        if(event.data && event.data.size){
          chunks.push(event.data);
        }
      };

      const onStopEvent = ()=> finish();
      const onError = (event)=> fail(event?.error || recorder.error || new Error("MediaRecorder error"));

      recorder.addEventListener("dataavailable", onDataAvailable);
      recorder.addEventListener("stop", onStopEvent);
      recorder.addEventListener("error", onError);

      try{
        if(Number.isFinite(timesliceMs) && timesliceMs > 0){
          recorder.start(timesliceMs);
        }else{
          recorder.start();
        }
      }catch(error){
        fail(error);
        return;
      }

      Promise.resolve(onStart?.()).catch(()=>{});

      if(Number.isFinite(durationMs) && durationMs > 0){
        stopTimer = setTimeout(safeStop, durationMs);
      }

      if(stopPromise){
        Promise.resolve(stopPromise).then(safeStop).catch(()=>{});
      }
    });
  }

  async function recordStreamToBlob(options = {}){
    const {
      stream,
      format = "webm",
      durationMs = 20000,
      videoBitsPerSecond,
      audioBitsPerSecond,
      candidateMimeTypes = [],
      allowEmptyFallback = false,
      stopPromise = null,
      timesliceMs = undefined,
      validateMp4 = true,
      onProgress,
      progressPhase = "record",
      progressStart = 0,
      progressEnd = 1,
      onStart,
      onStop
    } = options;

    if(!stream){
      const error = new Error("Missing stream");
      error.code = "MISSING_STREAM";
      throw error;
    }

    const normalizedFormat = normalizeFormat(format);
    const attempts = prioritizeAudioCandidateMimeTypes(
      normalizedFormat,
      buildRecorderAttempts(normalizedFormat, candidateMimeTypes, allowEmptyFallback),
      streamHasAudio(stream)
    );
    if(!attempts.length){
      const error = new Error(`Format unsupported: ${normalizedFormat}`);
      error.code = "FORMAT_UNSUPPORTED";
      error.format = normalizedFormat;
      throw error;
    }

    let lastError = null;

    for(const attemptedMimeType of attempts){
      const optionVariants = buildRecorderOptionVariants(attemptedMimeType, videoBitsPerSecond, audioBitsPerSecond);

      for(const recorderOptions of optionVariants){
        const progressReporter = createTimedProgressReporter({
          onProgress,
          phase: progressPhase,
          startProgress: progressStart,
          endProgress: progressEnd,
          durationMs
        });

        try{
          const recorder = Object.keys(recorderOptions).length
            ? new MediaRecorder(stream, recorderOptions)
            : new MediaRecorder(stream);

          const recorded = await collectRecording(recorder, {
            durationMs,
            stopPromise,
            timesliceMs,
            onStart: async ()=>{
              progressReporter.start();
              if(onStart){
                await onStart();
              }
            },
            onStop: ()=>{
              progressReporter.finish();
              if(onStop){
                onStop();
              }
            }
          });
          const mimeType = finalizeMimeType(normalizedFormat, recorded.mimeType, attemptedMimeType);
          const blob = mimeType === recorded.mimeType
            ? recorded.blob
            : new Blob([recorded.blob], { type: mimeType });

          if(normalizedFormat === "mp4" && validateMp4){
            const playable = await canPlayVideoBlob(blob);
            if(!playable){
              const error = new Error("The generated MP4 is not playable");
              error.code = "UNPLAYABLE_BLOB";
              throw error;
            }
          }

          return {
            blob,
            mimeType,
            info: {
              format: normalizedFormat,
              label: getFormatConfig(normalizedFormat).label,
              extension: getFormatConfig(normalizedFormat).extension,
              mimeType,
              supported: true
            }
          };
        }catch(error){
          progressReporter.cancel();
          lastError = error;
        }
      }
    }

    const finalError = lastError || new Error(`Unable to record ${normalizedFormat}`);
    if(!finalError.code) finalError.code = "RECORD_FAILED";
    finalError.format = normalizedFormat;
    throw finalError;
  }

  async function probeRecorderSupport(format){
    const normalizedFormat = normalizeFormat(format);
    const cacheKey = `probe:${normalizedFormat}`;
    const cached = PROBE_CACHE.get(cacheKey);
    if(cached){
      return typeof cached.then === "function" ? await cached : cached;
    }

    const promise = (async ()=>{
      if(!hasMediaRecorder() || typeof document === "undefined"){
        return { supported:false, mimeType:"", format:normalizedFormat };
      }

      const canvas = document.createElement("canvas");
      canvas.width = 160;
      canvas.height = 90;
      const ctx = canvas.getContext("2d");
      if(!ctx || typeof canvas.captureStream !== "function"){
        return { supported:false, mimeType:"", format:normalizedFormat };
      }

      let step = 0;
      const drawFrame = ()=>{
        ctx.fillStyle = step % 2 === 0 ? "#111827" : "#0ea5e9";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.font = "700 18px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(normalizedFormat.toUpperCase(), canvas.width / 2, canvas.height / 2);
      };

      drawFrame();
      const stream = canvas.captureStream(12);
      const interval = setInterval(()=>{
        step += 1;
        drawFrame();
      }, 40);

      try{
        const result = await recordStreamToBlob({
          stream,
          format: normalizedFormat,
          durationMs: PROBE_DURATION_MS,
          videoBitsPerSecond: 320_000,
          audioBitsPerSecond: 64_000,
          candidateMimeTypes: getCandidateMimeTypes(normalizedFormat),
          allowEmptyFallback: normalizedFormat === "webm",
          timesliceMs: undefined,
          validateMp4: normalizedFormat === "mp4"
        });

        return {
          supported: true,
          mimeType: result.mimeType || getAdvertisedMimeType(normalizedFormat),
          format: normalizedFormat
        };
      }catch(error){
        return {
          supported: false,
          mimeType: "",
          format: normalizedFormat,
          error
        };
      }finally{
        clearInterval(interval);
        stopStreamTracks(stream);
      }
    })();

    PROBE_CACHE.set(cacheKey, promise);
    const result = await promise;
    PROBE_CACHE.set(cacheKey, result);
    return result;
  }

  async function recordCanvasClip(options = {}){
    const {
      canvas,
      format = "webm",
      durationMs = 20000,
      fps = 30,
      videoBitsPerSecond = 8_000_000,
      audioBitsPerSecond,
      createAudioBundle,
      onProgress,
      progressStart = 0,
      progressEnd = 1
    } = options;

    if(!canvas?.captureStream){
      const error = new Error("Canvas captureStream unavailable");
      error.code = "CAPTURE_STREAM_UNAVAILABLE";
      throw error;
    }

    let captureStream = null;
    let recordingStream = null;
    let audioBundle = null;

    try{
      captureStream = canvas.captureStream(fps);

      if(typeof createAudioBundle === "function"){
        emitProgress(onProgress, {
          phase: "audio",
          progress: progressStart,
          format: normalizeFormat(format)
        });
        audioBundle = await createAudioBundle();
      }

      recordingStream = composeMediaStream(captureStream, audioBundle?.stream);
      if(!recordingStream.getVideoTracks().length){
        const error = new Error("Missing video track");
        error.code = "MISSING_VIDEO_TRACK";
        throw error;
      }

      return await recordStreamToBlob({
        stream: recordingStream,
        format,
        durationMs,
        videoBitsPerSecond,
        audioBitsPerSecond,
        candidateMimeTypes: getCandidateMimeTypes(format),
        allowEmptyFallback: normalizeFormat(format) === "webm",
        timesliceMs: normalizeFormat(format) === "webm" ? 1000 : undefined,
        validateMp4: normalizeFormat(format) === "mp4",
        onProgress,
        progressPhase: "record",
        progressStart,
        progressEnd,
        onStart: async ()=>{
          await startAudioBundle(audioBundle);
        },
        onStop: ()=>{
          stopAudioBundle(audioBundle);
        }
      });
    } finally {
      await disposeAudioBundle(audioBundle);
      stopStreamTracks(recordingStream);
      stopStreamTracks(captureStream);
    }
  }

  async function loadVideoElement(video){
    if(video.readyState >= 2) return;

    await new Promise((resolve, reject)=>{
      let settled = false;
      const done = (ok, error)=>{
        if(settled) return;
        settled = true;
        cleanup();
        if(ok) resolve();
        else reject(error || new Error("Could not load media element"));
      };

      const cleanup = ()=>{
        video.removeEventListener("loadedmetadata", onReady);
        video.removeEventListener("canplay", onReady);
        video.removeEventListener("error", onError);
      };

      const onReady = ()=> done(true);
      const onError = ()=> done(false, new Error("Could not load media element"));

      video.addEventListener("loadedmetadata", onReady);
      video.addEventListener("canplay", onReady);
      video.addEventListener("error", onError);
    });
  }

  async function seekMediaElement(video, time = 0){
    if(!video || !Number.isFinite(time)) return;

    if(Math.abs((video.currentTime || 0) - time) < 0.01){
      try{ video.currentTime = time; }catch{}
      return;
    }

    await new Promise((resolve)=>{
      let settled = false;
      const done = ()=>{
        if(settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const cleanup = ()=>{
        clearTimeout(timer);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
      };
      const onSeeked = ()=> done();
      const onError = ()=> done();
      const timer = setTimeout(done, 1200);

      video.addEventListener("seeked", onSeeked, { once:true });
      video.addEventListener("error", onError, { once:true });

      try{
        video.currentTime = time;
      }catch{
        done();
      }
    });
  }

  async function playMediaElementForCapture(video){
    try{
      video.muted = false;
      video.volume = 1;
      await video.play();
      return;
    }catch{}

    video.muted = true;
    await video.play();
  }

  async function transcodeWebmBlobToMp4(options = {}){
    const {
      inputBlob,
      durationMs = 20000,
      videoBitsPerSecond = 8_000_000,
      audioBitsPerSecond,
      preferredMimeType = "",
      onProgress,
      progressStart = 0,
      progressEnd = 1
    } = options;

    if(!inputBlob){
      const error = new Error("Missing input blob");
      error.code = "MISSING_BLOB";
      throw error;
    }

    if(typeof document === "undefined"){
      const error = new Error("Document unavailable");
      error.code = "DOCUMENT_UNAVAILABLE";
      throw error;
    }

    const video = document.createElement("video");
    const url = URL.createObjectURL(inputBlob);
    const captureFactory = getMediaElementCapture(video);

    if(!captureFactory){
      const error = new Error("Media element captureStream unavailable");
      error.code = "ELEMENT_CAPTURE_UNAVAILABLE";
      throw error;
    }

    video.preload = "auto";
    video.playsInline = true;
    video.controls = false;
    video.muted = false;
    video.volume = 1;
    video.disablePictureInPicture = true;
    video.src = url;
    video.style.position = "fixed";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    video.style.left = "-9999px";
    video.style.top = "-9999px";
    document.body.appendChild(video);

    let playbackStream = null;
    let recordingStream = null;
    let audioCtx = null;
    let mediaSource = null;
    let mediaDestination = null;
    const progressReporter = createMediaProgressReporter(video, {
      onProgress,
      phase: "transcode",
      startProgress: progressStart,
      endProgress: progressEnd
    });

    try{
      await loadVideoElement(video);
      await playMediaElementForCapture(video);
      try{ video.pause(); }catch{}
      await seekMediaElement(video, 0);

      playbackStream = captureFactory();
      if(!playbackStream){
        const error = new Error("Unable to capture media element stream");
        error.code = "ELEMENT_CAPTURE_FAILED";
        throw error;
      }

      const videoOnlyStream = new MediaStream();
      playbackStream.getVideoTracks().forEach((track)=> videoOnlyStream.addTrack(track));

      const captureAudioStream = new MediaStream();
      playbackStream.getAudioTracks().forEach((track)=> captureAudioStream.addTrack(track));

      if(streamHasAudio(captureAudioStream)){
        recordingStream = composeMediaStream(videoOnlyStream, captureAudioStream);
      }else{
        const AudioCtx = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
        if(AudioCtx){
          try{
            audioCtx = new AudioCtx();
            const renderTap = audioCtx.createGain();
            renderTap.gain.value = 0.000001;
            try{ await audioCtx.resume(); }catch{}
            mediaSource = audioCtx.createMediaElementSource(video);
            mediaDestination = audioCtx.createMediaStreamDestination();
            mediaSource.connect(mediaDestination);
            mediaSource.connect(renderTap);
            renderTap.connect(audioCtx.destination);
            recordingStream = composeMediaStream(videoOnlyStream, mediaDestination.stream);
          }catch(error){
            if(audioCtx){
              try{ await audioCtx.close(); }catch{}
            }
            audioCtx = null;
            mediaSource = null;
            mediaDestination = null;
            recordingStream = composeMediaStream(videoOnlyStream, playbackStream);
          }
        }else{
          recordingStream = composeMediaStream(videoOnlyStream, playbackStream);
        }
      }

      if(!recordingStream.getVideoTracks().length){
        const error = new Error("Missing transcoding video track");
        error.code = "MISSING_VIDEO_TRACK";
        throw error;
      }

      const effectiveDurationMs = Number.isFinite(video.duration) && video.duration > 0
        ? Math.ceil(video.duration * 1000) + 1200
        : durationMs + 1200;

      const endedPromise = new Promise((resolve)=>{
        video.addEventListener("ended", resolve, { once:true });
      });

      const recordingPromise = recordStreamToBlob({
        stream: recordingStream,
        format: "mp4",
        durationMs: effectiveDurationMs,
        videoBitsPerSecond,
        audioBitsPerSecond,
        candidateMimeTypes: prioritizeAudioCandidateMimeTypes(
          "mp4",
          [preferredMimeType, ...getCandidateMimeTypes("mp4")],
          streamHasAudio(recordingStream)
        ),
        allowEmptyFallback: false,
        stopPromise: endedPromise,
        timesliceMs: undefined,
        validateMp4: true,
        onStart: ()=>{
          progressReporter.start();
        },
        onStop: ()=>{
          progressReporter.finish();
        }
      });

      await playMediaElementForCapture(video);
      return await recordingPromise;
    } finally {
      progressReporter.cancel();
      try{ video.pause(); }catch{}
      stopStreamTracks(recordingStream);
      stopStreamTracks(playbackStream);
      try{ mediaSource?.disconnect(); }catch{}
      try{ mediaDestination?.disconnect?.(); }catch{}
      if(audioCtx){
        try{ await audioCtx.close(); }catch{}
      }
      video.removeAttribute("src");
      try{ video.load(); }catch{}
      try{ URL.revokeObjectURL(url); }catch{}
      try{ video.remove(); }catch{}
    }
  }

  async function exportCanvasClip(options = {}){
    const {
      canvas,
      format = "webm",
      durationMs = 20000,
      fps = 30,
      videoBitsPerSecond = 8_000_000,
      audioBitsPerSecond,
      beforeStart,
      afterFinish,
      createAudioBundle,
      onProgress
    } = options;

    if(!canvas?.captureStream || !hasMediaRecorder()){
      const error = new Error("MediaRecorder unavailable");
      error.code = "RECORDER_UNAVAILABLE";
      throw error;
    }

    const normalizedFormat = normalizeFormat(format);
    const formatInfo = getFormatInfo(normalizedFormat);
    if(!formatInfo.supported){
      const error = new Error(`Format unsupported: ${normalizedFormat}`);
      error.code = "FORMAT_UNSUPPORTED";
      error.format = normalizedFormat;
      throw error;
    }

    emitProgress(onProgress, {
      phase: "prepare",
      progress: 0.01,
      format: normalizedFormat
    });

    let afterPending = false;
    const startLiveCapture = async ()=>{
      if(typeof beforeStart === "function"){
        await beforeStart();
        afterPending = true;
      }
    };
    const finishLiveCapture = async ()=>{
      if(afterPending && typeof afterFinish === "function"){
        afterPending = false;
        await afterFinish();
      }
    };

    try{
      if(normalizedFormat === "webm"){
        await startLiveCapture();
        const result = await recordCanvasClip({
          canvas,
          format: "webm",
          durationMs,
          fps,
          videoBitsPerSecond,
          audioBitsPerSecond,
          createAudioBundle,
          onProgress,
          progressStart: 0.04,
          progressEnd: 0.97
        });
        emitProgress(onProgress, {
          phase: "finalize",
          progress: 0.99,
          format: "webm"
        });
        return result;
      }

      const mp4Probe = await probeRecorderSupport("mp4");
      if(!mp4Probe.supported){
        const error = new Error("MP4 encoder unavailable");
        error.code = "FORMAT_UNSUPPORTED";
        error.format = "mp4";
        throw error;
      }

      emitProgress(onProgress, {
        phase: "prepare",
        progress: 0.03,
        format: "mp4"
      });

      const canUsePipeline = getCandidateMimeTypes("webm").length > 0 && canUseMediaElementFallback();

      if(canUsePipeline){
        await startLiveCapture();
        const intermediate = await recordCanvasClip({
          canvas,
          format: "webm",
          durationMs,
          fps,
          videoBitsPerSecond,
          audioBitsPerSecond,
          createAudioBundle,
          onProgress,
          progressStart: 0.06,
          progressEnd: 0.72
        });
        await finishLiveCapture();

        emitProgress(onProgress, {
          phase: "finalize",
          progress: 0.74,
          format: "mp4"
        });

        const transcoded = await transcodeWebmBlobToMp4({
          inputBlob: intermediate.blob,
          durationMs,
          videoBitsPerSecond,
          audioBitsPerSecond,
          preferredMimeType: mp4Probe.mimeType || formatInfo.mimeType,
          onProgress,
          progressStart: 0.76,
          progressEnd: 0.98
        });

        emitProgress(onProgress, {
          phase: "finalize",
          progress: 0.99,
          format: "mp4"
        });
        return transcoded;
      }

      await startLiveCapture();
      const result = await recordCanvasClip({
        canvas,
        format: "mp4",
        durationMs,
        fps,
        videoBitsPerSecond,
        audioBitsPerSecond,
        createAudioBundle,
        onProgress,
        progressStart: 0.06,
        progressEnd: 0.97
      });
      emitProgress(onProgress, {
        phase: "finalize",
        progress: 0.99,
        format: "mp4"
      });
      return result;
    } finally {
      await finishLiveCapture();
    }
  }

  window.CalyClipExporter = Object.freeze({
    getFormatInfo,
    getAvailableFormats,
    downloadBlob,
    exportCanvasClip,
    probeRecorderSupport
  });
})();
