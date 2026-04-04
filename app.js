/* C△lyCaLigramas — PWA
   MIT © 2025 — OptimeFlow(s)
*/
(function(){
  "use strict";

  // ====== Helpers ======
  const $  = (s,el=document)=> el.querySelector(s);
  const $$ = (s,el=document)=> Array.from(el.querySelectorAll(s));
  const on = (sel,ev,fn)=> $(sel)?.addEventListener(ev,fn);
  const clamp=(n,min,max)=> Math.max(min,Math.min(max,n));
  const lerp=(a,b,t)=> a + (b-a)*t;
  const rad =(deg)=> deg*Math.PI/180;

  // Color helpers
  function hexToRgb(hex){
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? {r:parseInt(m[1],16), g:parseInt(m[2],16), b:parseInt(m[3],16)} : {r:255,g:255,b:255};
  }
  function rgbToHex({r,g,b}){
    const h = (v)=> ('0'+(v|0).toString(16)).slice(-2);
    return '#'+h(r)+h(g)+h(b);
  }
  function mixHex(a,b,t){
    const A=hexToRgb(a), B=hexToRgb(b);
    return rgbToHex({ r:lerp(A.r,B.r,t), g:lerp(A.g,B.g,t), b:lerp(A.b,B.b,t) });
  }
  function shadeHex(hex, amt){
    const c=hexToRgb(hex); const k=amt>=0 ? 255 : 0;
    return rgbToHex({ r: c.r + (k - c.r)*Math.abs(amt),
                      g: c.g + (k - c.g)*Math.abs(amt),
                      b: c.b + (k - c.b)*Math.abs(amt) });
  }

  // ====== Canvas/State ======
  const Canvas = {
    el: null, ctx: null, dpr:1,
    bgDark:true, showGrid:false, fitOnResize:true
  };
  const State = {
  mode:'free',
  text:'C△lyCaLigramas',
  loopText:true, autoOrient:true,
  font:{ family:"system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Arial", weight:700, italic:false, letterSpacing:0, sizeMin:14, sizeMax:44 },
  color:{ a:'#22d3ee', b:'#a78bfa', alpha:0.95, shade3d:0.25 },
  stamp:{ spacing:18, baseAngle:0, jitterSize:12, jitterAngle:6 },
  zFx:{ freq:1.2, phase:0 },
  shape:{ type:'circle', A:160, B:5, steps:1200, rotate:0 },
  formula:{ fx:'cos(2*t)*(1+0.3*cos(12*t))', fy:'sin(2*t)*(1+0.3*cos(12*t))', fz:'0.5+0.5*sin(6*t)', tMin:0, tMax:Math.PI*2, steps:1600, autoScale:true },

  /* === NUEVO: vista y dinámico === */
  view:{ mode:'2d', depth:280, rot:{x:0,y:0,z:0}, autoCam:false, cam:{velH:15, velV:6, velR:0, returnHome:false, inverse:false}, camDist:900 },
  dynamic:{
    effect:'none',
    typewriter:{ delay:60, loop:false },
    random:{ delay:40 },
    wave:{ amp:10, freq:0.25, speed:2 }
  },
  textCursorIndex:0,
  wordCursorIndex:0,
  drawByWord:false,

  stamps:[],
  undoStack:[], redoStack:[]
};
  const MediaState = {
    uploadedBlob:null,
    uploadedName:'',
    recordedBlob:null,
    recorder:null,
    recorderStream:null,
    recorderChunks:[],
    isRecording:false,
    discardNextRecording:false
  };
  const ExportState = { busy:false, progress:{ visible:false, phase:'idle', value:0, format:'webm', message:'', hideTimer:0 } };
  const InstallState = { deferredPrompt:null, installed:false, iosManual:false };
  const DEFAULT_STATE = JSON.parse(JSON.stringify(State));
  const AUTO_CAM_CYCLE_SECONDS = 20;

  function cloneData(value){
    return JSON.parse(JSON.stringify(value));
  }

  function mergeMissingState(target, defaults){
    if(Array.isArray(defaults)){
      return Array.isArray(target) ? target : cloneData(defaults);
    }
    if(defaults && typeof defaults === 'object'){
      const base = (target && typeof target === 'object' && !Array.isArray(target)) ? target : {};
      for(const [key, value] of Object.entries(defaults)){
        if(base[key] === undefined) base[key] = cloneData(value);
        else base[key] = mergeMissingState(base[key], value);
      }
      return base;
    }
    return target === undefined ? defaults : target;
  }

  function ensureStateShape(){
    mergeMissingState(State, DEFAULT_STATE);

    State.loopText = !!State.loopText;
    State.autoOrient = !!State.autoOrient;
    State.drawByWord = !!State.drawByWord;

    State.view.autoCam = !!State.view.autoCam;
    State.view.cam.returnHome = !!State.view.cam.returnHome;
    State.view.cam.inverse = !!State.view.cam.inverse;

    State.dynamic.typewriter.loop = !!State.dynamic.typewriter.loop;
  }

  function syncViewRotationInputs(){
    if($('#rotX')) $('#rotX').value = State.view.rot.x;
    if($('#rotY')) $('#rotY').value = State.view.rot.y;
    if($('#rotZ')) $('#rotZ').value = State.view.rot.z;
  }

  function isEditableTarget(target){
    return !!(target && typeof target.closest === 'function' && target.closest('input, textarea, select, [contenteditable], [role="textbox"]'));
  }

  // ====== Header/Footer metrics → CSS vars ======
  function getShellInsets(){
    try{
      const headerH = document.querySelector('.brand-header')?.getBoundingClientRect().height || 0;
      const footerH = document.querySelector('.brand-footer')?.getBoundingClientRect().height || 0;
      return { headerH, footerH };
    }catch{
      return { headerH:0, footerH:0 };
    }
  }

  function setShellMetrics(){
    const { headerH, footerH } = getShellInsets();
    document.documentElement.style.setProperty('--header-h', headerH + 'px');
    document.documentElement.style.setProperty('--footer-h', footerH + 'px');
  }

  // ====== Tagline render ======
  function g(html, cls){ return `<span class="glyph ${cls||''}">${html}</span>`; }
  function renderTagline(){
    const t = $('#tagline'); if(!t) return;
    t.innerHTML =
      g('C','orb-blue big-letter') +
      g('△','orb-dawn') +
      g('l','frag-silver') +
      g('y','frag-white') +
      g('C','orb-blue big-letter') +
      g('a','sun-i') +
      g('L','orb-blue big-letter') +
      g('i','frag-white') +
      g('g','frag-silver') +
      g('r','frag-silver') +
      g('a','sun-i') +
      g('m','frag-silver') +
      g('a','sun-i') +
      g('s','frag-silver');
  }

  // ====== Themes / language / settings ======
  const THEMES = ['original','bosque','cyber','luz','carbono','matrix','vaporwave'];

  const tr = (key, params = {}, fallback = '')=>{
    try{
      const value = window.I18N?.t ? window.I18N.t(key, params, fallback || key) : undefined;
      return typeof value === 'string' ? value : (fallback || key);
    }catch{
      return fallback || key;
    }
  };

  function applyTheme(name){
    const t = THEMES.includes(name) ? name : 'original';
    document.documentElement.classList.remove(...THEMES.map(n => 'theme-' + n));
    document.documentElement.classList.add('theme-' + t);
    localStorage.setItem('calyTheme', t);
    const sel = $('#themeSelect');
    if(sel && sel.value !== t) sel.value = t;
    drawAll();
  }

  function applyLanguage(name){
    if(window.I18N?.setLanguage){
      return window.I18N.setLanguage(name);
    }
    const l = String(name || 'es').toLowerCase();
    const htmlLang = l === 'pt-br' ? 'pt-BR' : l;
    document.documentElement.setAttribute('lang', htmlLang);
    localStorage.setItem('calyLanguage', l);
    const sel = $('#languageSelect');
    if(sel && sel.value !== l) sel.value = l;
    return Promise.resolve();
  }

  function applyLocalizedDefaults(){
    State.text = tr('defaults.text', {}, State.text);
    State.formula.fx = tr('defaults.formula.fx', {}, State.formula.fx);
    State.formula.fy = tr('defaults.formula.fy', {}, State.formula.fy);
    State.formula.fz = tr('defaults.formula.fz', {}, State.formula.fz);
    ensureTextCursorState();
  }

  function isStandaloneAppMode(){
    return !!(
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: fullscreen)').matches ||
      window.navigator.standalone === true ||
      String(document.referrer || '').startsWith('android-app://')
    );
  }

  function isIosSafariInstallSupported(){
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || '';
    const touchPoints = Number(navigator.maxTouchPoints || 0);
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
    const isWebKit = /webkit/i.test(ua);
    const excluded = /crios|fxios|edgios|opios|mercury|gsa/i.test(ua);
    return isIOS && isWebKit && !excluded;
  }

  function updateInstallButtonUI(){
    const row = $('#installAppRow');
    const button = $('#btnInstallApp');
    const hint = $('#installAppHint');
    const hasPrompt = !!InstallState.deferredPrompt;
    const installed = isStandaloneAppMode();
    const iosManual = !installed && !hasPrompt && isIosSafariInstallSupported();

    InstallState.installed = installed;
    InstallState.iosManual = iosManual;

    const show = !installed && (hasPrompt || iosManual);
    const showHint = show && iosManual && !hasPrompt;

    if(row){
      row.hidden = !show;
      row.setAttribute('aria-hidden', show ? 'false' : 'true');
    }

    if(button){
      button.hidden = !show;
      button.disabled = !show;
      button.setAttribute('aria-hidden', show ? 'false' : 'true');
    }

    if(hint){
      hint.hidden = !showHint;
      hint.setAttribute('aria-hidden', showHint ? 'false' : 'true');
    }
  }

  async function requestAppInstall(){
    if(isStandaloneAppMode()){
      InstallState.deferredPrompt = null;
      updateInstallButtonUI();
      return;
    }

    if(InstallState.deferredPrompt){
      const promptEvent = InstallState.deferredPrompt;
      InstallState.deferredPrompt = null;
      updateInstallButtonUI();

      try{
        await promptEvent.prompt();
        if(promptEvent.userChoice && typeof promptEvent.userChoice.then === 'function'){
          await promptEvent.userChoice;
        }
      }catch(error){
        console.error(error);
        alert(tr('messages.installUnavailable', {}, 'La instalación no está disponible en este navegador por ahora.'));
      }finally{
        updateInstallButtonUI();
      }
      return;
    }

    if(isIosSafariInstallSupported()){
      alert(tr('messages.installIosInstructions', {}, 'En iPhone/iPad, pulsa Compartir y luego «Añadir a pantalla de inicio».'));
      return;
    }

    alert(tr('messages.installUnavailable', {}, 'La instalación no está disponible en este navegador por ahora.'));
  }

  function initInstallPrompt(){
    const sync = ()=> updateInstallButtonUI();
    const standaloneQuery = window.matchMedia ? window.matchMedia('(display-mode: standalone)') : null;

    if(standaloneQuery?.addEventListener) standaloneQuery.addEventListener('change', sync);
    else if(standaloneQuery?.addListener) standaloneQuery.addListener(sync);

    window.addEventListener('beforeinstallprompt', (event)=>{
      event.preventDefault();
      InstallState.deferredPrompt = event;
      updateInstallButtonUI();
    });

    window.addEventListener('appinstalled', ()=>{
      InstallState.deferredPrompt = null;
      updateInstallButtonUI();
    });

    on('#btnInstallApp','click', ()=>{ void requestAppInstall(); });
    updateInstallButtonUI();
  }

  function refreshLocalizedRuntime(){
    const updated = (new Date()).toISOString().slice(0,10);
    if($('#ppTitle')) $('#ppTitle').textContent = tr('overlays.privacy.title', {}, $('#ppTitle').textContent);
    if($('#ppBody')) $('#ppBody').innerHTML = tr('overlays.privacy.body', { updated }, $('#ppBody').innerHTML);
    if($('#licenseBody')){
      $('#licenseBody').textContent = tr('overlays.license.body', {
        year: new Date().getFullYear(),
        author: tr('footer.author', {}, 'Andrés Calvo Espinosa')
      }, $('#licenseBody').textContent);
    }
    updateDynDuration();
    updateClipExportDialogTexts();
    updateClipExportUI();
    updateDynamicMediaUI();
    renderExportProgressToast();
  }

  function getClipExporter(){
    return window.CalyClipExporter || null;
  }

  function getClipFormats(){
    const exporter = getClipExporter();
    if(!exporter?.getAvailableFormats){
      return [
        { format:'webm', label:'WebM', extension:'webm', mimeType:'', supported:false },
        { format:'mp4', label:'MP4', extension:'mp4', mimeType:'', supported:false }
      ];
    }
    return exporter.getAvailableFormats();
  }

  function getClipFormatInfo(format){
    return getClipFormats().find((item)=> item.format === format) || {
      format,
      label:String(format || '').toUpperCase(),
      extension:String(format || '').toLowerCase(),
      mimeType:'',
      supported:false
    };
  }

  function closeClipExportOverlay(){
    const overlay = $('#clipExportOverlay');
    if(!overlay) return;
    overlay.style.display = 'none';
    overlay.setAttribute('aria-hidden', 'true');
  }

  function openClipExportOverlay(){
    if(ExportState.busy || MediaState.isRecording) return;

    const overlay = $('#clipExportOverlay');
    if(!overlay) return;

    updateClipExportDialogTexts();
    updateClipExportOverlayOptions();
    overlay.style.display = 'flex';
    overlay.setAttribute('aria-hidden', 'false');
  }

  function updateClipExportDialogTexts(){
    if($('#clipExportTitle')) $('#clipExportTitle').textContent = tr('dialogs.exportClip.title', {}, 'Exportar clip de 20 s');
    if($('#clipExportBody')) $('#clipExportBody').textContent = tr('dialogs.exportClip.body', {}, 'Elige el formato de vídeo. MP4 solo se activará si tu navegador puede grabarlo de forma nativa.');
    if($('#clipExportWebmName')) $('#clipExportWebmName').textContent = tr('dialogs.exportClip.webm', {}, 'WebM');
    if($('#clipExportMp4Name')) $('#clipExportMp4Name').textContent = tr('dialogs.exportClip.mp4', {}, 'MP4');
  }

  function updateClipExportOverlayOptions(){
    const webmBtn = $('#btnExportClipWebmOption');
    const mp4Btn = $('#btnExportClipMp4Option');
    const webmMeta = $('#clipExportWebmMeta');
    const mp4Meta = $('#clipExportMp4Meta');
    const closeBtn = $('#btnCloseClipExport');

    const disabled = ExportState.busy || MediaState.isRecording;
    const webmInfo = getClipFormatInfo('webm');
    const mp4Info = getClipFormatInfo('mp4');
    const toMeta = (info)=> info.supported
      ? `${tr('dialogs.exportClip.available', {}, 'Disponible')} · ${info.mimeType || info.extension || info.label}`
      : tr('dialogs.exportClip.unavailable', {}, 'No disponible en este navegador');

    if(webmBtn) webmBtn.disabled = disabled || !webmInfo.supported;
    if(mp4Btn) mp4Btn.disabled = disabled || !mp4Info.supported;
    if(closeBtn) closeBtn.disabled = ExportState.busy;

    if(webmMeta) webmMeta.textContent = toMeta(webmInfo);
    if(mp4Meta) mp4Meta.textContent = toMeta(mp4Info);
  }

  function updateClipExportUI(){
    const btn = $('#btnExportClip20s');
    if(btn){
      btn.disabled = ExportState.busy || MediaState.isRecording;
      btn.textContent = ExportState.busy
        ? tr('panels.general.exportClipBusy', {}, 'Exportando clip...')
        : tr('panels.general.exportClip20s', {}, 'Exportar clip 20s');
    }
    updateClipExportOverlayOptions();
  }

  function updateDynamicMediaUI(){
    const addAudioBtn = $('#btnAddAudio');
    const removeAudioBtn = $('#btnRemoveAudio');
    const recordBtn = $('#btnRecordMic');
    const removeRecordingBtn = $('#btnRemoveRecordedAudio');
    const audioStatus = $('#audioFileStatus');
    const micStatus = $('#micRecordStatus');

    if(addAudioBtn) addAudioBtn.disabled = ExportState.busy || MediaState.isRecording;
    if(removeAudioBtn) removeAudioBtn.disabled = !MediaState.uploadedBlob || ExportState.busy || MediaState.isRecording;
    if(recordBtn){
      recordBtn.disabled = ExportState.busy;
      recordBtn.textContent = MediaState.isRecording
        ? tr('panels.dynamic.stopRecording', {}, 'Detener grabación')
        : tr('panels.dynamic.recordMic', {}, 'Grabar micrófono');
      recordBtn.classList.toggle('is-recording', MediaState.isRecording);
    }
    if(removeRecordingBtn) removeRecordingBtn.disabled = (!MediaState.recordedBlob && !MediaState.isRecording) || ExportState.busy;

    if(audioStatus){
      audioStatus.textContent = MediaState.uploadedBlob
        ? tr('panels.dynamic.audioStatusLoaded', { name: MediaState.uploadedName }, `Audio cargado: ${MediaState.uploadedName}`)
        : tr('panels.dynamic.audioStatusEmpty', {}, 'Sin audio cargado.');
    }

    if(micStatus){
      micStatus.textContent = MediaState.isRecording
        ? tr('panels.dynamic.recordStatusRecording', {}, 'Grabando desde el micrófono...')
        : (MediaState.recordedBlob
            ? tr('panels.dynamic.recordStatusReady', {}, 'Grabación lista para exportar.')
            : tr('panels.dynamic.recordStatusEmpty', {}, 'Sin grabación.'));
    }

    const clipExportBtn = $('#btnExportClip20s');
    if(clipExportBtn) clipExportBtn.disabled = ExportState.busy || MediaState.isRecording;

    updateClipExportOverlayOptions();
  }

  function clearExportProgressHideTimer(){
    if(ExportState.progress?.hideTimer){
      clearTimeout(ExportState.progress.hideTimer);
      ExportState.progress.hideTimer = 0;
    }
  }

  function getExportProgressTitle(format){
    const formatLabel = String(format || '').toLowerCase() === 'mp4' ? 'MP4' : 'WebM';
    return tr('toast.exportVideoWithFormat', { format: formatLabel }, `Generando ${formatLabel}`);
  }

  function getExportProgressMessage(phase){
    switch(String(phase || '').toLowerCase()){
      case 'audio':
        return tr('toast.exportVideoAudio', {}, 'Preparando audio...');
      case 'record':
        return tr('toast.exportVideoRecording', {}, 'Grabando clip...');
      case 'transcode':
        return tr('toast.exportVideoTranscoding', {}, 'Convirtiendo a MP4...');
      case 'finalize':
        return tr('toast.exportVideoFinalizing', {}, 'Finalizando archivo...');
      case 'done':
        return tr('toast.exportVideoDone', {}, 'Vídeo listo. Iniciando descarga...');
      case 'error':
        return tr('toast.exportVideoError', {}, 'La exportación del vídeo ha fallado.');
      case 'prepare':
      default:
        return tr('toast.exportVideoPreparing', {}, 'Preparando exportación...');
    }
  }

  function renderExportProgressToast(){
    const toast = $('#export-progress-toast');
    if(!toast) return;

    const title = $('#exportProgressTitle');
    const textNode = $('#exportProgressText');
    const percent = $('#exportProgressPercent');
    const track = $('#exportProgressTrack');
    const bar = $('#exportProgressBar');
    const state = ExportState.progress || {};
    const value = clamp(Math.round((Number(state.value) || 0) * 100), 0, 100);
    const visible = !!state.visible;

    toast.hidden = !visible;
    toast.style.display = visible ? 'grid' : 'none';
    toast.setAttribute('aria-hidden', visible ? 'false' : 'true');

    if(title) title.textContent = getExportProgressTitle(state.format || 'webm');
    if(textNode) textNode.textContent = state.message || getExportProgressMessage(state.phase || 'prepare');
    if(percent) percent.textContent = `${value}%`;
    if(bar) bar.style.width = `${value}%`;
    if(track) track.setAttribute('aria-valuenow', String(value));
  }

  function showExportProgressToast(options = {}){
    clearExportProgressHideTimer();
    const current = ExportState.progress || {};
    ExportState.progress = {
      ...current,
      visible: true,
      phase: options.phase || current.phase || 'prepare',
      value: clamp(Number(options.value ?? options.progress ?? current.value ?? 0), 0, 1),
      format: options.format || current.format || 'webm',
      message: typeof options.message === 'string' ? options.message : (current.message || ''),
      hideTimer: 0
    };
    renderExportProgressToast();
  }

  function hideExportProgressToast(delayMs = 0){
    clearExportProgressHideTimer();
    const applyHide = ()=>{
      ExportState.progress = {
        ...(ExportState.progress || {}),
        visible: false,
        phase: 'idle',
        value: 0,
        message: '',
        hideTimer: 0
      };
      renderExportProgressToast();
    };

    if(delayMs > 0){
      ExportState.progress.hideTimer = setTimeout(applyHide, delayMs);
      return;
    }

    applyHide();
  }

  function updateExportProgressToast(options = {}){
    showExportProgressToast(options);
  }

  function downloadBlob(blob, filename){
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(()=>{
      try{ URL.revokeObjectURL(link.href); }catch{}
    }, 1500);
  }

  function getSupportedAudioMimeType(){
    if(typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];
    return types.find((type)=> MediaRecorder.isTypeSupported(type)) || '';
  }

  function clearUploadedAudio(){
    MediaState.uploadedBlob = null;
    MediaState.uploadedName = '';
    const input = $('#audioFileInput');
    if(input) input.value = '';
    updateDynamicMediaUI();
  }

  function clearRecordedAudio(){
    if(MediaState.isRecording) return;
    MediaState.recordedBlob = null;
    updateDynamicMediaUI();
  }

  function releaseMicStream(){
    MediaState.recorderStream?.getTracks().forEach((track)=>{
      try{ track.stop(); }catch{}
    });
    MediaState.recorderStream = null;
  }

  function cleanupMicRecorder(){
    releaseMicStream();
    MediaState.recorder = null;
    MediaState.recorderChunks = [];
    MediaState.isRecording = false;
  }

  async function startMicRecording(){
    if(MediaState.isRecording) return;
    if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined'){
      alert(tr('messages.micUnsupported', {}, 'La grabación de audio no está disponible en este navegador.'));
      return;
    }

    const audioMimeType = getSupportedAudioMimeType();
    try{
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = audioMimeType ? new MediaRecorder(stream, { mimeType: audioMimeType }) : new MediaRecorder(stream);
      MediaState.recorderStream = stream;
      MediaState.recorder = recorder;
      MediaState.recorderChunks = [];
      MediaState.isRecording = true;
      MediaState.discardNextRecording = false;

      recorder.addEventListener('dataavailable', (event)=>{
        if(event.data && event.data.size) MediaState.recorderChunks.push(event.data);
      });

      recorder.addEventListener('stop', ()=>{
        const chunks = MediaState.recorderChunks.slice();
        const type = recorder.mimeType || audioMimeType || 'audio/webm';
        const shouldKeep = !MediaState.discardNextRecording;
        cleanupMicRecorder();
        MediaState.discardNextRecording = false;
        if(shouldKeep && chunks.length){
          MediaState.recordedBlob = new Blob(chunks, { type });
        }
        updateDynamicMediaUI();
      }, { once:true });

      recorder.addEventListener('error', ()=>{
        cleanupMicRecorder();
        MediaState.discardNextRecording = false;
        updateDynamicMediaUI();
        alert(tr('messages.recordingError', {}, 'No se pudo completar la grabación de audio.'));
      }, { once:true });

      recorder.start();
      updateDynamicMediaUI();
    }catch(error){
      console.error(error);
      cleanupMicRecorder();
      MediaState.discardNextRecording = false;
      updateDynamicMediaUI();
      alert(tr('messages.micAccessError', {}, 'No se pudo acceder al micrófono.'));
    }
  }

  function stopMicRecording(discard = false){
    if(!MediaState.recorder){
      if(discard){
        MediaState.recordedBlob = null;
        updateDynamicMediaUI();
      }
      return;
    }
    MediaState.discardNextRecording = discard;
    if(MediaState.recorder.state === 'inactive'){
      cleanupMicRecorder();
      MediaState.discardNextRecording = false;
      updateDynamicMediaUI();
      return;
    }
    MediaState.recorder.stop();
  }

  async function toggleMicRecording(){
    if(MediaState.isRecording){
      stopMicRecording(false);
      return;
    }
    await startMicRecording();
  }

  function nextFrame(){
    return new Promise((resolve)=> requestAnimationFrame(resolve));
  }

  function decodeAudioBuffer(audioCtx, arrayBuffer){
    return new Promise((resolve, reject)=>{
      let settled = false;
      const success = (buffer)=>{
        if(settled) return;
        settled = true;
        resolve(buffer);
      };
      const failure = (error)=>{
        if(settled) return;
        settled = true;
        reject(error);
      };
      try{
        const result = audioCtx.decodeAudioData(arrayBuffer.slice(0), success, failure);
        if(result && typeof result.then === 'function') result.then(success).catch(failure);
      }catch(error){
        failure(error);
      }
    });
  }

  function waitForMediaElementReady(mediaEl){
    if(!mediaEl) return Promise.reject(new Error('Missing media element'));
    if(mediaEl.readyState >= 2) return Promise.resolve();

    return new Promise((resolve, reject)=>{
      let settled = false;
      const done = (ok, error)=>{
        if(settled) return;
        settled = true;
        cleanup();
        if(ok) resolve();
        else reject(error || new Error('Media element load error'));
      };
      const cleanup = ()=>{
        clearTimeout(timer);
        mediaEl.removeEventListener('loadeddata', onReady);
        mediaEl.removeEventListener('canplay', onReady);
        mediaEl.removeEventListener('error', onError);
      };
      const onReady = ()=> done(true);
      const onError = ()=> done(false, new Error('Media element load error'));
      const timer = setTimeout(()=> done(false, new Error('Media element load timeout')), 12000);

      mediaEl.addEventListener('loadeddata', onReady);
      mediaEl.addEventListener('canplay', onReady);
      mediaEl.addEventListener('error', onError);

      try{ mediaEl.load?.(); }catch{}
    });
  }

  async function createAudioElementDescriptor(audioCtx, masterNode, blob){
    const url = URL.createObjectURL(blob);
    const audioEl = new Audio();
    audioEl.preload = 'auto';
    audioEl.playsInline = true;
    audioEl.crossOrigin = 'anonymous';
    audioEl.loop = false;
    audioEl.src = url;

    await waitForMediaElementReady(audioEl);

    const sourceNode = audioCtx.createMediaElementSource(audioEl);
    sourceNode.connect(masterNode);

    return {
      kind: 'element',
      url,
      element: audioEl,
      sourceNode
    };
  }

  async function buildExportAudioDescriptor(audioCtx, masterNode, blob){
    if(!blob) return null;

    try{
      const buffer = await decodeAudioBuffer(audioCtx, await blob.arrayBuffer());
      return { kind:'buffer', buffer };
    }catch(error){
      try{
        return await createAudioElementDescriptor(audioCtx, masterNode, blob);
      }catch(mediaError){
        console.warn(mediaError);
        return null;
      }
    }
  }

  async function createExportAudioStream(){
    const blobs = [];
    if(MediaState.uploadedBlob) blobs.push(MediaState.uploadedBlob);
    if(MediaState.recordedBlob) blobs.push(MediaState.recordedBlob);
    if(!blobs.length) return null;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if(!AudioCtx) return null;

    const audioCtx = new AudioCtx();
    const destination = audioCtx.createMediaStreamDestination();
    const masterGain = audioCtx.createGain();
    const renderTap = audioCtx.createGain();
    let keepAliveSource = null;
    let keepAliveGain = null;

    masterGain.gain.value = blobs.length > 1 ? (0.82 / Math.sqrt(blobs.length)) : 0.96;
    renderTap.gain.value = 0.000001;
    masterGain.connect(destination);
    masterGain.connect(renderTap);
    renderTap.connect(audioCtx.destination);

    if(typeof audioCtx.createConstantSource === 'function'){
      keepAliveSource = audioCtx.createConstantSource();
      keepAliveGain = audioCtx.createGain();
      keepAliveSource.offset.value = 0;
      keepAliveGain.gain.value = 0;
      keepAliveSource.connect(keepAliveGain);
      keepAliveGain.connect(destination);
    }

    try{ await audioCtx.resume(); }catch{}
    if(keepAliveSource){
      try{ keepAliveSource.start(); }catch{}
    }

    const descriptors = [];
    for(const blob of blobs){
      const descriptor = await buildExportAudioDescriptor(audioCtx, masterGain, blob);
      if(descriptor) descriptors.push(descriptor);
    }

    if(!descriptors.length){
      try{ keepAliveSource?.stop(); }catch{}
      try{ keepAliveSource?.disconnect(); }catch{}
      try{ keepAliveGain?.disconnect(); }catch{}
      try{ masterGain.disconnect(); }catch{}
      try{ renderTap.disconnect(); }catch{}
      try{ await audioCtx.close(); }catch{}
      return null;
    }

    let started = false;
    let activeSources = [];

    const stop = ()=>{
      activeSources.forEach((source)=>{
        try{ source.stop(0); }catch{}
        try{ source.disconnect(); }catch{}
      });
      activeSources = [];

      for(const descriptor of descriptors){
        if(descriptor.kind === 'element'){
          try{ descriptor.element.pause(); }catch{}
          try{ descriptor.element.currentTime = 0; }catch{}
        }
      }

      started = false;
    };

    const start = async ()=>{
      if(started) return;
      started = true;

      try{ await audioCtx.resume(); }catch{}
      const startAt = audioCtx.currentTime + 0.06;

      for(const descriptor of descriptors){
        if(descriptor.kind === 'buffer'){
          const source = audioCtx.createBufferSource();
          source.buffer = descriptor.buffer;
          source.connect(masterGain);
          source.start(startAt);
          activeSources.push(source);
          continue;
        }

        if(descriptor.kind === 'element'){
          try{ descriptor.element.pause(); }catch{}
          try{ descriptor.element.currentTime = 0; }catch{}
          const playPromise = descriptor.element.play();
          if(playPromise && typeof playPromise.catch === 'function'){
            playPromise.catch((error)=> console.warn(error));
          }
        }
      }
    };

    const dispose = async ()=>{
      stop();

      for(const descriptor of descriptors){
        if(descriptor.kind === 'element'){
          try{ descriptor.sourceNode.disconnect(); }catch{}
          try{ descriptor.element.removeAttribute('src'); descriptor.element.load(); }catch{}
          try{ URL.revokeObjectURL(descriptor.url); }catch{}
        }
      }

      try{ keepAliveSource?.stop(); }catch{}
      try{ keepAliveSource?.disconnect(); }catch{}
      try{ keepAliveGain?.disconnect(); }catch{}
      try{ masterGain.disconnect(); }catch{}
      try{ renderTap.disconnect(); }catch{}
      try{ await audioCtx.close(); }catch{}
    };

    return {
      audioCtx,
      stream: destination.stream,
      start,
      stop,
      dispose,
      cleanup: [()=>{ void dispose(); }]
    };
  }

  function getClipFilenameForFormat(format, mimeType){
    const normalizedFormat = String(format || '').toLowerCase();
    const finalFormat = normalizedFormat === 'mp4' || (typeof mimeType === 'string' && mimeType.includes('mp4')) ? 'mp4' : 'webm';
    return tr(
      finalFormat === 'mp4' ? 'files.exportClipMp4' : 'files.exportClipWebm',
      {},
      finalFormat === 'mp4' ? 'calycaligrama-clip-20s.mp4' : 'calycaligrama-clip-20s.webm'
    );
  }

  async function exportClip20s(format = 'webm'){
    if(ExportState.busy) return;

    const exporter = getClipExporter();
    if(!exporter?.exportCanvasClip){
      alert(tr('messages.exportModuleMissing', {}, 'No se encontró el módulo de exportación de vídeo.'));
      return;
    }

    const formatInfo = getClipFormatInfo(format);
    if(!formatInfo.supported){
      alert(tr('messages.exportFormatUnsupported', {}, 'Ese formato de vídeo no está disponible en este navegador.'));
      updateClipExportOverlayOptions();
      return;
    }

    if(!Canvas.el?.captureStream || typeof MediaRecorder === 'undefined'){
      alert(tr('messages.exportClipUnsupported', {}, 'La exportación de vídeo no está disponible en este navegador.'));
      return;
    }

    closeClipExportOverlay();
    clearExportProgressHideTimer();
    updateExportProgressToast({ format, phase:'prepare', value:0, message:'' });

    ExportState.busy = true;
    updateClipExportUI();
    updateDynamicMediaUI();

    const wasPlaying = Anim.playing;

    try{
      const result = await exporter.exportCanvasClip({
        canvas: Canvas.el,
        format,
        durationMs: 20000,
        fps: 30,
        videoBitsPerSecond: 8_000_000,
        audioBitsPerSecond: 192_000,
        createAudioBundle: createExportAudioStream,
        onProgress: (detail = {})=>{
          updateExportProgressToast({
            format: detail.format || format,
            phase: detail.phase || 'prepare',
            value: Number.isFinite(detail.progress) ? detail.progress : 0,
            message: typeof detail.message === 'string' ? detail.message : ''
          });
        },
        beforeStart: async ()=>{
          if(!wasPlaying){
            startAnim();
            await nextFrame();
          }
        },
        afterFinish: async ()=>{
          if(!wasPlaying) stopAnim();
        }
      });

      updateExportProgressToast({ format, phase:'done', value:1, message:'' });

      if(result?.blob){
        downloadBlob(
          result.blob,
          getClipFilenameForFormat(format, result.mimeType || result.info?.mimeType)
        );
      }

      hideExportProgressToast(1800);
    }catch(error){
      console.error(error);
      updateExportProgressToast({ format, phase:'error', value:0, message:'' });
      hideExportProgressToast(2400);
      const message = error?.code === 'FORMAT_UNSUPPORTED'
        ? tr('messages.exportFormatUnsupported', {}, 'Ese formato de vídeo no está disponible en este navegador.')
        : tr('messages.exportClipError', {}, 'No se pudo exportar el clip de vídeo.');
      alert(message);
    }finally{
      ExportState.busy = false;
      updateClipExportUI();
      updateDynamicMediaUI();
    }
  }

  function exportPNG(){
    Canvas.el.toBlob(blob=>{
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download = tr('files.exportPng', {}, 'calycaligrama.png'); a.click(); URL.revokeObjectURL(a.href);
    });
  }
  function saveDesign(){
    const data = { v:1, state:State, canvas:{ w:Canvas.el.width/Canvas.dpr, h:Canvas.el.height/Canvas.dpr, bgDark:Canvas.bgDark, showGrid:Canvas.showGrid } };
    const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download = tr('files.saveJson', {}, 'calycaligrama.json'); a.click(); URL.revokeObjectURL(a.href);
  }
  function loadDesignFile(file){
    const fr=new FileReader();
    fr.onload=()=>{
      try{
        const data=JSON.parse(fr.result);
        if(!data || !data.state) throw new Error('formato');
        Object.assign(State, data.state);
        ensureStateShape();
        State.drawByWord = !!State.drawByWord;
        Canvas.bgDark = !!data.canvas?.bgDark; Canvas.showGrid = !!data.canvas?.showGrid;
        ensureTextCursorState();
        fitCanvas(); drawAll(); syncUI();
      }catch{ alert(tr('messages.invalidFile', {}, 'Archivo no válido')); }
    };
    fr.readAsText(file);
  }
  function initSettingsSheet(){
    const btn = $('#btnSettings');
    const sheet = $('#settingsSheet');
    const card = sheet?.querySelector('.settings-card');
    if(!btn || !sheet || !card) return;

    const open = ()=>{
      sheet.classList.add('is-open');
      sheet.setAttribute('aria-hidden', 'false');
      btn.setAttribute('aria-expanded', 'true');
    };

    const close = ()=>{
      sheet.classList.remove('is-open');
      sheet.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-expanded', 'false');
    };

    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      sheet.classList.contains('is-open') ? close() : open();
    });

    sheet.addEventListener('click', (e)=>{
      if(!card.contains(e.target)) close();
    });

    window.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape'){
        close();
        closeClipExportOverlay();
      }
    });
  }


  // ====== Canvas ======
  function initCanvas(){
    Canvas.el = $('#calyCanvas');
    Canvas.ctx = Canvas.el.getContext('2d');
    Canvas.el.style.touchAction = 'none';
    fitCanvas();
    drawAll();
  }
  function fitCanvas(){
    const rect = Canvas.el.getBoundingClientRect();
    const dpr  = devicePixelRatio || 1;
    Canvas.dpr = dpr;
    const w = Math.max(300, rect.width);
    const h = Math.max(300, rect.height);
    Canvas.el.width  = Math.round(w * dpr);
    Canvas.el.height = Math.round(h * dpr);
    Canvas.ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  function clearCanvas(bgOnly=false){
    if(!Canvas.ctx) return;
    const ctx = Canvas.ctx, W = Canvas.el.width/Canvas.dpr, H = Canvas.el.height/Canvas.dpr;
    ctx.save();
    ctx.fillStyle = Canvas.bgDark ? '#0b1e21' : '#f1f5f9';
    ctx.fillRect(0,0,W,H);
    if(Canvas.showGrid){
      ctx.strokeStyle = Canvas.bgDark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.08)';
      ctx.lineWidth = 1; ctx.beginPath();
      const step = 40;
      for(let x=0; x<=W; x+=step){ ctx.moveTo(x,0); ctx.lineTo(x,H); }
      for(let y=0; y<=H; y+=step){ ctx.moveTo(0,y); ctx.lineTo(W,y); }
      ctx.stroke();
    }
    ctx.restore();
    if(!bgOnly){ for(const s of State.stamps) drawStamp(s); }
  }
  function drawStamp(s){
    const ctx=Canvas.ctx; if(!ctx) return;
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.font = `${State.font.italic?'italic ':''}${State.font.weight} ${s.size}px ${State.font.family}`;
    ctx.fillStyle = s.color;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    if(State.font.letterSpacing===0) ctx.fillText(s.ch,0,0);
    else{
      const ls=State.font.letterSpacing, chars=s.ch.split(''); let x=-((chars.length-1)*ls)/2;
      for(const c of chars){ ctx.fillText(c,x,0); x+=ls; }
    }
    ctx.restore();
  }
  function drawAll(){
  if(State.view.mode==='3d') draw3DStatic();
  else clearCanvas(false);
}

  function getDrawableText(){
    return String(State.text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\n/g, ' ');
  }

  function clampTextCursor(index, text = getDrawableText()){
    if(!text.length) return 0;
    return clamp(parseInt(index, 10) || 0, 0, text.length - 1);
  }

  function getWordSegments(text = getDrawableText()){
    const words = [];
    const re = /\S+/g;
    let match;
    while((match = re.exec(text)) !== null){
      words.push({
        value: match[0],
        start: match.index,
        end: match.index + match[0].length
      });
    }
    return words;
  }

  function getWordIndexFromCursor(words, cursor){
    if(!words.length) return 0;
    for(let i = 0; i < words.length; i += 1){
      if(cursor < words[i].end) return i;
    }
    return words.length - 1;
  }

  function syncWordCursorFromText(text = getDrawableText()){
    const words = getWordSegments(text);
    if(!words.length){
      State.wordCursorIndex = 0;
      return;
    }
    State.wordCursorIndex = clamp(getWordIndexFromCursor(words, clampTextCursor(State.textCursorIndex, text)), 0, words.length - 1);
  }

  function ensureTextCursorState(){
    const text = getDrawableText();
    if(!text.length){
      State.textCursorIndex = 0;
      State.wordCursorIndex = 0;
      return text;
    }
    State.textCursorIndex = clampTextCursor(State.textCursorIndex, text);
    syncWordCursorFromText(text);
    return text;
  }

  function getTextStartIndex(text = getDrawableText()){
    if(!text.length) return 0;
    const firstVisible = text.search(/\S/);
    return firstVisible === -1 ? 0 : firstVisible;
  }

  function resetTextCursorToStart(syncField=false){
    const text = getDrawableText();
    if(!text.length){
      State.textCursorIndex = 0;
      State.wordCursorIndex = 0;
      return;
    }

    const startIndex = getTextStartIndex(text);
    State.textCursorIndex = startIndex;
    syncWordCursorFromText(text);

    if(!syncField) return;

    const field = $('#text');
    if(!field || typeof field.setSelectionRange !== 'function') return;

    try{
      field.focus({ preventScroll:true });
    }catch{
      try{ field.focus(); }catch{}
    }

    try{ field.setSelectionRange(startIndex, startIndex); }catch{}
  }

  function advanceCursor(index, textLength){
    if(!textLength) return 0;
    return State.loopText ? (index + 1) % textLength : Math.min(index + 1, textLength - 1);
  }

  function setTextCursorFromField(){
    const field = $('#text');
    const text = getDrawableText();
    if(!field || !text.length){
      State.textCursorIndex = 0;
      State.wordCursorIndex = 0;
      return;
    }
    const cursor = typeof field.selectionStart === 'number' ? field.selectionStart : 0;
    State.textCursorIndex = clampTextCursor(cursor, text);
    syncWordCursorFromText(text);
  }


  // Z/Color
  function zWave(t){ return 0.5 + 0.5*Math.sin(State.zFx.freq*t + State.zFx.phase); }
  const computeSize = z=> lerp(State.font.sizeMin, State.font.sizeMax, z);
  function computeColor(z){
    const base = mixHex(State.color.a, State.color.b, z);
    const shaded = shadeHex(base, (z-0.5)*2*State.color.shade3d);
    return shaded;
  }
  const jitter = (val,pct)=> val + (Math.random()*2-1) * (Math.abs(val)*pct/100);
  // ====== Dinámico (efectos + 3D) ======
const Anim = { playing:false, start:0, last:0, raf:0, order:[], camStartRot:null, camStartTime:0 };

function updateAutoCamUI(){
  const inverseWrap = $('#camInverseWrap');
  if(inverseWrap) inverseWrap.hidden = !State.view.autoCam;
}

function applyAutoCameraAtTime(tSec){
  if(!State.view.autoCam) return;

  const startRot = Anim.camStartRot || { x:State.view.rot.x, y:State.view.rot.y, z:State.view.rot.z };
  const cycle = AUTO_CAM_CYCLE_SECONDS;
  const deltaX = (State.view.cam.velV || 0) * cycle;
  const deltaY = (State.view.cam.velH || 0) * cycle;
  const deltaZ = (State.view.cam.velR || 0) * cycle;

  if(State.view.cam.inverse){
    const progress = clamp(tSec / cycle, 0, 1);
    const factor = 0.5 * (1 + Math.cos(Math.PI * progress));
    State.view.rot.x = startRot.x + deltaX * factor;
    State.view.rot.y = startRot.y + deltaY * factor;
    State.view.rot.z = startRot.z + deltaZ * factor;
    return;
  }

  if(State.view.cam.returnHome){
    const progress = clamp(tSec / cycle, 0, 1);
    const factor = Math.sin(Math.PI * progress);
    State.view.rot.x = startRot.x + deltaX * factor;
    State.view.rot.y = startRot.y + deltaY * factor;
    State.view.rot.z = startRot.z + deltaZ * factor;
    return;
  }

  State.view.rot.x = startRot.x + (State.view.cam.velV || 0) * tSec;
  State.view.rot.y = startRot.y + (State.view.cam.velH || 0) * tSec;
  State.view.rot.z = startRot.z + (State.view.cam.velR || 0) * tSec;
}

function restoreAutoCameraStart(){
  if(!Anim.camStartRot) return;
  State.view.rot.x = Anim.camStartRot.x;
  State.view.rot.y = Anim.camStartRot.y;
  State.view.rot.z = Anim.camStartRot.z;
}

function restartAutoCameraPreview(){
  if(!Anim.playing || !State.view.autoCam) return;
  const now = performance.now();
  Anim.camStartRot = { x:State.view.rot.x, y:State.view.rot.y, z:State.view.rot.z };
  Anim.camStartTime = now;
  applyAutoCameraAtTime(0);
  syncViewRotationInputs();
  renderDynamicFrame(Math.max(0, (Anim.last - Anim.start)/1000));
}

function updateDynDuration(){
  if($('#dynDuration')) $('#dynDuration').textContent = tr('runtime.durationInfinity', {}, '∞');
}

function refreshEffectUI(){
  $$('.effect-group').forEach(el=> el.classList.remove('active'));
  if(State.dynamic.effect==='typewriter') $('#eg-typewriter')?.classList.add('active');
  if(State.dynamic.effect==='random')     $('#eg-random')?.classList.add('active');
  if(State.dynamic.effect==='wave')       $('#eg-wave')?.classList.add('active');
  if(State.view.mode==='3d') $('#eg-3d')?.classList.add('active');
}

function startAnim(){
  if(Anim.playing) return;
  Anim.playing=true;
  Anim.start=performance.now();
  Anim.last=Anim.start;
  Anim.camStartTime = Anim.start;
  Anim.camStartRot = { x:State.view.rot.x, y:State.view.rot.y, z:State.view.rot.z };
  // orden aleatoria si hace falta
  if(State.dynamic.effect==='random'){
    Anim.order = Array.from(State.stamps.keys());
    for(let i=Anim.order.length-1;i>0;i--){
      const j=(Math.random()*(i+1))|0; const t=Anim.order[i]; Anim.order[i]=Anim.order[j]; Anim.order[j]=t;
    }
  }else{
    Anim.order = [];
  }
  if(State.view.autoCam){
    applyAutoCameraAtTime(0);
    syncViewRotationInputs();
  }
  renderDynamicFrame(0);
  Anim.raf = requestAnimationFrame(tickAnim);
}
function stopAnim(){
  const shouldReturnToStart = !!(State.view.autoCam && State.view.cam.returnHome && Anim.camStartRot);

  Anim.playing=false;
  if(Anim.raf) cancelAnimationFrame(Anim.raf);

  if(shouldReturnToStart) restoreAutoCameraStart();
  syncViewRotationInputs();

  if(State.view.mode==='3d') draw3DStatic(); else clearCanvas(false);
}
function tickAnim(ts){
  Anim.last = ts;

  if(State.view.autoCam){
    const camElapsed = Math.max(0, (ts - (Anim.camStartTime || Anim.start))/1000);
    applyAutoCameraAtTime(camElapsed);
  }

  const t = (ts - Anim.start)/1000;
  renderDynamicFrame(t);
  if(Anim.playing) Anim.raf = requestAnimationFrame(tickAnim);
}

function renderDynamicFrame(tSec, snapshot=false){
  const ctx = Canvas.ctx; if(!ctx) return;
  const W = Canvas.el.width/Canvas.dpr, H = Canvas.el.height/Canvas.dpr;
  const cx=W/2, cy=H/2;

  clearCanvas(true);

  const N = State.stamps.length;
  let visibleIdxs = [];
  if(State.dynamic.effect==='typewriter'){
    const delay = State.dynamic.typewriter.delay/1000;
    let count = snapshot ? N : Math.max(0, Math.floor(tSec/delay));
    if(!snapshot && State.dynamic.typewriter.loop && N > 0){
      count = Math.floor((tSec / delay) % (N + 1));
    }
    for(let i=0;i<Math.min(N,count);i++) visibleIdxs.push(i);
  }else if(State.dynamic.effect==='random'){
    const delay = State.dynamic.random.delay/1000;
    const count = snapshot ? N : Math.max(0, Math.floor(tSec/delay));
    if(Anim.order.length!==N){ Anim.order = Array.from({length:N}, (_,i)=>i); }
    visibleIdxs = Anim.order.slice(0, Math.min(N,count));
  }else{
    visibleIdxs = Array.from({length:N}, (_,i)=>i);
  }

  const is3D = (State.view.mode==='3d');
  const rx = rad(State.view.rot.x||0), ry = rad(State.view.rot.y||0), rz = rad(State.view.rot.z||0);
  const depth = State.view.depth||300, camDist = (State.view.camDist||800);

  const list = [];
  for(const i of visibleIdxs){
    const s = State.stamps[i]; if(!s) continue;

    let px = s.x, py = s.y, pz = 0;

    if(State.dynamic.effect==='wave'){
      const amp = State.dynamic.wave.amp||0;
      const freq = State.dynamic.wave.freq||0;
      const speed = State.dynamic.wave.speed||0;
      py += amp * Math.sin(i*freq + tSec*speed);
    }

    // z por tamaño (capas)
    const span = Math.max(1, (State.font.sizeMax - State.font.sizeMin));
    const zn = (s.size - State.font.sizeMin)/span;
    pz = (zn - 0.5) * depth;

    let screenX=px, screenY=py, scale=1;
    if(is3D){
      let x = px - cx, y = py - cy, z = pz;

      let y1 = y*Math.cos(rx) - z*Math.sin(rx);
      let z1 = y*Math.sin(rx) + z*Math.cos(rx);
      y = y1; z = z1;

      let x2 = x*Math.cos(ry) + z*Math.sin(ry);
      let z2 = -x*Math.sin(ry) + z*Math.cos(ry);
      x = x2; z = z2;

      let x3 = x*Math.cos(rz) - y*Math.sin(rz);
      let y3 = x*Math.sin(rz) + y*Math.cos(rz);
      x = x3; y = y3;

      const f = camDist/(camDist - z);
      screenX = cx + x*f;
      screenY = cy + y*f;
      scale   = Math.max(0.1, f);
    }

    list.push({ i, x:screenX, y:screenY, size:s.size*scale, angle:s.angle, color:s.color, alpha:s.alpha, z:pz });
  }

  if(is3D) list.sort((a,b)=> a.z - b.z);

  for(const d of list){
    drawChar(State.stamps[d.i].ch, d.x, d.y, d.size, d.angle, d.color, d.alpha);
  }
}

function drawChar(ch,x,y,size,angle,color,alpha){
  const ctx=Canvas.ctx; if(!ctx) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x,y);
  ctx.rotate(angle);
  ctx.font = `${State.font.italic?'italic ':''}${State.font.weight} ${size}px ${State.font.family}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  if(State.font.letterSpacing===0) ctx.fillText(ch,0,0);
  else{
    const ls=State.font.letterSpacing, chars=ch.split(''); let xx=-((chars.length-1)*ls)/2;
    for(const c of chars){ ctx.fillText(c,xx,0); xx+=ls; }
  }
  ctx.restore();
}

function draw3DStatic(){ renderDynamicFrame(0, true); }

  // Historial
  function pushHistory(){ State.undoStack.push(JSON.stringify(State.stamps)); State.redoStack.length=0; }
  function undo(){ if(!State.undoStack.length) return; State.redoStack.push(JSON.stringify(State.stamps)); State.stamps=JSON.parse(State.undoStack.pop()); drawAll(); }
  function redo(){ if(!State.redoStack.length) return; State.undoStack.push(JSON.stringify(State.stamps)); State.stamps=JSON.parse(State.redoStack.pop()); drawAll(); }

  // Dibujo libre
  let drawing=false, lastPt=null, accDist=0, pathLen=0;
  let activePointerId=null, activePointerType='';
  let strokeText='', strokeEndIndex=0, strokeWordIndex=-1, strokeWordSegments=[], strokePlacedChars=0;

  function preventCanvasGesture(e){
    if(e?.cancelable) e.preventDefault();
  }

  function isActivePointerEvent(e){
    if(activePointerId == null) return true;
    if(e?.pointerId == null) return true;
    return e.pointerId === activePointerId;
  }

  function beginActivePointer(e){
    activePointerId = e?.pointerId ?? null;
    activePointerType = e?.pointerType || '';
    if(Canvas.el?.setPointerCapture && activePointerId != null){
      try{ Canvas.el.setPointerCapture(activePointerId); }catch{}
    }
  }

  function clearActivePointer(){
    if(Canvas.el?.releasePointerCapture && activePointerId != null){
      try{ Canvas.el.releasePointerCapture(activePointerId); }catch{}
    }
    activePointerId = null;
    activePointerType = '';
  }

  function beginFreeStroke(){
    const text = ensureTextCursorState();
    if(!text.length) return false;

    strokeText = text;
    strokePlacedChars = 0;

    if(State.drawByWord){
      strokeWordSegments = getWordSegments(text);
      if(!strokeWordSegments.length) return false;
      State.wordCursorIndex = clamp(State.wordCursorIndex || 0, 0, strokeWordSegments.length - 1);
      const word = strokeWordSegments[State.wordCursorIndex];
      State.textCursorIndex = word.start;
      strokeEndIndex = word.end;
      strokeWordIndex = State.wordCursorIndex;
    }else{
      strokeWordSegments = [];
      strokeEndIndex = text.length;
      strokeWordIndex = -1;
      State.textCursorIndex = clampTextCursor(State.textCursorIndex, text);
    }

    return true;
  }

  function finalizeFreeStroke(){
    if(State.drawByWord && strokeWordSegments.length){
      const lastIndex = strokeWordSegments.length - 1;
      const nextWord = State.loopText
        ? (strokeWordIndex + 1) % strokeWordSegments.length
        : Math.min(strokeWordIndex + 1, lastIndex);
      State.wordCursorIndex = nextWord;
      State.textCursorIndex = strokeWordSegments[nextWord]?.start ?? State.textCursorIndex;
    }else{
      syncWordCursorFromText(strokeText || getDrawableText());
    }

    strokeText = '';
    strokeEndIndex = 0;
    strokeWordIndex = -1;
    strokeWordSegments = [];
    strokePlacedChars = 0;
  }

  function getCharacterStep(){
    return Math.max(2, State.stamp.spacing + State.font.letterSpacing);
  }

  function placeAt(x,y,dirAngle){
    const text = strokeText || ensureTextCursorState();
    if(!text.length) return false;
    if(State.drawByWord && State.textCursorIndex >= strokeEndIndex) return false;

    State.textCursorIndex = clampTextCursor(State.textCursorIndex, text);
    const idx = State.textCursorIndex;
    const ch = text.charAt(idx) || '';
    if(!ch) return false;

    const z = zWave(pathLen*0.02);
    const size = jitter(computeSize(z), State.stamp.jitterSize);
    const angle = rad(State.stamp.baseAngle) + (State.autoOrient?dirAngle:0) + rad((Math.random()*2-1)*State.stamp.jitterAngle);
    const color = computeColor(z);
    const s = { ch, x, y, size, angle, color, alpha: State.color.alpha };
    State.stamps.push(s);
    drawStamp(s);

    State.textCursorIndex = advanceCursor(idx, text.length);
    strokePlacedChars += 1;
    return true;
  }

  function pointerDown(e){
    if(State.mode!=='free' || drawing) return;
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    preventCanvasGesture(e);
    if(!beginFreeStroke()) return;
    beginActivePointer(e);
    const r = Canvas.el.getBoundingClientRect();
    const x = (e.clientX - r.left), y = (e.clientY - r.top);
    drawing = true; lastPt = {x,y}; accDist = 0; pathLen=0;
    pushHistory();
    if(!placeAt(x,y,0)){
      drawing = false;
      finalizeFreeStroke();
      clearActivePointer();
    }
  }

  function pointerMove(e){
    if(!drawing || State.mode!=='free' || !isActivePointerEvent(e)) return;
    if(activePointerType === 'touch' || activePointerType === 'pen') preventCanvasGesture(e);
    const r = Canvas.el.getBoundingClientRect();
    const x = (e.clientX - r.left), y = (e.clientY - r.top);
    const dx = x-lastPt.x, dy = y-lastPt.y; const d = Math.hypot(dx,dy);
    const angle = Math.atan2(dy,dx);
    accDist += d; pathLen += d;
    const step = getCharacterStep();
    while(accDist >= step){
      const t = (accDist - step)/d;
      const px = x - dx*t, py = y - dy*t;
      if(!placeAt(px,py,angle)){
        drawing = false;
        break;
      }
      accDist -= step;
    }
    lastPt = {x,y};
  }

  function pointerUp(e){
    if(e && !isActivePointerEvent(e)) return;
    if(activePointerType === 'touch' || activePointerType === 'pen') preventCanvasGesture(e);
    if(drawing || strokePlacedChars){
      finalizeFreeStroke();
    }
    drawing=false; lastPt=null; accDist=0; pathLen=0;
    clearActivePointer();
  }

  // Figuras
  function generateShape(){
    const text = ensureTextCursorState();
    if(!text.length) return;

    pushHistory(); drawAll();
    const W=Canvas.el.width/Canvas.dpr, H=Canvas.el.height/Canvas.dpr, cx=W/2, cy=H/2;
    const S=State.shape, rot=rad(S.rotate), step=getCharacterStep();
    const pts=[]; const steps = Math.max(50, S.steps|0);
    const add=(x,y)=>pts.push({x,y});
    if(S.type==='circle'){
      const R=S.A; for(let i=0;i<=steps;i++){ const t=i/steps*2*Math.PI; let x=cx+R*Math.cos(t), y=cy+R*Math.sin(t);
        const xr=x-cx, yr=y-cy; const rx=xr*Math.cos(rot)-yr*Math.sin(rot), ry=xr*Math.sin(rot)+yr*Math.cos(rot); add(cx+rx,cy+ry); }
    }else if(S.type==='spiral'){
      const turns=Math.max(1,S.B|0), maxT=2*Math.PI*turns, k=S.A/(maxT||1);
      for(let i=0;i<=steps;i++){ const t=i/steps*maxT; const r=k*t; let x=cx+r*Math.cos(t), y=cy+r*Math.sin(t);
        const xr=x-cx, yr=y-cy; const rx=xr*Math.cos(rot)-yr*Math.sin(rot), ry=xr*Math.sin(rot)+yr*Math.cos(rot); add(cx+rx,cy+ry); }
    }else if(S.type==='rose'){
      const k=Math.max(1,S.B|0), a=S.A;
      for(let i=0;i<=steps;i++){ const t=i/steps*2*Math.PI; const r=a*Math.cos(k*t); let x=cx+r*Math.cos(t), y=cy+r*Math.sin(t);
        const xr=x-cx, yr=y-cy; const rx=xr*Math.cos(rot)-yr*Math.sin(rot), ry=xr*Math.sin(rot)+yr*Math.cos(rot); add(cx+rx,cy+ry); }
    }else if(S.type==='heart'){
      const s=S.A/20; for(let i=0;i<=steps;i++){ const t=i/steps*2*Math.PI;
        let x=cx + s*(16*Math.sin(t)**3), y=cy - s*(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t));
        const xr=x-cx, yr=y-cy; const rx=xr*Math.cos(rot)-yr*Math.sin(rot), ry=xr*Math.sin(rot)+yr*Math.cos(rot); add(cx+rx,cy+ry); }
    }else if(S.type==='polygon'){
      const sides=Math.max(3,S.B|0), R=S.A, ang=2*Math.PI/sides;
      for(let i=0;i<=sides;i++){ const t=i*ang; let x=cx+R*Math.cos(t), y=cy+R*Math.sin(t);
        const xr=x-cx, yr=y-cy; const rx=xr*Math.cos(rot)-yr*Math.sin(rot), ry=xr*Math.sin(rot)+yr*Math.cos(rot); add(cx+rx,cy+ry); }
    }else if(S.type==='lissajous'){
      const a=Math.max(1,S.B|0), b=Math.max(1,(S.B+1)|0), A=S.A, B=S.A*0.7;
      for(let i=0;i<=steps;i++){ const t=i/steps*2*Math.PI; let x=cx+A*Math.sin(a*t+rot), y=cy+B*Math.sin(b*t); add(x,y); }
    }
    let distAcc=0, tIdx=clampTextCursor(State.textCursorIndex, text), lenAcc=0;
    for(let i=1;i<pts.length;i++){
      const p0=pts[i-1], p1=pts[i], dx=p1.x-p0.x, dy=p1.y-p0.y, d=Math.hypot(dx,dy), angle=Math.atan2(dy,dx);
      distAcc+=d; lenAcc+=d; const stepLen=step;
      while(distAcc>=stepLen){
        const t=(distAcc-stepLen)/d, x=p1.x-dx*t, y=p1.y-dy*t;
        const z = zWave(lenAcc*0.02);
        const size = jitter(computeSize(z), State.stamp.jitterSize);
        const ang = rad(State.stamp.baseAngle) + (State.autoOrient?angle:0) + rad((Math.random()*2-1)*State.stamp.jitterAngle);
        const ch = text.charAt(tIdx) || ''; if(!ch) break;
        const s={ ch, x, y, size, angle:ang, color:computeColor(z), alpha:State.color.alpha };
        State.stamps.push(s); drawStamp(s);
        tIdx = advanceCursor(tIdx, text.length);
        distAcc-=stepLen;
      }
    }
    State.textCursorIndex = tIdx;
    syncWordCursorFromText(text);
  }

  // Fórmulas
  function buildSafe(expr){
    const SAFE = ['sin','cos','tan','asin','acos','atan','sqrt','abs','log','exp','pow','sign','min','max'];
    const expression = String(expr ?? '').trim();
    if(!expression) throw new Error('Empty formula expression');
    const wrap = `const {${SAFE.join(',')}} = Math; const PI=Math.PI, E=Math.E; return (${expression});`;
    return new Function('t', wrap);
  }
  function generateFormula(){
    const text = ensureTextCursorState();
    if(!text.length) return;

    pushHistory(); drawAll();
    const W=Canvas.el.width/Canvas.dpr, H=Canvas.el.height/Canvas.dpr, cx=W/2, cy=H/2;
    const F=State.formula; let fx,fy,fz;
    try{ fx=buildSafe(F.fx); fy=buildSafe(F.fy); fz=F.fz?.trim()?buildSafe(F.fz):(t)=>0.5; }
    catch(error){
      console.error('Formula parse error:', error);
      alert(tr('messages.formulaError', {}, 'Error en fórmulas'));
      return;
    }
    const steps=Math.max(50,F.steps|0); let pts=[], minx=Infinity,miny=Infinity,maxx=-Infinity,maxy=-Infinity;
    for(let i=0;i<=steps;i++){
      const t = F.tMin + (F.tMax-F.tMin)*i/steps;
      let x=fx(t), y=fy(t); if(!isFinite(x)||!isFinite(y)) continue;
      pts.push({t,x,y}); if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y;
    }
    if(pts.length<2){ alert(tr('messages.tooFewPoints', {}, 'Muy pocos puntos válidos')); return; }
    let scale=1; if(F.autoScale){ const w=(maxx-minx)||1, h=(maxy-miny)||1; scale = Math.min((W*0.85)/w, (H*0.85)/h); }
    let distAcc=0, idx=clampTextCursor(State.textCursorIndex, text), lenAcc=0; const spacing=getCharacterStep();
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1], b=pts[i];
      const x0=cx + (a.x - (minx+maxx)/2)*scale, y0=cy + (a.y - (miny+maxy)/2)*scale;
      const x1=cx + (b.x - (minx+maxx)/2)*scale, y1=cy + (b.y - (miny+maxy)/2)*scale;
      const dx=x1-x0, dy=y1-y0, d=Math.hypot(dx,dy), angle=Math.atan2(dy,dx);
      distAcc+=d; lenAcc+=d;
      while(distAcc>=spacing){
        const t=(distAcc-spacing)/d, x=x1-dx*t, y=y1-dy*t;
        const z = clamp(fz(a.t + (b.t-a.t)*(1-t)), 0, 1);
        const size=jitter(computeSize(z),State.stamp.jitterSize);
        const ang = rad(State.stamp.baseAngle) + (State.autoOrient?angle:0) + rad((Math.random()*2-1)*State.stamp.jitterAngle);
        const ch=text.charAt(idx)||''; if(!ch) break;
        const s={ ch,x,y,size,angle:ang,color:computeColor(z),alpha:State.color.alpha };
        State.stamps.push(s); drawStamp(s);
        idx = advanceCursor(idx, text.length);
        distAcc-=spacing;
      }
    }
    State.textCursorIndex = idx;
    syncWordCursorFromText(text);
  }

  // ====== Panel layout / tabs ======
  const PANEL_PREFS_KEY = 'calyPanelsVisibilityV2';
  const INSPECTOR_TAB_KEY = 'calyInspectorTab';
  const InspectorTabs = { active:'text', activate:()=>{} };

  function savePanelPrefs(){
    const data = {
      general: $('#toggleGeneral')?.checked ?? true,
      dynamic: $('#toggleDynamic')?.checked ?? true,
      inspector: $('#toggleInspector')?.checked ?? true
    };
    try{ localStorage.setItem(PANEL_PREFS_KEY, JSON.stringify(data)); }catch{}
  }

  function restorePanelPrefs(){
    try{
      const raw = localStorage.getItem(PANEL_PREFS_KEY);
      if(!raw) return false;
      const data = JSON.parse(raw);
      if(typeof data.general === 'boolean' && $('#toggleGeneral')) $('#toggleGeneral').checked = data.general;
      if(typeof data.dynamic === 'boolean' && $('#toggleDynamic')) $('#toggleDynamic').checked = data.dynamic;
      if(typeof data.inspector === 'boolean' && $('#toggleInspector')) $('#toggleInspector').checked = data.inspector;
      return true;
    }catch{
      return false;
    }
  }

  function setPanelVisible(panel, visible){
    if(!panel) return;
    panel.style.display = visible ? '' : 'none';
    panel.hidden = !visible;
    panel.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function refreshStudioLayout(){
    const layout = $('#studioLayout');
    const leftSidebar = $('#leftSidebar');
    const rightSidebar = $('#rightSidebar');
    if(!layout) return;

    const leftVisible = [$('#panelGeneral'), $('#panelDynamic')].some(panel => panel && panel.style.display !== 'none');
    const rightVisible = !!($('#panelInspector') && $('#panelInspector').style.display !== 'none');

    leftSidebar?.toggleAttribute('hidden', !leftVisible);
    rightSidebar?.toggleAttribute('hidden', !rightVisible);

    layout.classList.toggle('no-left', !leftVisible);
    layout.classList.toggle('no-right', !rightVisible);
    layout.classList.toggle('only-canvas', !leftVisible && !rightVisible);

    requestAnimationFrame(()=>{
      setShellMetrics();
      if(Canvas.el && Canvas.fitOnResize){
        fitCanvas();
      }
      drawAll();
    });
  }

  function initInspectorTabs(){
    const buttons = $$('.panel-tab[data-tab]');
    const panes = $$('.tab-pane[data-pane]');
    if(!buttons.length || !panes.length) return;

    const activate = (name, persist=true)=>{
      InspectorTabs.active = name;
      buttons.forEach(button=>{
        const active = button.dataset.tab === name;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.tabIndex = active ? 0 : -1;
      });
      panes.forEach(pane=>{
        const active = pane.dataset.pane === name;
        pane.hidden = !active;
        pane.classList.toggle('is-active', active);
      });
      if(persist){
        try{ localStorage.setItem(INSPECTOR_TAB_KEY, name); }catch{}
      }
    };

    buttons.forEach((button, index)=>{
      button.addEventListener('click', ()=> activate(button.dataset.tab));
      button.addEventListener('keydown', (e)=>{
        if(e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const nextIndex = e.key === 'ArrowRight'
          ? (index + 1) % buttons.length
          : (index - 1 + buttons.length) % buttons.length;
        buttons[nextIndex].focus();
        activate(buttons[nextIndex].dataset.tab);
      });
    });

    InspectorTabs.activate = activate;
    let start = 'text';
    try{
      const stored = localStorage.getItem(INSPECTOR_TAB_KEY);
      if(stored && buttons.some(button => button.dataset.tab === stored)) start = stored;
    }catch{}
    activate(start, false);
  }

  // ====== UI ======
  function syncUI(){
    ensureStateShape();

    // Modo
    $('#mode').value = State.mode;

    // Texto / Tipografía
    $('#text').value = State.text;
    $('#loopText').checked = State.loopText;
    $('#autoOrient').checked = State.autoOrient;
    $('#byWord').checked = State.drawByWord;

    $('#fontFamily').value = State.font.family;
    $('#fontWeight').value = State.font.weight;
    $('#italic').checked = State.font.italic;
    $('#letterSpacing').value = State.font.letterSpacing;
    $('#sizeMin').value = State.font.sizeMin;
    $('#sizeMax').value = State.font.sizeMax;

    // Visual
    $('#colorA').value = State.color.a;
    $('#colorB').value = State.color.b;
    $('#alpha').value  = State.color.alpha;
    $('#shade3d').value= State.color.shade3d;
    $('#zFreq').value  = State.zFx.freq;
    if($('#zPhase')) $('#zPhase').value = State.zFx.phase;

    $('#spacing').value = State.stamp.spacing;
    $('#baseAngle').value = State.stamp.baseAngle;
    $('#jitterSize').value = State.stamp.jitterSize;
    $('#jitterAngle').value = State.stamp.jitterAngle;

    // Figura
    $('#shape').value = State.shape.type;
    $('#pA').value = State.shape.A;
    $('#pB').value = State.shape.B;
    $('#pSteps').value = State.shape.steps;
    $('#pRotate').value = State.shape.rotate;

    // Fórmula
    $('#fx').value = State.formula.fx;
    $('#fy').value = State.formula.fy;
    $('#fz').value = State.formula.fz;
    $('#tMin').value = State.formula.tMin;
    $('#tMax').value = State.formula.tMax;
    $('#tSteps').value = State.formula.steps;
    $('#autoScale').checked = State.formula.autoScale;

    // Canvas flags
    $('#showGrid').checked = Canvas.showGrid;
    $('#darkBG').checked = Canvas.bgDark;
    $('#fitOnResize').checked = Canvas.fitOnResize;
    $('#themeSelect').value = localStorage.getItem('calyTheme') || 'original';
    $('#languageSelect').value = window.I18N?.requestedLanguage || localStorage.getItem('calyLanguage') || 'es';

    // Dinámico / Vista
    $('#dynEffect').value = State.dynamic.effect;
    $('#twDelay').value = State.dynamic.typewriter.delay;
    $('#twLoop').checked = State.dynamic.typewriter.loop;
    $('#randDelay').value = State.dynamic.random.delay;
    $('#waveAmp').value = State.dynamic.wave.amp;
    $('#waveFreq').value = State.dynamic.wave.freq;
    $('#waveSpeed').value = State.dynamic.wave.speed;

    $('#viewMode').value = State.view.mode;
    $('#rotX').value = State.view.rot.x;
    $('#rotY').value = State.view.rot.y;
    $('#rotZ').value = State.view.rot.z;
    $('#depth').value = State.view.depth;
    $('#autoCam').checked = State.view.autoCam;
    $('#camReturnHome').checked = State.view.cam.returnHome;
    $('#camInverse').checked = State.view.cam.inverse;
    $('#velH').value = State.view.cam.velH;
    $('#velV').value = State.view.cam.velV;
    $('#velR').value = State.view.cam.velR;

    refreshEffectUI();
    updateAutoCamUI();
    updateDynDuration();
    updateClipExportUI();
    updateDynamicMediaUI();
    updateInstallButtonUI();
  }

  function bindUI(){
    on('#themeSelect','change',(e)=>{ applyTheme(e.target.value); });
    on('#languageSelect','change',(e)=>{ void applyLanguage(e.target.value); });

    initInspectorTabs();

    function bindPanelToggle(toggleSelector, panelSelector){
      const toggle = $(toggleSelector);
      const panel = $(panelSelector);
      if(!toggle || !panel) return;
      const closeBtn = panel.querySelector(`[data-close="${panelSelector}"]`);
      const sync = (persist=true)=>{
        setPanelVisible(panel, !!toggle.checked);
        refreshStudioLayout();
        if(persist) savePanelPrefs();
      };
      toggle.addEventListener('change', ()=> sync(true));
      closeBtn?.addEventListener('click', ()=>{
        toggle.checked = false;
        sync(true);
      });
      sync(false);
    }

    bindPanelToggle('#toggleGeneral','#panelGeneral');
    bindPanelToggle('#toggleDynamic','#panelDynamic');
    bindPanelToggle('#toggleInspector','#panelInspector');

    // Modo
    on('#mode','change',(e)=>{
      State.mode = e.target.value;
      if(State.mode === 'shape') InspectorTabs.activate('figure');
      else if(State.mode === 'formula') InspectorTabs.activate('formula');
      else InspectorTabs.activate('text');
      syncUI();
    });

    // Texto
    on('#text','input',(e)=>{ State.text = e.target.value || ''; ensureTextCursorState(); });
    on('#btnTextStart','click',()=>{ resetTextCursorToStart(true); });
    on('#loopText','change',(e)=>{ State.loopText = e.target.checked; });
    on('#autoOrient','change',(e)=>{ State.autoOrient = e.target.checked; });
    on('#byWord','change',(e)=>{ State.drawByWord = e.target.checked; ensureTextCursorState(); });

    // Tipografía
    on('#fontFamily','change',(e)=>{ State.font.family=e.target.value; });
    on('#fontWeight','change',(e)=>{ State.font.weight=parseInt(e.target.value,10)||700; });
    on('#italic','change',(e)=>{ State.font.italic=!!e.target.checked; });
    const updateLetterSpacing = (value)=>{ State.font.letterSpacing=parseFloat(value)||0; drawAll(); };
    on('#letterSpacing','input',(e)=>{ updateLetterSpacing(e.target.value); });
    on('#letterSpacing','change',(e)=>{ updateLetterSpacing(e.target.value); });
    on('#sizeMin','change',(e)=>{ State.font.sizeMin=clamp(parseInt(e.target.value,10)||14, 6, 1000); });
    on('#sizeMax','change',(e)=>{ State.font.sizeMax=clamp(parseInt(e.target.value,10)||44, 6, 2000); });

    // Visual
    on('#colorA','change',(e)=>{ State.color.a=e.target.value; });
    on('#colorB','change',(e)=>{ State.color.b=e.target.value; });
    on('#alpha','change',(e)=>{ State.color.alpha=parseFloat(e.target.value)||1; });
    on('#shade3d','change',(e)=>{ State.color.shade3d=parseFloat(e.target.value)||0; });
    on('#zFreq','change',(e)=>{ State.zFx.freq=parseFloat(e.target.value)||0; });
    on('#zPhase','change',(e)=>{ State.zFx.phase=parseFloat(e.target.value)||0; });

    const updateStampSpacing = (value)=>{ State.stamp.spacing=parseInt(value,10)||12; };
    on('#spacing','input',(e)=>{ updateStampSpacing(e.target.value); });
    on('#spacing','change',(e)=>{ updateStampSpacing(e.target.value); });
    on('#baseAngle','change',(e)=>{ State.stamp.baseAngle=parseFloat(e.target.value)||0; });
    on('#jitterSize','change',(e)=>{ State.stamp.jitterSize=parseFloat(e.target.value)||0; });
    on('#jitterAngle','change',(e)=>{ State.stamp.jitterAngle=parseFloat(e.target.value)||0; });

    // Figura
    on('#shape','change',(e)=>{ State.shape.type=e.target.value; });
    on('#pA','change',(e)=>{ State.shape.A=parseFloat(e.target.value)||120; });
    on('#pB','change',(e)=>{ State.shape.B=parseFloat(e.target.value)||5; });
    on('#pSteps','change',(e)=>{ State.shape.steps=parseInt(e.target.value,10)||1200; });
    on('#pRotate','change',(e)=>{ State.shape.rotate=parseFloat(e.target.value)||0; });
    on('#btnGenShape','click',generateShape);

    // Fórmulas
    on('#fx','input',(e)=>{ State.formula.fx=e.target.value; });
    on('#fy','input',(e)=>{ State.formula.fy=e.target.value; });
    on('#fz','input',(e)=>{ State.formula.fz=e.target.value; });
    on('#tMin','change',(e)=>{ State.formula.tMin=parseFloat(e.target.value)||0; });
    on('#tMax','change',(e)=>{ State.formula.tMax=parseFloat(e.target.value)||Math.PI*2; });
    on('#tSteps','change',(e)=>{ State.formula.steps=parseInt(e.target.value,10)||1600; });
    on('#autoScale','change',(e)=>{ State.formula.autoScale=e.target.checked; });
    on('#btnGenFormula','click',generateFormula);

    // Canvas flags
    on('#showGrid','change',(e)=>{ Canvas.showGrid=e.target.checked; drawAll(); });
    on('#darkBG','change',(e)=>{ Canvas.bgDark=e.target.checked; drawAll(); });
    on('#fitOnResize','change',(e)=>{ Canvas.fitOnResize=e.target.checked; refreshStudioLayout(); });

    // General actions
    on('#btnClear','click',()=>{ pushHistory(); State.stamps.length=0; drawAll(); });
    on('#btnUndo','click',undo);
    on('#btnRedo','click',redo);
    on('#btnExportPNG','click', exportPNG);
    on('#btnExportClip20s','click', openClipExportOverlay);
    on('#btnExportClipWebmOption','click', ()=>{ void exportClip20s('webm'); });
    on('#btnExportClipMp4Option','click', ()=>{ void exportClip20s('mp4'); });
    on('#btnCloseClipExport','click', closeClipExportOverlay);
    $('#clipExportOverlay')?.addEventListener('click', (e)=>{ if(e.target.id==='clipExportOverlay' && !ExportState.busy) closeClipExportOverlay(); });

    on('#btnSaveDesign','click',saveDesign);
    on('#btnLoadDesign','click',()=> $('#fileDesign').click());
    on('#fileDesign','change',(e)=>{ const f=e.target.files?.[0]; if(f) loadDesignFile(f); e.target.value=''; });

    on('#btnAddAudio','click', ()=> $('#audioFileInput').click());
    on('#audioFileInput','change', async (e)=>{
      const file = e.target.files?.[0];
      if(!file){
        e.target.value = '';
        return;
      }
      try{
        MediaState.uploadedBlob = file;
        MediaState.uploadedName = file.name;
      }catch(error){
        console.error(error);
        alert(tr('messages.audioFileError', {}, 'No se pudo cargar el archivo de audio.'));
      }
      e.target.value = '';
      updateDynamicMediaUI();
    });
    on('#btnRemoveAudio','click', clearUploadedAudio);
    on('#btnRecordMic','click', ()=>{ void toggleMicRecording(); });
    on('#btnRemoveRecordedAudio','click', clearRecordedAudio);

    // Dinámico
    on('#btnDynPlay','click', startAnim);
    on('#btnDynPause','click', stopAnim);

    on('#dynEffect','change', (e)=>{ State.dynamic.effect=e.target.value; refreshEffectUI(); updateDynDuration(); if(State.view.mode==='3d') draw3DStatic(); else drawAll(); });

    on('#twDelay','change', (e)=>{ State.dynamic.typewriter.delay = Math.max(1, parseInt(e.target.value,10)||60); updateDynDuration(); });
    on('#twLoop','change',  (e)=>{ State.dynamic.typewriter.loop = !!e.target.checked; });

    on('#randDelay','change', (e)=>{ State.dynamic.random.delay = Math.max(1, parseInt(e.target.value,10)||40); updateDynDuration(); });

    on('#waveAmp','change',  (e)=>{ State.dynamic.wave.amp  = parseFloat(e.target.value)||10; });
    on('#waveFreq','change', (e)=>{ State.dynamic.wave.freq = parseFloat(e.target.value)||0.25; });
    on('#waveSpeed','change',(e)=>{ State.dynamic.wave.speed= parseFloat(e.target.value)||2; });

    // Vista
    const refresh3DView = (resetAutoCam=false)=>{
      if(State.view.mode !== '3d'){
        if(!Anim.playing) clearCanvas(false);
        return;
      }
      if(resetAutoCam && Anim.playing && State.view.autoCam){
        restartAutoCameraPreview();
        return;
      }
      draw3DStatic();
    };

    on('#viewMode','change', (e)=>{
      State.view.mode = e.target.value;
      refreshEffectUI();
      updateAutoCamUI();
      if(State.view.mode==='3d'){
        if(Anim.playing && State.view.autoCam) restartAutoCameraPreview();
        else draw3DStatic();
      }else{
        clearCanvas(false);
      }
    });

    on('#rotX','change', (e)=>{ State.view.rot.x = parseFloat(e.target.value)||0; refresh3DView(true); });
    on('#rotY','change', (e)=>{ State.view.rot.y = parseFloat(e.target.value)||0; refresh3DView(true); });
    on('#rotZ','change', (e)=>{ State.view.rot.z = parseFloat(e.target.value)||0; refresh3DView(true); });
    on('#depth','change',(e)=>{ State.view.depth = parseFloat(e.target.value)||280; refresh3DView(false); });

    on('#autoCam','change', (e)=>{
      State.view.autoCam = !!e.target.checked;
      updateAutoCamUI();
      if(Anim.playing && State.view.mode==='3d' && State.view.autoCam) restartAutoCameraPreview();
    });
    on('#camReturnHome','change', (e)=>{
      State.view.cam.returnHome = !!e.target.checked;
      if(Anim.playing && State.view.mode==='3d' && State.view.autoCam) restartAutoCameraPreview();
    });
    on('#camInverse','change', (e)=>{
      State.view.cam.inverse = !!e.target.checked;
      if(Anim.playing && State.view.mode==='3d' && State.view.autoCam) restartAutoCameraPreview();
    });
    on('#velH','change', (e)=>{
      State.view.cam.velH = parseFloat(e.target.value)||0;
      if(Anim.playing && State.view.mode==='3d' && State.view.autoCam) restartAutoCameraPreview();
    });
    on('#velV','change', (e)=>{
      State.view.cam.velV = parseFloat(e.target.value)||0;
      if(Anim.playing && State.view.mode==='3d' && State.view.autoCam) restartAutoCameraPreview();
    });
    on('#velR','change', (e)=>{
      State.view.cam.velR = parseFloat(e.target.value)||0;
      if(Anim.playing && State.view.mode==='3d' && State.view.autoCam) restartAutoCameraPreview();
    });

    refreshEffectUI();
    updateAutoCamUI();
    updateDynDuration();

    // Canvas drawing
    const blockCanvasTouchScroll = (e)=> preventCanvasGesture(e);
    Canvas.el.addEventListener('pointerdown', pointerDown);
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerUp);
    Canvas.el.addEventListener('pointerleave', pointerUp);
    Canvas.el.addEventListener('pointercancel', pointerUp);
    Canvas.el.addEventListener('touchstart', blockCanvasTouchScroll, { passive:false });
    Canvas.el.addEventListener('touchmove', blockCanvasTouchScroll, { passive:false });
    Canvas.el.addEventListener('touchend', blockCanvasTouchScroll, { passive:false });
    Canvas.el.addEventListener('touchcancel', blockCanvasTouchScroll, { passive:false });

    // Atajos
    window.addEventListener('keydown',(e)=>{
      if(e.isComposing || isEditableTarget(e.target)) return;

      const key = String(e.key || '').toLowerCase();

      if((e.ctrlKey || e.metaKey) && key==='z' && !e.shiftKey){ e.preventDefault(); undo(); return; }
      if(((e.ctrlKey || e.metaKey) && key==='y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && key==='z')){ e.preventDefault(); redo(); return; }

      if(State.view.mode==='3d'){
        const step = 3;
        let used=false;
        if(e.key==='ArrowLeft'){ State.view.rot.y -= step; used=true; }
        if(e.key==='ArrowRight'){ State.view.rot.y += step; used=true; }
        if(e.key==='ArrowUp'){ State.view.rot.x -= step; used=true; }
        if(e.key==='ArrowDown'){ State.view.rot.x += step; used=true; }
        if(key==='q'){ State.view.rot.z -= step; used=true; }
        if(key==='e'){ State.view.rot.z += step; used=true; }
        if(used){
          e.preventDefault();
          syncViewRotationInputs();
          draw3DStatic();
        }
      }
    });

    // Resize
    window.addEventListener('resize', ()=>{
      refreshStudioLayout();
    });

    // Footer buttons, overlays e i18n runtime
    refreshLocalizedRuntime();

    on('#privacyLink','click', ()=> $('#privacyOverlay').style.display='flex');
    on('#btnClosePrivacy','click', ()=> $('#privacyOverlay').style.display='none');
    $('#privacyOverlay')?.addEventListener('click', (e)=>{ if(e.target.id==='privacyOverlay') $('#privacyOverlay').style.display='none'; });

    on('#coherenceLink','click', ()=> $('#coherenceOverlay').style.display='flex');
    on('#btnCloseCoherence','click', ()=> $('#coherenceOverlay').style.display='none');
    $('#coherenceOverlay')?.addEventListener('click', (e)=>{ if(e.target.id==='coherenceOverlay') $('#coherenceOverlay').style.display='none'; });

    on('#licenseLink','click', ()=> $('#licenseOverlay').style.display='flex');
    on('#btnCloseLicense','click', ()=> $('#licenseOverlay').style.display='none');
    on('#btnCopyLicense','click', async ()=>{
      try{
        await navigator.clipboard.writeText($('#licenseBody').textContent||'');
        alert(tr('messages.copied', {}, 'Copiado'));
      }catch{
        alert(tr('messages.copyError', {}, 'No se pudo copiar'));
      }
    });
    $('#licenseOverlay')?.addEventListener('click', (e)=>{ if(e.target.id==='licenseOverlay') $('#licenseOverlay').style.display='none'; });
  }

  // ====== SW ======
  function initSW(){
    if(!('serviceWorker' in navigator)) return;
    let newWorker; const toast=$('#sw-update-toast'), btnReload=$('#btn-sw-reload');
    const showReload=()=> toast.style.display='flex';
    btnReload?.addEventListener('click', ()=> newWorker?.postMessage({type:'SKIP_WAITING'}));
    navigator.serviceWorker.addEventListener('controllerchange', ()=> location.reload());
    window.addEventListener('load', async ()=>{
      try{
        const reg = await navigator.serviceWorker.register('./sw.js', { type:'classic' });
        if(reg.waiting){ newWorker=reg.waiting; showReload(); }
        reg.addEventListener('updatefound', ()=>{
          newWorker=reg.installing;
          newWorker?.addEventListener('statechange', ()=>{
            if(newWorker?.state==='installed' && navigator.serviceWorker.controller) showReload();
          });
        });
      }catch(e){ console.error(tr('messages.swError', {}, 'SW error'), e); }
    });
  }

  // ====== Boot ======
  async function boot(){
    renderTagline();
    initSettingsSheet();

    try{ localStorage.removeItem('calyPanelsPos'); }catch{}

    // 1) Primero canvas (para que drawAll tenga ctx)
    initCanvas();

    // 2) i18n + tema
    if(window.I18N?.init){
      try{
        await window.I18N.init({ language: localStorage.getItem('calyLanguage') || 'es' });
      }catch{}
    }else{
      await applyLanguage(localStorage.getItem('calyLanguage') || 'es');
    }

    ensureStateShape();
    applyLocalizedDefaults();
    ensureTextCursorState();
    applyTheme(localStorage.getItem('calyTheme') || 'original');

    // 3) Preferencias de paneles antes del bind
    restorePanelPrefs();

    // 4) Bind UI + sincroniza
    bindUI();
    initInstallPrompt();
    syncUI();
    refreshLocalizedRuntime();
    refreshStudioLayout();

    document.addEventListener('i18n:change', ()=>{
      syncUI();
      refreshLocalizedRuntime();
      renderTagline();
    });

    // 5) SW + footer year + métricas finales
    initSW();
    $('#f-year').textContent = new Date().getFullYear();
    setShellMetrics();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', ()=>{ void boot(); });
  else void boot();

})();
