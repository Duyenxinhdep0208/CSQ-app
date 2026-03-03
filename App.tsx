
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Keyframe, GenerationStatus, Task, OverlayConfig, EditState } from './types';
import Timeline from './components/Timeline';
import KeyframeList from './components/KeyframeList';
import MatrixView from './components/MatrixView';
import { loadData, saveData } from './services/storage';
import { GoogleGenAI, Modality } from "@google/genai";

const STORAGE_KEY = 'construction_sequence_pro_data';

const DEFAULT_CONFIG: OverlayConfig = {
  fontFamily: 'Inter, sans-serif',
  fontWeight: '900',
  primaryColor: '#2563eb',
  accentColor: '#1e3a8a',
  textColorPrimary: '#2563eb',
  textColorSecondary: '#64748b',
  monthActiveBg: '#e2dc8e',
  monthInactiveBg: '#f3d2d2',
  monthPastBg: '#b3b3b3',
  monthNextBg: '#73aef7',
  monthActiveScale: 1.15,
  monthInactiveScale: 0.9,
  monthActiveFontSize: 14,
  monthTextColor: '#f5f5f5',
  monthBorderRadius: 9,
  overlayOpacity: 0.95,
  fontSizeBase: 1.0,
  progressStrokeWidth: 14,
  timelineHeight: 0.1,
  timelineLabelShow: true,
  timelineLabelText: 'TIMELINE',
  timelineLabelColor: '#b7c6e6',
  timelineLabelFontSize: 12,
  timelineLabelX: 0.04,
  timelineLabelY: 0.24,
  timelineLabelFontFamily: 'Inter, sans-serif',
  timelineLabelFontWeight: '900',
  timelineProgressBarShow: false,
  timelineProgressBarColor: '#2563eb',
  timelineProgressBarHeight: 4,
  timelineProgressBarOpacity: 1.0,
  circleX: 0.07,
  circleY: 0.19,
  circleScale: 2.1,
  circleColor: '#d8556f',
  circleOpacity: 1.0,
  circleShowLabel: true,
  circleRectShow: false,
  circleRectColor: '#000000',
  circleRectOpacity: 0.59,
  circleRectWidth: 147,
  circleRectHeight: 500,
  circleRectBorderRadius: 4,
  circleRectX: 0.05,
  circleRectY: 0.47,
  circleLabelPosition: 'top',
  circleLabelDistance: 9,
  circleLabelColor: '#64748b',
  circleLabelFontFamily: 'Inter, sans-serif',
  circleLabelFontSize: 5,
  circleLabelLine1: 'PROJECT',
  circleLabelLine2: 'PROGRESS',
  timelineYearFontSize: 10,
  timelineYearColor: '#41599b',
  timelineYearFontWeight: '900',
  timelineMonthFontSize: 9,
  timelineMonthFontWeight: '900',
  timelineMonthOpacity: 1.0,
  timelineBgColor: '#ffffff',
  taskX: 0.04,
  taskY: 0.31,
  taskSpacingY: 0.15,
  taskPrimaryColor: '#ea580c',
  taskCircleBgColor: '#000000',
  taskCircleScale: 1.8,
  taskLabelBgColor: '#5c3a33',
  taskLabelBgOpacity: 0,
  taskLabelBorderShow: false,
  taskOpacity: 1.0,
  taskFontSize: 7,
  taskFontFamily: 'Inter, sans-serif',
  taskFontWeight: '900',
  taskLabelPosition: 'bottom',
  taskPercentFontSize: 10,
  narrationBarShow: true,
  narrationFontFamily: 'Inter, sans-serif',
  narrationFontSize: 10,
} as any;

const isSameMonth = (d1: Date, d2: Date) => d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();

// Polyfill for roundRect to ensure compatibility
const drawRoundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  if (typeof (ctx as any).roundRect === 'function') {
    ctx.beginPath();
    (ctx as any).roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

const AccordionItem: React.FC<{ title: string, isOpen: boolean, onToggle: () => void, children: React.ReactNode }> = ({ title, isOpen, onToggle, children }) => (
  <div className="border-b border-slate-100 last:border-0">
    <button 
      onClick={onToggle}
      className="w-full py-3.5 flex items-center justify-between text-left group hover:bg-slate-50 transition-colors px-4"
    >
      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-blue-600 transition-colors">{title}</span>
      <svg className={`w-3 h-3 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-blue-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7"/></svg>
    </button>
    <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[2500px] opacity-100 py-4 px-4 bg-slate-50/30' : 'max-h-0 opacity-0'}`}>
      {children}
    </div>
  </div>
);

type VoiceProvider = 'gemini' | 'google' | 'system' | 'custom';

// Minimum duration if no audio is present
const MIN_STAGE_DURATION = 3.0;

const App: React.FC = () => {
  const [projectStartDate, setProjectStartDate] = useState<Date>(new Date(2026, 0, 1));
  const [projectEndDate, setProjectEndDate] = useState<Date>(new Date(2027, 11, 31));
  const [keyframes, setKeyframes] = useState<Keyframe[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(new Date(2026, 0, 1));
  const [displayProgress, setDisplayProgress] = useState<number>(0);
  const [selectedKeyframeId, setSelectedKeyframeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'images' | 'tasks' | 'months' | 'design'>('images');
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>(DEFAULT_CONFIG);
  const [openDesignSection, setOpenDesignSection] = useState<string | null>('circle_rect');
  
  const [showWorkspaceTimeline, setShowWorkspaceTimeline] = useState(true);
  const [isExporting, setIsExporting] = useState(GenerationStatus.IDLE);
  const [statusMessage, setStatusMessage] = useState("");
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [outputExtension, setOutputExtension] = useState<string>("webm"); // Track file extension
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const stopPreviewRef = useRef(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [modalInputValue, setModalInputValue] = useState("");
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceIndex, setSelectedVoiceIndex] = useState<number>(0);
  
  // Voice Selection State
  const [voiceProvider, setVoiceProvider] = useState<VoiceProvider>('gemini'); // Default to Gemini
  const [googleLang, setGoogleLang] = useState<'vi' | 'en'>('vi');
  const [viewMode, setViewMode] = useState<'sequence' | 'matrix'>('sequence');

  const updateKeyframe = (id: string, updates: Partial<Keyframe>) => {
    setKeyframes(prev => prev.map(k => k.id === id ? { ...k, ...updates } : k));
  };
  
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

  // Performance Optimization: Sort keyframes once when they change
  const sortedKeyframes = useMemo(() => {
    return [...keyframes].sort((a, b) => {
      const aTime = a.startDate.getFullYear() * 12 + a.startDate.getMonth();
      const bTime = b.startDate.getFullYear() * 12 + b.startDate.getMonth();
      if (aTime !== bTime) return aTime - bTime;
      return keyframes.indexOf(a) - keyframes.indexOf(b);
    });
  }, [keyframes]);

  // Helper to get the definitive progress for a specific month
  const getProgressForMonth = useCallback((date: Date) => {
    const mKeyframes = sortedKeyframes.filter(k => isSameMonth(k.startDate, date));
    return mKeyframes.length > 0 ? Math.max(...mKeyframes.map(k => k.progress)) : 0;
  }, [sortedKeyframes]);

  // Helper to determine the best video MIME type (Prefer MP4)
  const getSupportedMimeType = () => {
    const types = [
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp9,opus',
      'video/webm'
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return { mime: type, ext: type.includes('mp4') ? 'mp4' : 'webm' };
      }
    }
    return { mime: 'video/webm', ext: 'webm' };
  };

  useEffect(() => {
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      const filtered = voices.filter(v => v.lang.includes('vi') || v.lang.includes('en'));
      setAvailableVoices(filtered.length > 0 ? filtered : voices);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const formatDateLabel = (d: Date) => `${d.getMonth() + 1}/${d.getFullYear()}`;
  const getMonthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}`;

  const getEffectiveNarration = useCallback((kf: Keyframe) => {
    if (!kf.usePreviousNarration) return kf.narration || kf.description;
    const idx = sortedKeyframes.findIndex(item => item.id === kf.id);
    if (idx > 0) return getEffectiveNarration(sortedKeyframes[idx - 1]);
    return kf.narration || kf.description;
  }, [sortedKeyframes]);

  const playAudioForPreview = (kf: Keyframe, narration: string): Promise<void> => {
      return new Promise((resolve) => {
          if (kf.audioData) {
              const audio = new Audio(kf.audioData);
              audio.onended = () => resolve();
              audio.onerror = () => resolve();
              audio.play().catch(() => resolve());
              return;
          }

          if (!narration) { resolve(); return; }
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(narration);
          if (availableVoices[selectedVoiceIndex]) {
            utterance.voice = availableVoices[selectedVoiceIndex];
          }
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          utterance.onend = () => resolve();
          utterance.onerror = () => resolve();
          window.speechSynthesis.speak(utterance);
      });
  };

  // --- NEW: CALCULATION LOGIC FOR SMOOTH DISTRIBUTION ---
  const calculateInterpolationMap = (items: Keyframe[]) => {
      const targets = new Map<string, { start: number, end: number }>();
      
      // 1. Group strictly by Month Key
      const groupedByMonth = new Map<string, Keyframe[]>();
      items.forEach(k => {
          const key = `${k.startDate.getFullYear()}-${k.startDate.getMonth()}`;
          if (!groupedByMonth.has(key)) groupedByMonth.set(key, []);
          groupedByMonth.get(key)!.push(k);
      });

      // 2. Sort keys to iterate chronologically
      const sortedKeys = Array.from(groupedByMonth.keys()).sort((a, b) => {
          const [yA, mA] = a.split('-').map(Number);
          const [yB, mB] = b.split('-').map(Number);
          return yA !== yB ? yA - yB : mA - mB;
      });

      let runningProgress = 0;

      // 3. Daisy-chain progress within each month
      sortedKeys.forEach(key => {
          const group = groupedByMonth.get(key)!;
          const monthStart = runningProgress;
          // The target for this month is the MAX progress set for any item in it
          const monthEnd = Math.max(...group.map(k => k.progress));
          
          // Even distribution delta
          const totalDelta = Math.max(0, monthEnd - monthStart);
          const deltaPerFrame = totalDelta / group.length;

          group.forEach((kf, index) => {
              const s = monthStart + (index * deltaPerFrame);
              const e = monthStart + ((index + 1) * deltaPerFrame);
              targets.set(kf.id, { start: s, end: e });
          });

          runningProgress = monthEnd;
      });

      return targets;
  };

  const interpolationMap = useMemo(() => calculateInterpolationMap(sortedKeyframes), [sortedKeyframes]);

  const handlePreview = async () => {
    if (isPreviewing || isPreparingPreview) {
      stopPreviewRef.current = true;
      window.speechSynthesis.cancel();
      setIsPreviewing(false);
      setIsPreparingPreview(false);
      return;
    }
    if (keyframes.length === 0) { alert("Vui lòng thêm Stage trước."); return; }
    setIsPreparingPreview(true);
    stopPreviewRef.current = false;
    
    // Calculate targets using the new robust method
    const kfTargets = interpolationMap;

    // Build preview blocks based on narration continuity
    const blocks: { narration: string, audioData?: string, stages: Keyframe[] }[] = [];
    
    sortedKeyframes.forEach(kf => {
      const currentNarration = getEffectiveNarration(kf);
      if (blocks.length === 0 || !kf.usePreviousNarration || kf.audioData) {
         blocks.push({ 
             narration: currentNarration, 
             audioData: kf.audioData, 
             stages: [kf] 
         });
      } else {
         blocks[blocks.length - 1].stages.push(kf);
      }
    });

    setIsPreparingPreview(false);
    setIsPreviewing(true);
    
    for (let i = 0; i < blocks.length; i++) {
      if (stopPreviewRef.current) break;
      const block = blocks[i];
      
      const audioPromise = playAudioForPreview(block.stages[0], block.narration);
      const stageDuration = MIN_STAGE_DURATION; 

      for (const kf of block.stages) {
        if (stopPreviewRef.current) break;
        setSelectedKeyframeId(kf.id);
        setCurrentDate(new Date(kf.startDate)); 
        
        const startTime = Date.now();
        const targets = kfTargets.get(kf.id) || { start: 0, end: 0 };
        const startVal = targets.start;
        const endVal = targets.end;
        
        while (Date.now() - startTime < stageDuration * 1000) {
          if (stopPreviewRef.current) break;
          const elapsed = (Date.now() - startTime) / (stageDuration * 1000);
          setDisplayProgress(startVal + (endVal - startVal) * elapsed);
          await new Promise(r => requestAnimationFrame(r));
        }
        setDisplayProgress(endVal);
      }
      await audioPromise;
    }
    setIsPreviewing(false);
    stopPreviewRef.current = false;
    if (sortedKeyframes.length > 0) {
        setSelectedKeyframeId(sortedKeyframes[0].id);
        setCurrentDate(sortedKeyframes[0].startDate);
        setDisplayProgress(getProgressForMonth(sortedKeyframes[0].startDate));
    }
  };

  const handleBulkUploadReal = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.multiple = true;
    input.onchange = async (e: any) => {
      const files: File[] = Array.from(e.target.files);
      if (files.length === 0) return;

      // Sort files by name to ensure chronological order if named sequentially
      files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

      const newKeyframes: Keyframe[] = [];
      // Determine starting date: either after the last existing keyframe or project start
      let lastDate = sortedKeyframes.length > 0 
        ? new Date(sortedKeyframes[sortedKeyframes.length-1].endDate) 
        : new Date(projectStartDate);

      for (const file of files) {
        // Read file to base64
        const reader = new FileReader();
        const promise = new Promise<string>((resolve) => { 
            reader.onload = (re) => resolve(re.target?.result as string); 
        });
        reader.readAsDataURL(file);
        const base64 = await promise;

        // Calculate dates
        // If this is the very first keyframe being added and no keyframes exist, start at projectStartDate
        // Otherwise, start where the last one ended (or increment month)
        const stageStart = new Date(lastDate);
        
        // Default duration: 1 month
        const stageEnd = new Date(stageStart); 
        stageEnd.setMonth(stageEnd.getMonth() + 1);

        // Use filename (without extension) as subtitle
        const fileName = file.name.replace(/\.[^/.]+$/, "");

        const id = Math.random().toString(36).substring(2, 11);
        
        newKeyframes.push({
          id, 
          image: base64, 
          startDate: stageStart, 
          endDate: stageEnd,
          progress: Math.min(100, (keyframes.length + newKeyframes.length + 1) * 5),
          subtitle: fileName, // Use filename as subtitle
          description: "Cập nhật tiến độ dự án.", 
          narration: "Cập nhật tiến độ dự án.", 
          usePreviousNarration: false
        });
        
        // Update lastDate for the next iteration
        lastDate = new Date(stageEnd);
      }
      
      setKeyframes(prev => [...prev, ...newKeyframes]);
    };
    input.click();
  }, [keyframes, projectStartDate, sortedKeyframes]);

  const handleAddTask = () => {
    const newTask: Task = {
      id: Math.random().toString(36).substring(2, 11),
      name: "TÊN CÔNG VIỆC MỚI",
      startDate: new Date(projectStartDate),
      endDate: new Date(projectEndDate),
      x: 0, y: 0, visible: true, history: []
    };
    setTasks(prev => [...prev, newTask]);
    setActiveTab('tasks');
  };

  const handleRemoveTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const projectMonths = useMemo(() => {
    const m = [];
    let iter = new Date(projectStartDate); iter.setDate(1);
    const end = new Date(projectEndDate);
    while (iter <= end) {
      m.push(new Date(iter));
      iter.setMonth(iter.getMonth() + 1);
    }
    return m;
  }, [projectStartDate, projectEndDate]);

  const projectYears = useMemo(() => {
    const years: { year: number, count: number }[] = [];
    projectMonths.forEach(m => {
      const y = m.getFullYear();
      const existing = years.find(item => item.year === y);
      if (existing) existing.count++;
      else years.push({ year: y, count: 1 });
    });
    return years;
  }, [projectMonths]);

  // CRITICAL FIX: CORS AND SECURITY FOR CANVAS EXPORT
  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous"; // Essential for captureStream
        img.src = src;
        img.onload = () => resolve(img);
        img.onerror = (e) => {
            console.error("Image load failed", e);
            // Fallback: Try loading without crossOrigin if it fails (sometimes base64 works better without it)
            if (src.startsWith('data:')) {
                const retryImg = new Image();
                retryImg.src = src;
                retryImg.onload = () => resolve(retryImg);
                retryImg.onerror = reject;
            } else {
                resolve(img); // Resolve anyway to avoid hard crash during export loop
            }
        };
    });
  };

  // --------------------------------------------------------------------------------
  // CORE EXPORT LOGIC - REFACTORED FOR PERFECT SYNC AND SMOOTH INTERPOLATION
  // --------------------------------------------------------------------------------
  const handleExport = async () => {
    if (keyframes.length === 0) { alert("Vui lòng thêm Stage trước."); return; }
    
    setIsExporting(GenerationStatus.GENERATING);
    setStatusMessage("Initialization...");
    
    await new Promise(r => setTimeout(r, 200));

    const canvas = exportCanvasRef.current;
    if (!canvas) { setIsExporting(GenerationStatus.IDLE); return; }

    const width = 1920; const height = 1080; // UPGRADED TO 1080p
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;
    
    // --- PHASE 1: AUDIO DECODING & DURATION CALCULATION ---
    const sampleRate = 44100;
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });
    await audioCtx.resume();
    
    let ai: GoogleGenAI | null = null;
    if (voiceProvider === 'gemini') {
        ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }

    // Metadata Array: Stores exact timing for every stage
    const stageMetadata: {
        kf: Keyframe;
        audioBuffer: AudioBuffer | null;
        duration: number;
        startTime: number;
    }[] = [];

    let currentTimelineTime = 0;

    // Loop through all stages to calculate exact durations first
    for (let i = 0; i < sortedKeyframes.length; i++) {
        const kf = sortedKeyframes[i];
        
        let narration = "";
        let audioBuffer: AudioBuffer | null = null;
        
        const shouldGenerateAudio = !kf.usePreviousNarration || kf.audioData;
        narration = getEffectiveNarration(kf);

        if (shouldGenerateAudio) {
             try {
                if (kf.audioData) {
                    setStatusMessage(`Analyzing Audio Stage ${i+1}/${sortedKeyframes.length}...`);
                    const response = await fetch(kf.audioData);
                    const arrayBuffer = await response.arrayBuffer();
                    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
                } 
                else if (voiceProvider === 'gemini' && ai && narration.trim()) {
                    setStatusMessage(`Generating AI Voice Stage ${i+1}/${sortedKeyframes.length}...`);
                    const response = await ai.models.generateContent({
                        model: "gemini-2.5-flash-preview-tts",
                        contents: [{ parts: [{ text: narration }] }],
                        config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
                    });
                    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
                    if (base64Audio) {
                        const binaryString = atob(base64Audio);
                        const bytes = new Uint8Array(binaryString.length);
                        for (let k = 0; k < binaryString.length; k++) bytes[k] = binaryString.charCodeAt(k);
                        
                        try {
                            audioBuffer = await audioCtx.decodeAudioData(bytes.buffer.slice(0)); 
                        } catch (e) {
                            // Fallback manual decode if needed (assume 24khz from Gemini)
                            const dataInt16 = new Int16Array(bytes.buffer);
                            audioBuffer = audioCtx.createBuffer(1, dataInt16.length, 24000);
                            const cd = audioBuffer.getChannelData(0);
                            for(let k=0; k<dataInt16.length; k++) cd[k] = dataInt16[k] / 32768.0;
                        }
                    }
                } 
                else if (voiceProvider === 'google' && narration.trim()) {
                    setStatusMessage(`Fetching TTS Stage ${i+1}...`);
                    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&q=${encodeURIComponent(narration)}&tl=${googleLang}`;
                    const res = await fetch(url);
                    if (res.ok) audioBuffer = await audioCtx.decodeAudioData(await res.arrayBuffer());
                }
            } catch (e) {
                console.error("Audio error skipped for stage", i, e);
            }
        }

        // DYNAMIC DURATION LOGIC:
        const stageDuration = audioBuffer ? Math.max(MIN_STAGE_DURATION, audioBuffer.duration) : MIN_STAGE_DURATION;
        
        stageMetadata.push({
            kf,
            audioBuffer,
            duration: stageDuration,
            startTime: currentTimelineTime
        });

        currentTimelineTime += stageDuration;
    }

    const totalDuration = currentTimelineTime;
    const INTRO_DURATION = 1.5; // 1.5s Intro for Fly In

    // --- PHASE 2: MIX MASTER AUDIO TRACK ---
    setStatusMessage("Mastering Audio Track...");
    // Create one big buffer for the whole video (including Intro)
    const masterBuffer = audioCtx.createBuffer(1, Math.ceil(sampleRate * (totalDuration + INTRO_DURATION)) + sampleRate, sampleRate); 
    const channelData = masterBuffer.getChannelData(0);

    stageMetadata.forEach(meta => {
        if (meta.audioBuffer) {
            const incomingData = meta.audioBuffer.getChannelData(0);
            // Offset audio start by INTRO_DURATION
            const startIdx = Math.floor((meta.startTime + INTRO_DURATION) * sampleRate);
            for(let i=0; i<incomingData.length; i++) {
                if (startIdx + i < channelData.length) {
                    channelData[startIdx + i] = incomingData[i];
                }
            }
        }
    });

    // --- PHASE 3: ASSET PRELOAD ---
    setStatusMessage("Pre-loading High Res Images...");
    const preloadedImages = new Map<string, HTMLImageElement>();
    for (const kf of sortedKeyframes) {
        if (kf.image) {
            try { preloadedImages.set(kf.id, await loadImage(kf.image)); } catch(e) {}
        }
    }

    // --- PHASE 4: RECORDING (TIME-SYNCED) ---
    setStatusMessage("Starting Render Engine...");
    
    // Setup Audio Destination
    const audioDest = audioCtx.createMediaStreamDestination();
    const masterSource = audioCtx.createBufferSource();
    masterSource.buffer = masterBuffer;
    masterSource.connect(audioDest);

    // Setup Video Stream (0 FPS for manual capture control)
    const videoStream = (canvas as any).captureStream(0); 
    const videoTrack = videoStream.getVideoTracks()[0];
    
    const combinedStream = new MediaStream([
        videoTrack, 
        ...audioDest.stream.getAudioTracks()
    ]);

    const { mime, ext } = getSupportedMimeType();
    setOutputExtension(ext);
    
    // High Bitrate Recording (12 Mbps for 1080p)
    const recorder = new MediaRecorder(combinedStream, { 
        mimeType: mime, 
        videoBitsPerSecond: 12000000 // 12 Mbps
    });
    
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mime });
        setGeneratedVideoUrl(URL.createObjectURL(blob));
        setIsExporting(GenerationStatus.SUCCESS);
        audioCtx.close();
    };

    recorder.start();
    masterSource.start();
    const startTime = audioCtx.currentTime;

    const finalProjectBoundary = new Date(projectEndDate.getFullYear(), projectEndDate.getMonth() + 1, 0, 23, 59, 59);

    // --- SMOOTH INTERPOLATION CALCULATOR FOR EXPORT ---
    // Use the same robust calculation method as Preview
    const kfTargets = interpolationMap;
    
    // 3. Render Loop synced to Audio Clock
    const FPS = 30;
    const FRAME_INTERVAL = 1000 / FPS;

    const easeOutCubic = (x: number): number => {
        return 1 - Math.pow(1 - x, 3);
    };

    const renderFrame = async () => {
        const now = audioCtx.currentTime;
        const elapsed = now - startTime;

        if (elapsed >= (totalDuration + INTRO_DURATION)) {
            recorder.stop();
            return;
        }

        setStatusMessage(`Rendering: ${elapsed.toFixed(1)}s / ${(totalDuration + INTRO_DURATION).toFixed(1)}s`);

        // INTRO PHASE
        if (elapsed < INTRO_DURATION) {
            const introProgress = easeOutCubic(elapsed / INTRO_DURATION);
            
            // Render first keyframe during intro
            const firstMeta = stageMetadata[0];
            if (firstMeta) {
                const kf = firstMeta.kf;
                const targets = kfTargets.get(kf.id) || { start: 0, end: 0 };
                const img = preloadedImages.get(kf.id) || null;
                
                // During intro, progress is at start value
                await drawSceneToCanvas(ctx, kf.startDate, width, height, "", kf, 0, targets.start, img, overlayConfig, tasks, introProgress);
            }
        } 
        // MAIN CONTENT PHASE
        else {
            const adjustedElapsed = elapsed - INTRO_DURATION;
            
            // Robust activeIdx lookup (better than findIndex)
            let activeIdx = 0;
            for (let i = 0; i < stageMetadata.length; i++) {
                const m = stageMetadata[i];
                if (adjustedElapsed >= m.startTime && adjustedElapsed < (m.startTime + m.duration)) {
                    activeIdx = i;
                    break;
                }
            }
            // Fallback
            if (adjustedElapsed >= stageMetadata[stageMetadata.length - 1].startTime + stageMetadata[stageMetadata.length - 1].duration) {
                    activeIdx = stageMetadata.length - 1;
            }

            const meta = stageMetadata[activeIdx];
            const kf = meta.kf;
            
            // Retrieve strictly calculated interpolation targets
            const targets = kfTargets.get(kf.id) || { start: 0, end: 0 };
            const startVal = targets.start;
            const endVal = targets.end;

            // Linear Time Progress within this specific frame
            const stageProgress = Math.min(1, Math.max(0, (adjustedElapsed - meta.startTime) / meta.duration));
            
            // INTERPOLATE
            const displayPercent = startVal + (endVal - startVal) * stageProgress;
            
            // Get Image
            const img = preloadedImages.get(kf.id) || null;
            
            // Draw Frame (introProgress = 1)
            await drawSceneToCanvas(ctx, kf.startDate, width, height, getEffectiveNarration(kf), kf, 0, displayPercent, img, overlayConfig, tasks, 1.0);
        }
        
        if (videoTrack.requestFrame) videoTrack.requestFrame();

        setTimeout(() => {
            renderFrame();
        }, FRAME_INTERVAL);
    };

    renderFrame();
  };

  const drawSceneToCanvas = async (
    ctx: CanvasRenderingContext2D, 
    date: Date, 
    width: number, 
    height: number, 
    customNarration: string, 
    kf: Keyframe, 
    animFactor: number = 1, 
    prevProgressValue: number = 0,
    preloadedImage: HTMLImageElement | null = null,
    config: OverlayConfig = overlayConfig,
    projectTasks: Task[] = tasks,
    introProgress: number = 1.0 // New parameter, 0 to 1
  ) => {
    const VW = width / 100; 

    // 0. BG IMAGE
    // Always clear or fill background first
    ctx.fillStyle = '#0f172a'; 
    ctx.fillRect(0, 0, width, height); 

    if (preloadedImage) {
        const imgRatio = preloadedImage.width / preloadedImage.height, canvasRatio = width / height;
        let dW, dH, oX, oY;
        if (imgRatio > canvasRatio) { dH = height; dW = preloadedImage.width * (height / preloadedImage.height); oX = -(dW - width) / 2; oY = 0; }
        else { dW = width; dH = preloadedImage.height * (width / preloadedImage.width); oX = 0; oY = -(dH - height) / 2; }
        ctx.drawImage(preloadedImage, oX, oY, dW, dH);
    }

    // 1. LAYER 30: Circle Background Rectangle
    // Animate with Circle (Fly in from top)
    const circleFlyOffset = (height * 0.5) * (1 - introProgress); // Fly in from 50% height above
    
    if (config.circleRectShow) {
      ctx.save();
      ctx.translate(0, -circleFlyOffset); // Apply fly-in
      
      ctx.globalAlpha = config.circleRectOpacity; ctx.fillStyle = config.circleRectColor;
      const rectW = config.circleRectWidth * config.circleScale, rectH = config.circleRectHeight * config.circleScale;
      const rx = (width * config.circleRectX) - rectW / 2, ry = (height * config.circleRectY) - rectH / 2;
      drawRoundRect(ctx, rx, ry, rectW, rectH, config.circleRectBorderRadius * config.circleScale); ctx.fill();
      ctx.globalAlpha = 1.0;
      
      ctx.restore();
    }

    // 2. LAYER 40: Task Content
    // Tasks usually appear with the image, so maybe no fly-in? Or fly in with circle?
    // Let's keep tasks static with the image for now, or maybe fade them in?
    // User asked for Timeline and Circle. Let's stick to that.
    
    const curTime = date.getTime();
    const currentActiveTasks = projectTasks.filter(t => t.visible && curTime >= t.startDate.getTime() && curTime <= t.endDate.getTime());
    const taskCircleRadius = 30 * config.fontSizeBase * (config.taskCircleScale || 1.0);
    
    currentActiveTasks.forEach((t, i) => {
      const p = getTaskProgress(t, date);
      const yOffset = (height * config.taskY) + (i * height * config.taskSpacingY);
      const tx = (width * config.taskX) + taskCircleRadius, ty = yOffset + taskCircleRadius;
      
      ctx.globalAlpha = config.taskOpacity;
      ctx.fillStyle = config.taskCircleBgColor; ctx.beginPath(); ctx.arc(tx, ty, taskCircleRadius, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = '#e2e8f0'; ctx.beginPath(); ctx.arc(tx, ty, taskCircleRadius * 0.8, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = config.taskPrimaryColor; ctx.beginPath(); ctx.arc(tx, ty, taskCircleRadius * 0.8, -Math.PI/2, (-Math.PI/2) + (Math.PI * 2 * (p / 100))); ctx.stroke();
      
      const taskPctFontSizePx = config.taskPercentFontSize * 0.1 * VW; 
      ctx.fillStyle = config.taskPrimaryColor; ctx.font = `${config.taskFontWeight} ${taskPctFontSizePx}px ${config.taskFontFamily || config.fontFamily}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${p}%`, tx, ty);
      
      const labelW = width * 0.15, labelH = taskCircleRadius * 0.8, padding = 15;
      let lx = tx, ly = ty;
      
      if (config.taskLabelPosition === 'right') { lx = tx + taskCircleRadius + padding; ly = ty - labelH / 2; }
      else if (config.taskLabelPosition === 'left') { lx = tx - taskCircleRadius - padding - labelW; ly = ty - labelH / 2; }
      else if (config.taskLabelPosition === 'top') { lx = tx - labelW / 2; ly = ty - taskCircleRadius - padding - labelH; }
      else if (config.taskLabelPosition === 'bottom') { lx = tx - labelW / 2; ly = ty + taskCircleRadius + padding; }

      ctx.globalAlpha = config.taskLabelBgOpacity * config.taskOpacity;
      ctx.fillStyle = config.taskLabelBgColor; 
      drawRoundRect(ctx, lx, ly, labelW, labelH, 4); ctx.fill();
      if (config.taskLabelBorderShow) { ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; ctx.lineWidth = 1; ctx.stroke(); }
      ctx.globalAlpha = config.taskOpacity;
      
      const taskLblFontSizePx = config.taskFontSize * 0.1 * VW;
      ctx.fillStyle = 'white'; ctx.font = `${config.taskFontWeight} ${taskLblFontSizePx}px ${config.fontFamily}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(t.name.toUpperCase(), lx + labelW / 2, ly + labelH / 2);
    });
    ctx.globalAlpha = 1.0;

    // 3. LAYER 50: TIMELINE & NARRATION
    const tlHeight = height * config.timelineHeight;
    
    // TIMELINE FLY IN ANIMATION
    const timelineFlyOffset = tlHeight * (1 - introProgress); // Fly in from top (offset by height)
    
    ctx.save();
    ctx.translate(0, -timelineFlyOffset);

    const paddingX = width * 0.04;
    ctx.globalAlpha = config.overlayOpacity;
    ctx.fillStyle = config.timelineBgColor;
    ctx.fillRect(0, 0, width, tlHeight);
    ctx.globalAlpha = 1.0;

    if (config.timelineProgressBarShow) {
      const totalM = projectMonths.length;
      const curMIdx = projectMonths.findIndex(m => m.getMonth() === date.getMonth() && m.getFullYear() === date.getFullYear());
      if (curMIdx !== -1) {
        ctx.globalAlpha = config.timelineProgressBarOpacity;
        ctx.fillStyle = config.timelineProgressBarColor;
        const progressW = width * (curMIdx / (totalM - 1));
        ctx.fillRect(0, tlHeight - config.timelineProgressBarHeight, progressW, config.timelineProgressBarHeight);
        ctx.globalAlpha = 1.0;
      }
    }

    const monthsAreaX = paddingX + 160;
    const monthsAreaWidth = width - monthsAreaX - paddingX;
    const gapW = monthsAreaWidth * 0.005; 
    const count = projectMonths.length;
    const monthBoxWidth = (monthsAreaWidth - ((count - 1) * gapW)) / count;
    const yearBarHeight = tlHeight * 0.35, monthBarHeight = tlHeight * 0.5;

    if (config.timelineLabelShow) {
      ctx.fillStyle = config.timelineLabelColor;
      const labelPx = config.timelineLabelFontSize * 0.1 * VW;
      ctx.font = `${config.timelineLabelFontWeight} ${labelPx}px ${config.timelineLabelFontFamily || config.fontFamily}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      
      const labelY = tlHeight * config.timelineLabelY;
      ctx.fillText(config.timelineLabelText, width * config.timelineLabelX, labelY);
    }

    let currentXOffset = monthsAreaX;
    projectYears.forEach(py => {
      const yearMonthCount = py.count;
      const yearWidth = (yearMonthCount * monthBoxWidth) + ((yearMonthCount - 1) * gapW);
      
      ctx.fillStyle = config.timelineYearColor;
      const yearPx = config.timelineYearFontSize * 0.1 * VW;
      ctx.font = `${config.timelineYearFontWeight} ${yearPx}px ${config.fontFamily}`;
      ctx.textAlign = 'center';
      const yearCenterX = currentXOffset + yearWidth / 2;
      ctx.fillText(py.year.toString(), yearCenterX, yearBarHeight/2 + 5);
      currentXOffset += yearWidth + gapW;
    });

    const nextMonthDate = new Date(date);
    nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);

    projectMonths.forEach((m, idx) => {
      const isCurrent = m.getMonth() === date.getMonth() && m.getFullYear() === date.getFullYear();
      const isPast = m.getFullYear() < date.getFullYear() || (m.getFullYear() === date.getFullYear() && m.getMonth() < date.getMonth());
      const isNext = m.getMonth() === nextMonthDate.getMonth() && m.getFullYear() === nextMonthDate.getFullYear();
      
      const x = monthsAreaX + (idx * (monthBoxWidth + gapW));
      const y = yearBarHeight + 5, boxH = monthBarHeight - 10;
      
      ctx.globalAlpha = config.timelineMonthOpacity;
      const bgScale = isCurrent ? config.monthActiveScale : config.monthInactiveScale;
      const bW = monthBoxWidth * bgScale, bH = boxH * bgScale;
      const bX = x - (bW - monthBoxWidth) / 2, bY = y - (bH - boxH) / 2;

      if (isCurrent) { ctx.fillStyle = config.monthActiveBg; drawRoundRect(ctx, bX, bY, bW, bH, config.monthBorderRadius * bgScale); ctx.fill(); ctx.fillStyle = '#ffffff'; }
      else if (isPast) { ctx.fillStyle = config.monthPastBg; drawRoundRect(ctx, bX, bY, bW, bH, config.monthBorderRadius * bgScale); ctx.fill(); ctx.fillStyle = config.monthTextColor; }
      else if (isNext) { ctx.fillStyle = config.monthNextBg; drawRoundRect(ctx, bX, bY, bW, bH, config.monthBorderRadius * bgScale); ctx.fill(); ctx.fillStyle = config.monthTextColor; }
      else { ctx.fillStyle = config.monthInactiveBg; drawRoundRect(ctx, bX, bY, bW, bH, config.monthBorderRadius * bgScale); ctx.fill(); ctx.fillStyle = config.monthTextColor; }
      ctx.globalAlpha = 1.0;
      
      const configSize = isCurrent ? config.monthActiveFontSize : config.timelineMonthFontSize;
      const monthPx = configSize * 0.1 * VW;
      ctx.font = `${config.timelineMonthFontWeight} ${monthPx}px ${config.fontFamily}`;
      ctx.textAlign = 'center'; 
      ctx.textBaseline = 'middle';
      ctx.fillText(m.toLocaleString('en-US', { month: 'short' }).toUpperCase(), x + (monthBoxWidth/2), y + boxH/2);
    });
    
    ctx.restore(); // End Timeline Fly In

    // --- UPDATED NARRATION BAR RENDERING ---
    // CONDITIONAL VISIBILITY
    if (config.narrationBarShow) {
        // Dynamic sizing: The black bar height is now calculated based on the font size.
        // USE NARRATION SPECIFIC FONT SIZE
        const narrFontSize = config.narrationFontSize * 0.1 * VW;
        
        // Calculate bar height: Font Size * 2.2 for comfortable padding (approx 0.6em top/bottom)
        // Enforce a minimum height of 5% of screen height to maintain visual weight
        const barHeight = Math.max(height * 0.05, narrFontSize * 2.2);
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'; 
        ctx.fillRect(0, height - barHeight, width, barHeight);
        
        ctx.fillStyle = 'white'; 
        // USE NARRATION SPECIFIC FONT FAMILY
        ctx.font = `${config.fontWeight} ${narrFontSize}px ${config.narrationFontFamily || config.fontFamily}`; 
        ctx.textBaseline = 'middle'; 
        ctx.textAlign = 'center';
        
        // Draw text centered in the dynamically sized bar
        ctx.fillText((customNarration || "").toUpperCase(), width / 2, height - (barHeight / 2), width * 0.95);
    }

    // Use prevProgressValue directly (it now comes interpolated from loop)
    const currentProgressDisplay = prevProgressValue;
    
    // CIRCLE FLY IN ANIMATION
    ctx.save();
    ctx.translate(0, -circleFlyOffset); // Apply same fly-in as rect

    const circleBaseSize = 80 * config.circleScale, radius = (circleBaseSize / 2) * 0.8;
    const cX = width * config.circleX, cY = height * config.circleY;
    
    ctx.globalAlpha = config.circleOpacity; ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath(); ctx.arc(cX, cY, radius + 10, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = config.progressStrokeWidth; ctx.strokeStyle = '#e2e8f0';
    ctx.beginPath(); ctx.arc(cX, cY, radius, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = config.circleColor; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cX, cY, radius, -Math.PI / 2, (-Math.PI / 2) + (Math.PI * 2 * (currentProgressDisplay / 100))); ctx.stroke();
    
    const circlePx = 14 * config.circleScale * config.fontSizeBase;
    ctx.fillStyle = config.circleColor; ctx.font = `${config.fontWeight} ${circlePx}px ${config.fontFamily}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(`${Math.round(currentProgressDisplay)}%`, cX, cY);

    if (config.circleShowLabel) {
      const lblSize = config.circleLabelFontSize * 0.1 * VW * config.circleScale;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = config.circleLabelColor; ctx.font = `${config.fontWeight} ${lblSize}px ${config.circleLabelFontFamily || config.fontFamily}`;
      
      const circleWrapperSize = 80 * config.circleScale;
      const distFromCenter = (circleWrapperSize / 2) + (circleWrapperSize * (config.circleLabelDistance * 1.5) / 100);
      
      if (config.circleLabelPosition === 'right') { 
        ctx.textAlign = 'left'; ctx.fillText(config.circleLabelLine1, cX + distFromCenter, cY - (lblSize * 0.65)); 
        ctx.fillStyle = config.accentColor; ctx.fillText(config.circleLabelLine2, cX + distFromCenter, cY + (lblSize * 0.65)); 
      }
      else if (config.circleLabelPosition === 'left') { 
        ctx.textAlign = 'right'; ctx.fillText(config.circleLabelLine1, cX - distFromCenter, cY - (lblSize * 0.65)); 
        ctx.fillStyle = config.accentColor; ctx.fillText(config.circleLabelLine2, cX - distFromCenter, cY + (lblSize * 0.65)); 
      }
      else if (config.circleLabelPosition === 'top') { 
        ctx.textAlign = 'center'; ctx.fillText(config.circleLabelLine1, cX, cY - distFromCenter - (lblSize * 1.3)); 
        ctx.fillStyle = config.accentColor; ctx.fillText(config.circleLabelLine2, cX, cY - distFromCenter - (lblSize * 0.1)); 
      }
      else if (config.circleLabelPosition === 'bottom') { 
        ctx.textAlign = 'center'; ctx.fillText(config.circleLabelLine1, cX, cY + distFromCenter + (lblSize * 0.1)); 
        ctx.fillStyle = config.accentColor; ctx.fillText(config.circleLabelLine2, cX, cY + distFromCenter + (lblSize * 1.3)); 
      }
    }
    ctx.restore(); // End Circle Fly In
    
    ctx.globalAlpha = 1.0;
  };

  const getTaskProgress = useCallback((t: Task, date: Date) => {
    const key = getMonthKey(date);
    const manualEntry = t.history?.find(h => getMonthKey(new Date(h.date)) === key);
    if (manualEntry) return manualEntry.progress;
    const curTime = date.getTime(), start = t.startDate.getTime(), end = t.endDate.getTime();
    if (curTime >= end) return 100; if (curTime <= start) return 0;
    return Math.round(((curTime - start) / (end - start)) * 100);
  }, []);

  const visibleKeyframe = useMemo(() => {
    if (selectedKeyframeId) {
      const k = sortedKeyframes.find(x => x.id === selectedKeyframeId);
      if (isPreviewing) return k || sortedKeyframes[0];
      if (k && k.startDate.getMonth() === currentDate.getMonth() && k.startDate.getFullYear() === currentDate.getFullYear()) return k; 
    }
    return sortedKeyframes.find(k => k.startDate.getMonth() === currentDate.getMonth() && k.startDate.getFullYear() === currentDate.getFullYear()) || sortedKeyframes[0];
  }, [sortedKeyframes, currentDate, selectedKeyframeId, isPreviewing]);

  // Use getProgressForMonth to ensure timeline shows the month's defined progress
  const totalProgress = useMemo(() => visibleKeyframe ? getProgressForMonth(visibleKeyframe.startDate) : 0, [visibleKeyframe, getProgressForMonth]);

  // UNIFIED PREVIEW RENDER EFFECT
  useEffect(() => {
    if (previewCanvasRef.current && visibleKeyframe) {
      const ctx = previewCanvasRef.current.getContext('2d', { alpha: false });
      if (ctx) {
        // Handle image caching for smooth preview
        let imgToDraw: HTMLImageElement | null = null;
        if (visibleKeyframe.image) {
           if (imageCache.current.has(visibleKeyframe.id)) {
             imgToDraw = imageCache.current.get(visibleKeyframe.id)!;
           } else {
             // If not cached, load it and cache it (async)
             const img = new Image();
             img.src = visibleKeyframe.image;
             img.onload = () => {
               imageCache.current.set(visibleKeyframe.id, img);
               // Trigger re-draw after load if this is still the active frame
               if (visibleKeyframe.id === selectedKeyframeId || (sortedKeyframes.find(k => k.startDate.getTime() === currentDate.getTime())?.id === visibleKeyframe.id)) {
                  drawSceneToCanvas(ctx, currentDate, 1920, 1080, getEffectiveNarration(visibleKeyframe), visibleKeyframe, 0, displayProgress, img, overlayConfig, tasks);
               }
             };
           }
        }
        
        drawSceneToCanvas(
          ctx, 
          currentDate, 
          1920, 
          1080, 
          getEffectiveNarration(visibleKeyframe), 
          visibleKeyframe, 
          0, 
          displayProgress,
          imgToDraw,
          overlayConfig,
          tasks
        );
      }
    }
  }, [currentDate, visibleKeyframe, displayProgress, overlayConfig, tasks, getEffectiveNarration]);

  useEffect(() => {
    if (!isPreviewing && visibleKeyframe) {
      // Show the interpolated END value for the specific selected stage
      // This gives instant feedback on what "part" of the progress this image contributes
      const target = interpolationMap.get(visibleKeyframe.id);
      if (target) {
        setDisplayProgress(target.end);
      } else {
        setDisplayProgress(getProgressForMonth(visibleKeyframe.startDate));
      }
    }
  }, [visibleKeyframe, isPreviewing, interpolationMap, getProgressForMonth]);

  useEffect(() => {
    loadData(STORAGE_KEY).then(data => {
      if (data) {
        setProjectStartDate(new Date(data.projectStartDate)); setProjectEndDate(new Date(data.projectEndDate));
        setKeyframes(data.keyframes.map((k: any) => ({ ...k, startDate: new Date(k.startDate), endDate: new Date(k.endDate) })));
        setTasks(data.tasks.map((t: any) => ({ ...t, startDate: new Date(t.startDate), endDate: new Date(t.endDate), history: t.history || [] })));
        if (data.overlayConfig) setOverlayConfig({ ...DEFAULT_CONFIG, ...data.overlayConfig });
      }
      setIsDataLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (!isDataLoaded) return;
    saveData(STORAGE_KEY, {
      projectStartDate: projectStartDate.toISOString(), projectEndDate: projectEndDate.toISOString(),
      keyframes: keyframes.map(k => ({ ...k, startDate: k.startDate.toISOString(), endDate: k.endDate.toISOString() })),
      tasks: tasks.map(t => ({ ...t, startDate: t.startDate.toISOString(), endDate: t.endDate.toISOString(), history: t.history })),
      overlayConfig
    });
  }, [keyframes, tasks, projectStartDate, projectEndDate, isDataLoaded, overlayConfig]);

  const updateMonthProgress = (keyframeId: string, newProgress: number) => {
      // Find the date context from the keyframeId
      const targetKf = keyframes.find(k => k.id === keyframeId);
      if (!targetKf) return;
      
      const date = targetKf.startDate;

      setKeyframes(prev => prev.map(k => {
          // Update ALL keyframes in the same month to ensure consistency
          if (isSameMonth(k.startDate, date)) {
              return { ...k, progress: newProgress };
          }
          return k;
      }));
  };

  const handleModalSave = () => {
    if (!editState) return;
    const { type, id, dateContext } = editState, value = modalInputValue;
    try {
      const parseDateStr = (str: string) => { const [m, y] = str.split('/'); return new Date(parseInt(y), parseInt(m) - 1, 1); };
      if (type === 'keyframe-start' || type === 'keyframe-end') {
        const newDate = parseDateStr(value);
        setKeyframes(prev => {
          const sorted = [...prev].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
          const idx = sorted.findIndex(k => k.id === id); if (idx === -1) return prev;
          const updated = [...sorted];
          if (type === 'keyframe-start') { updated[idx].startDate = newDate; const end = new Date(newDate); end.setMonth(end.getMonth() + 1); updated[idx].endDate = end; }
          else updated[idx].endDate = newDate;
          for (let i = idx + 1; i < updated.length; i++) {
            const prevStart = new Date(updated[i - 1].startDate); prevStart.setMonth(prevStart.getMonth() + 1);
            updated[i] = { ...updated[i], startDate: new Date(prevStart), endDate: new Date(prevStart.getFullYear(), prevStart.getMonth() + 1, 1) };
          }
          return updated;
        });
      } 
      else if (type === 'task-name') setTasks(prev => prev.map(t => t.id === id ? { ...t, name: value.toUpperCase() } : t));
      else if (type === 'task-start') setTasks(prev => prev.map(t => t.id === id ? { ...t, startDate: parseDateStr(value) } : t));
      else if (type === 'task-end') setTasks(prev => prev.map(t => t.id === id ? { ...t, endDate: parseDateStr(value) } : t));
      else if (type === 'task-progress-month' && dateContext) {
        setTasks(prev => prev.map(t => {
          if (t.id === id) {
            const key = getMonthKey(dateContext), history = [...(t.history || [])], exIdx = history.findIndex(h => getMonthKey(new Date(h.date)) === key);
            if (exIdx > -1) history[exIdx].progress = Number(value);
            else history.push({ date: dateContext.toISOString(), progress: Number(value) });
            return { ...t, history };
          }
          return t;
        }));
      }
      else if (type === 'project-start') setProjectStartDate(parseDateStr(value));
      else if (type === 'project-end') setProjectEndDate(parseDateStr(value));
      else if (type === 'keyframe-subtitle') setKeyframes(prev => prev.map(k => k.id === id ? { ...k, subtitle: value } : k));
      else if (type === 'keyframe-narration') setKeyframes(prev => prev.map(k => k.id === id ? { ...k, narration: value } : k));
      else if (type === 'keyframe-progress') {
          // Legacy support or direct keyframe update
          const num = parseFloat(value);
          if (!isNaN(num)) {
             // CRITICAL UPDATE: Ensure updating a single keyframe also syncs the whole month
             // Find context date for this ID
             const contextKf = keyframes.find(k => k.id === id);
             if (contextKf) {
                 const date = contextKf.startDate;
                 setKeyframes(prev => prev.map(k => {
                     if (isSameMonth(k.startDate, date)) {
                         return { ...k, progress: num };
                     }
                     return k;
                 }));
             } else {
                 // Fallback if not found (shouldn't happen)
                 setKeyframes(prev => prev.map(k => k.id === id ? { ...k, progress: num } : k));
             }
          }
      }
      else if (type === 'month-progress' && dateContext) {
           const num = parseFloat(value.trim()); // Trim whitespace
           if (!isNaN(num)) {
               setKeyframes(prev => prev.map(k => {
                   if (isSameMonth(k.startDate, dateContext)) {
                       return { ...k, progress: num };
                   }
                   return k;
               }));
           } else {
               alert("Vui lòng nhập số hợp lệ.");
           }
      }
    } catch (e) { alert("Lỗi định dạng."); }
    setEditState(null);
  };

  const nextMonthDateJSX = useMemo(() => { const d = new Date(currentDate); d.setMonth(d.getMonth() + 1); return d; }, [currentDate]);

  const toggleAccordion = (id: string) => {
    setOpenDesignSection(openDesignSection === id ? null : id);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-900 text-slate-100 overflow-hidden font-inter select-none">
      <header className="h-14 flex items-center justify-between px-6 bg-slate-800 border-b border-slate-700 z-[100] shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-black text-white italic text-[12px]">C</div>
          <h1 className="text-[12px] font-black italic tracking-tighter text-blue-400 uppercase">Construction Sequence Pro</h1>
          
          <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-700 mx-4">
            <button 
                onClick={() => setViewMode('sequence')}
                className={`px-3 py-1 text-[9px] font-black uppercase rounded transition-all ${viewMode === 'sequence' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
                Sequence
            </button>
            <button 
                onClick={() => setViewMode('matrix')}
                className={`px-3 py-1 text-[9px] font-black uppercase rounded transition-all ${viewMode === 'matrix' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
                Matrix
            </button>
          </div>

          <div className="h-4 w-px bg-slate-600 mx-2" />
          <div className="flex items-center gap-2">
             <button onClick={() => { setEditState({type:'project-start', id:'g', label:'DATES START (MM/YYYY)', value:formatDateLabel(projectStartDate)}); setModalInputValue(formatDateLabel(projectStartDate)); }} className="text-[9px] font-bold text-slate-400 bg-slate-700/50 px-2 py-1 rounded hover:bg-slate-700">BEG: {formatDateLabel(projectStartDate)}</button>
             <button onClick={() => { setEditState({type:'project-end', id:'g', label:'DATES END (MM/YYYY)', value:formatDateLabel(projectEndDate)}); setModalInputValue(formatDateLabel(projectEndDate)); }} className="text-[9px] font-bold text-slate-400 bg-slate-700/50 px-2 py-1 rounded hover:bg-slate-700">END: {formatDateLabel(projectEndDate)}</button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowWorkspaceTimeline(!showWorkspaceTimeline)} className={`flex items-center gap-2 px-3 py-1.5 rounded text-[9px] font-black uppercase transition-all border ${showWorkspaceTimeline ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-700 border-slate-600 text-slate-400'}`}>
            {showWorkspaceTimeline ? 'TIMELINE: ON' : 'TIMELINE: OFF'}
          </button>
          <div className="h-6 w-px bg-slate-600 mx-1" />
          
          <div className="flex items-center gap-2 bg-slate-700/30 p-1 rounded border border-slate-600">
             {/* Voice Provider Selector */}
             <div className="flex flex-col gap-0.5 px-2">
               <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">VOICE ENGINE:</span>
               <div className="flex gap-2 items-center">
                   <select 
                      className="bg-transparent text-slate-200 text-[9px] font-bold focus:outline-none w-32" 
                      value={voiceProvider} 
                      onChange={(e) => setVoiceProvider(e.target.value as VoiceProvider)}
                   >
                     <option value="gemini" className="text-slate-900">Gemini AI (Best/Audio)</option>
                     <option value="custom" className="text-slate-900">Custom Upload (Best Local)</option>
                     <option value="google" className="text-slate-900">Google TTS (Experimental)</option>
                     <option value="system" className="text-slate-900">System Voice (Silent Export)</option>
                   </select>
                   
                   {/* Language toggle for Google Free only */}
                   {voiceProvider === 'google' && (
                       <button 
                          onClick={() => setGoogleLang(l => l === 'vi' ? 'en' : 'vi')} 
                          className="text-[8px] font-bold px-1.5 py-0.5 bg-slate-600 rounded text-white uppercase hover:bg-slate-500"
                       >
                          {googleLang}
                       </button>
                   )}
               </div>
             </div>

             {/* Dynamic Voice Settings based on Provider */}
             {voiceProvider === 'system' && availableVoices.length > 0 && (
                <>
                   <div className="h-6 w-px bg-slate-600 mx-1" />
                   <div className="flex flex-col gap-0.5 px-2">
                     <span className="text-[7px] font-black text-slate-500 uppercase tracking-widest">SYSTEM VOICE (PREVIEW ONLY):</span>
                     <select className="bg-transparent text-slate-200 text-[9px] font-bold focus:outline-none w-24" value={selectedVoiceIndex} onChange={(e) => setSelectedVoiceIndex(Number(e.target.value))}>
                       {availableVoices.map((v, i) => <option key={i} value={i} className="text-slate-900">{v.name} ({v.lang})</option>)}
                     </select>
                   </div>
                </>
             )}
          </div>

          <div className="h-6 w-px bg-slate-600 mx-1" />
          <button onClick={handlePreview} disabled={isPreparingPreview} className={`flex items-center gap-2 px-4 py-2 rounded text-[9px] font-black uppercase shadow-lg transition-all ${isPreparingPreview ? 'bg-slate-600 cursor-wait' : (isPreviewing ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white')}`}>
            {isPreparingPreview ? 'Preparing...' : (isPreviewing ? 'STOP PREVIEW' : 'PREVIEW SEQ')}
          </button>
          
          <button onClick={handleExport} className="bg-blue-600 text-white text-[9px] font-black px-6 py-2 rounded shadow-lg hover:bg-blue-700 uppercase">
             EXPORT VIDEO (MP4/WebM)
          </button>
        </div>
      </header>

      {viewMode === 'sequence' && showWorkspaceTimeline && <Timeline startDate={projectStartDate} endDate={projectEndDate} currentDate={currentDate} onDateChange={(d) => { setCurrentDate(d); setSelectedKeyframeId(null); }} totalProgress={totalProgress} />}

      <div className="flex-1 flex overflow-hidden">
        {viewMode === 'matrix' ? (
          <MatrixView 
            keyframes={keyframes}
            tasks={tasks}
            projectStartDate={projectStartDate}
            projectEndDate={projectEndDate}
            onEdit={setEditState}
            onUpdateKeyframe={updateKeyframe}
            overlayConfig={overlayConfig}
          />
        ) : (
        <>
        <main className="flex-1 relative bg-black flex items-center justify-center overflow-hidden p-8">
          <div className="relative w-full max-w-[1280px] aspect-video bg-slate-950 shadow-2xl overflow-hidden border border-slate-800">
            {/* UNIFIED CANVAS PREVIEW: Same resolution as Export (1280x720) */}
            <canvas 
              ref={previewCanvasRef} 
              width={1920} 
              height={1080} 
              className="w-full h-full object-contain"
            />
            {!visibleKeyframe && (
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-slate-700 font-black italic uppercase tracking-widest">No stages to display</span>
               </div>
            )}
          </div>
        </main>

        <aside className="w-80 bg-slate-800 border-l border-slate-700 flex flex-col shadow-xl z-10">
          <div className="flex border-b border-slate-700 overflow-x-auto scrollbar-hide">
             <button onClick={() => setActiveTab('images')} className={`flex-1 min-w-[64px] py-4 text-[9px] font-black ${activeTab === 'images' ? 'text-blue-400 border-b-2 border-blue-500 bg-slate-700' : 'text-slate-500'}`}>STAGES</button>
             <button onClick={() => setActiveTab('tasks')} className={`flex-1 min-w-[64px] py-4 text-[9px] font-black ${activeTab === 'tasks' ? 'text-blue-400 border-b-2 border-blue-500 bg-slate-700' : 'text-slate-500'}`}>TASKS</button>
             <button onClick={() => setActiveTab('months')} className={`flex-1 min-w-[64px] py-4 text-[9px] font-black ${activeTab === 'months' ? 'text-blue-400 border-b-2 border-blue-500 bg-slate-700' : 'text-slate-500'}`}>MONTHS</button>
             <button onClick={() => setActiveTab('design')} className={`flex-1 min-w-[64px] py-4 text-[9px] font-black ${activeTab === 'design' ? 'text-blue-400 border-b-2 border-blue-500 bg-slate-700' : 'text-slate-500'}`}>DESIGN</button>
          </div>
          <div className="flex-1 overflow-y-auto bg-white text-slate-900 scrollbar-hide">
             {activeTab === 'images' && <KeyframeList keyframes={keyframes} onAdd={handleBulkUploadReal} onRemove={(id)=>setKeyframes(k=>k.filter(x=>x.id!==id))} onSelect={(k)=>{ setCurrentDate(k.startDate); setSelectedKeyframeId(k.id); }} onUpdate={(id, updates)=>setKeyframes(prev => prev.map(k => k.id === id ? { ...k, ...updates } : k))} onEdit={(t,i,l,v)=>{setEditState({type:t,id:i,label:l,value:v}); setModalInputValue(v);}} selectedId={visibleKeyframe?.id || null} />}
             
             {activeTab === 'tasks' && (
               <div className="p-4 flex flex-col gap-4">
                  <div className="flex justify-between items-center mb-2">
                    <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">TASK MANAGEMENT</h2>
                    <button onClick={handleAddTask} className="bg-orange-600 text-white text-[8px] px-3 py-1.5 rounded font-black uppercase shadow-sm hover:bg-orange-700">ADD NEW TASK</button>
                  </div>
                  <div className="space-y-3">
                    {tasks.map(t => (
                      <div key={t.id} className="p-4 border border-slate-100 rounded-xl bg-slate-50 flex flex-col gap-3 shadow-sm">
                         <div className="flex justify-between items-start">
                            <button onClick={() => {setEditState({type:'task-name', id:t.id, label:'EDIT TASK NAME', value:t.name}); setModalInputValue(t.name);}} className="text-[11px] font-black text-slate-800 uppercase text-left truncate flex-1 pr-2 hover:text-blue-600">{t.name}</button>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setTasks(prev => prev.map(x => x.id === t.id ? {...x, visible: !x.visible} : x))} className={`p-1 rounded transition-colors ${t.visible ? 'text-blue-500' : 'text-slate-300'}`}>{t.visible ? '👁️' : '🕶️'}</button>
                              <button onClick={() => handleRemoveTask(t.id)} className="text-slate-300 hover:text-red-500 transition-colors p-1">❌</button>
                            </div>
                         </div>
                         <div className="grid grid-cols-2 gap-2">
                           <button onClick={() => {setEditState({type:'task-start', id:t.id, label:'EDIT TASK START (MM/YYYY)', value:formatDateLabel(t.startDate)}); setModalInputValue(formatDateLabel(t.startDate));}} className="bg-white border border-slate-200 py-2 rounded-lg text-[9px] font-bold text-slate-500 uppercase hover:bg-slate-50 hover:border-blue-300 transition-all flex flex-col items-center justify-center gap-0.5 shadow-sm">
                             <span className="text-[7px] text-slate-400 font-black tracking-widest">BEG</span>
                             {t.startDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                           </button>
                           <button onClick={() => {setEditState({type:'task-end', id:t.id, label:'EDIT TASK END (MM/YYYY)', value:formatDateLabel(t.endDate)}); setModalInputValue(formatDateLabel(t.endDate));}} className="bg-white border border-slate-200 py-2 rounded-lg text-[9px] font-bold text-slate-500 uppercase hover:bg-slate-50 hover:border-blue-300 transition-all flex flex-col items-center justify-center gap-0.5 shadow-sm">
                             <span className="text-[7px] text-slate-400 font-black tracking-widest">END</span>
                             {t.endDate.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                           </button>
                         </div>
                      </div>
                    ))}
                  </div>
               </div>
             )}

             {activeTab === 'design' && (
               <div className="flex flex-col h-full bg-white overflow-hidden">
                 <div className="flex-1 overflow-y-auto scrollbar-hide">
                    {/* ... (Existing Design Accordion Items remain unchanged) ... */}
                    {/* ... Keeping existing content ... */}
                    
                    {/* 1. TYPOGRAPHY */}
                    <AccordionItem title="1. Global Typography" isOpen={openDesignSection === 'fonts'} onToggle={() => toggleAccordion('fonts')}>
                       <div className="space-y-4">
                          <div>
                             <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Font Family</label>
                             <select className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.fontFamily} onChange={e => setOverlayConfig(p => ({...p, fontFamily: e.target.value}))}>
                                <option value="Inter, sans-serif">Inter</option>
                                <option value="'JetBrains Mono', monospace">Mono</option>
                                <option value="serif">Serif</option>
                             </select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Font Weight</label>
                                <select className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.fontWeight} onChange={e => setOverlayConfig(p => ({...p, fontWeight: e.target.value}))}>
                                   <option value="300">Light</option>
                                   <option value="400">Regular</option>
                                   <option value="600">Semi-Bold</option>
                                   <option value="700">Bold</option>
                                   <option value="900">Black</option>
                                </select>
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Base Size (x)</label>
                                <input type="number" step="0.1" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.fontSizeBase} onChange={e => setOverlayConfig(p => ({...p, fontSizeBase: parseFloat(e.target.value)}))} />
                             </div>
                          </div>
                       </div>
                    </AccordionItem>

                    {/* 2. TIMELINE TITLE */}
                    <AccordionItem title="2. Timeline Title" isOpen={openDesignSection === 'timeline_title'} onToggle={() => toggleAccordion('timeline_title')}>
                       <div className="space-y-4">
                          <div className="flex items-center justify-between">
                             <label className="text-[9px] font-bold text-slate-500 uppercase">Show Title</label>
                             <input type="checkbox" className="w-4 h-4 accent-blue-600 rounded" checked={overlayConfig.timelineLabelShow} onChange={e => setOverlayConfig(p => ({...p, timelineLabelShow: e.target.checked}))} />
                          </div>
                          <div>
                             <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Text</label>
                             <input type="text" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold uppercase" value={overlayConfig.timelineLabelText} onChange={e => setOverlayConfig(p => ({...p, timelineLabelText: e.target.value.toUpperCase()}))} />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Color</label>
                                <input type="color" className="w-full h-8 cursor-pointer border border-slate-200 rounded p-0.5" value={overlayConfig.timelineLabelColor} onChange={e => setOverlayConfig(p => ({...p, timelineLabelColor: e.target.value}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Size (px)</label>
                                <input type="number" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.timelineLabelFontSize} onChange={e => setOverlayConfig(p => ({...p, timelineLabelFontSize: parseInt(e.target.value)}))} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">X Pos: {Math.round(overlayConfig.timelineLabelX * 100)}%</label>
                                <input type="range" min="0" max="1" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.timelineLabelX} onChange={e => setOverlayConfig(p => ({...p, timelineLabelX: parseFloat(e.target.value)}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Y Pos: {Math.round(overlayConfig.timelineLabelY * 100)}%</label>
                                <input type="range" min="0" max="1" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.timelineLabelY} onChange={e => setOverlayConfig(p => ({...p, timelineLabelY: parseFloat(e.target.value)}))} />
                             </div>
                          </div>
                          <div>
                            <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Title Font Family</label>
                            <input type="text" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.timelineLabelFontFamily} onChange={e => setOverlayConfig(p => ({...p, timelineLabelFontFamily: e.target.value}))} />
                          </div>
                          <div>
                            <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Title Font Weight</label>
                            <input type="text" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.timelineLabelFontWeight} onChange={e => setOverlayConfig(p => ({...p, timelineLabelFontWeight: e.target.value}))} />
                          </div>
                       </div>
                    </AccordionItem>

                    {/* 3. TIMELINE LAYOUT */}
                    <AccordionItem title="3. Timeline Layout" isOpen={openDesignSection === 'timeline_layout'} onToggle={() => toggleAccordion('timeline_layout')}>
                       <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">BG Color</label>
                                <input type="color" className="w-full h-8 cursor-pointer border border-slate-200 rounded p-0.5" value={overlayConfig.timelineBgColor} onChange={e => setOverlayConfig(p => ({...p, timelineBgColor: e.target.value}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Opacity: {Math.round(overlayConfig.overlayOpacity * 100)}%</label>
                                <input type="range" min="0" max="1" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.overlayOpacity} onChange={e => setOverlayConfig(p => ({...p, overlayOpacity: parseFloat(e.target.value)}))} />
                             </div>
                          </div>
                          <div>
                             <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Height Ratio: {Math.round(overlayConfig.timelineHeight * 100)}%</label>
                             <input type="range" min="0.05" max="0.3" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.timelineHeight} onChange={e => setOverlayConfig(p => ({...p, timelineHeight: parseFloat(e.target.value)}))} />
                          </div>
                          <div className="border-t border-slate-100 pt-3">
                             <div className="flex items-center justify-between mb-2">
                                <label className="text-[9px] font-bold text-slate-500 uppercase">Show Progress Bar</label>
                                <input type="checkbox" className="w-4 h-4 accent-blue-600 rounded" checked={overlayConfig.timelineProgressBarShow} onChange={e => setOverlayConfig(p => ({...p, timelineProgressBarShow: e.target.checked}))} />
                             </div>
                             <div className="grid grid-cols-2 gap-3">
                                <div>
                                   <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Bar Color</label>
                                   <input type="color" className="w-full h-8 cursor-pointer border border-slate-200 rounded p-0.5" value={overlayConfig.timelineProgressBarColor} onChange={e => setOverlayConfig(p => ({...p, timelineProgressBarColor: e.target.value}))} />
                                </div>
                                <div>
                                   <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Bar Height (px)</label>
                                   <input type="number" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.timelineProgressBarHeight} onChange={e => setOverlayConfig(p => ({...p, timelineProgressBarHeight: parseInt(e.target.value)}))} />
                                </div>
                             </div>
                             <div className="mt-2">
                               <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Bar Opacity: {Math.round(overlayConfig.timelineProgressBarOpacity * 100)}%</label>
                               <input type="range" min="0" max="1" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.timelineProgressBarOpacity} onChange={e => setOverlayConfig(p => ({...p, timelineProgressBarOpacity: parseFloat(e.target.value)}))} />
                             </div>
                          </div>
                       </div>
                    </AccordionItem>

                    {/* 4. YEAR LABELS */}
                    <AccordionItem title="4. Year Labels" isOpen={openDesignSection === 'year_labels'} onToggle={() => toggleAccordion('year_labels')}>
                       <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Color</label>
                                <input type="color" className="w-full h-8 cursor-pointer border border-slate-200 rounded p-0.5" value={overlayConfig.timelineYearColor} onChange={e => setOverlayConfig(p => ({...p, timelineYearColor: e.target.value}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Size (px)</label>
                                <input type="number" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.timelineYearFontSize} onChange={e => setOverlayConfig(p => ({...p, timelineYearFontSize: parseInt(e.target.value)}))} />
                             </div>
                          </div>
                          <div>
                            <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Year Font Weight</label>
                            <input type="text" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.timelineYearFontWeight} onChange={e => setOverlayConfig(p => ({...p, timelineYearFontWeight: e.target.value}))} />
                          </div>
                       </div>
                    </AccordionItem>

                    {/* 5. MONTH BLOCK APPEARANCE */}
                    <AccordionItem title="5. Month Block Appearance" isOpen={openDesignSection === 'months_design'} onToggle={() => toggleAccordion('months_design')}>
                       <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Active BG</label>
                                <input type="color" className="w-full h-8 cursor-pointer border border-slate-200 rounded p-0.5" value={overlayConfig.monthActiveBg} onChange={e => setOverlayConfig(p => ({...p, monthActiveBg: e.target.value}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Inactive BG</label>
                                <input type="color" className="w-full h-8 cursor-pointer border border-slate-200 rounded p-0.5" value={overlayConfig.monthInactiveBg} onChange={e => setOverlayConfig(p => ({...p, monthInactiveBg: e.target.value}))} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Past BG</label>
                                <input type="color" className="w-full h-8 cursor-pointer border border-slate-200 rounded p-0.5" value={overlayConfig.monthPastBg} onChange={e => setOverlayConfig(p => ({...p, monthPastBg: e.target.value}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Next BG</label>
                                <input type="color" className="w-full h-8 cursor-pointer border border-slate-200 rounded p-0.5" value={overlayConfig.monthNextBg} onChange={e => setOverlayConfig(p => ({...p, monthNextBg: e.target.value}))} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Text Color</label>
                                <input type="color" className="w-full h-8 cursor-pointer border border-slate-200 rounded p-0.5" value={overlayConfig.monthTextColor} onChange={e => setOverlayConfig(p => ({...p, monthTextColor: e.target.value}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Radius (px)</label>
                                <input type="number" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.monthBorderRadius} onChange={e => setOverlayConfig(p => ({...p, monthBorderRadius: parseInt(e.target.value)}))} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Active Scal: {overlayConfig.monthActiveScale}x</label>
                                <input type="range" min="1" max="2" step="0.05" className="w-full h-4 accent-blue-600" value={overlayConfig.monthActiveScale} onChange={e => setOverlayConfig(p => ({...p, monthActiveScale: parseFloat(e.target.value)}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Inactive Scal: {overlayConfig.monthInactiveScale}x</label>
                                <input type="range" min="0.5" max="1" step="0.05" className="w-full h-4 accent-blue-600" value={overlayConfig.monthInactiveScale} onChange={e => setOverlayConfig(p => ({...p, monthInactiveScale: parseFloat(e.target.value)}))} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Active Font</label>
                                <input type="number" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.monthActiveFontSize} onChange={e => setOverlayConfig(p => ({...p, monthActiveFontSize: parseInt(e.target.value)}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Inact Font</label>
                                <input type="number" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.timelineMonthFontSize} onChange={e => setOverlayConfig(p => ({...p, timelineMonthFontSize: parseInt(e.target.value)}))} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                               <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Month Opacity: {Math.round(overlayConfig.timelineMonthOpacity * 100)}%</label>
                               <input type="range" min="0" max="1" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.timelineMonthOpacity} onChange={e => setOverlayConfig(p => ({...p, timelineMonthOpacity: parseFloat(e.target.value)}))} />
                            </div>
                            <div>
                              <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Weight</label>
                              <input type="text" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.timelineMonthFontWeight} onChange={e => setOverlayConfig(p => ({...p, timelineMonthFontWeight: e.target.value}))} />
                            </div>
                          </div>
                       </div>
                    </AccordionItem>

                    {/* 6. PROJECT PROGRESS CIRCLE */}
                    <AccordionItem title="6. Project Progress Circle" isOpen={openDesignSection === 'circle'} onToggle={() => toggleAccordion('circle')}>
                       <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Circle Color</label>
                                <input type="color" className="w-full h-8 cursor-pointer border border-slate-200 rounded p-0.5" value={overlayConfig.circleColor} onChange={e => setOverlayConfig(p => ({...p, circleColor: e.target.value}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Opacity: {Math.round(overlayConfig.circleOpacity * 100)}%</label>
                                <input type="range" min="0" max="1" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.circleOpacity} onChange={e => setOverlayConfig(p => ({...p, circleOpacity: parseFloat(e.target.value)}))} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">X Pos: {Math.round(overlayConfig.circleX * 100)}%</label>
                                <input type="range" min="0" max="1" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.circleX} onChange={e => setOverlayConfig(p => ({...p, circleX: parseFloat(e.target.value)}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Y Pos: {Math.round(overlayConfig.circleY * 100)}%</label>
                                <input type="range" min="0" max="1" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.circleY} onChange={e => setOverlayConfig(p => ({...p, circleY: parseFloat(e.target.value)}))} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Scale: {overlayConfig.circleScale}x</label>
                                <input type="range" min="0.5" max="3" step="0.1" className="w-full h-4 accent-blue-600" value={overlayConfig.circleScale} onChange={e => setOverlayConfig(p => ({...p, circleScale: parseFloat(e.target.value)}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Stroke (px)</label>
                                <input type="number" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.progressStrokeWidth} onChange={e => setOverlayConfig(p => ({...p, progressStrokeWidth: parseInt(e.target.value)}))} />
                             </div>
                          </div>
                       </div>
                    </AccordionItem>

                    {/* 7. CIRCLE BACKGROUND */}
                    <AccordionItem title="7. Circle Background" isOpen={openDesignSection === 'circle_rect'} onToggle={() => toggleAccordion('circle_rect')}>
                       <div className="space-y-4">
                          <div className="flex items-center justify-between">
                             <label className="text-[9px] font-bold text-slate-500 uppercase">Show Rectangle</label>
                             <input type="checkbox" className="w-4 h-4 accent-blue-600 rounded" checked={overlayConfig.circleRectShow} onChange={e => setOverlayConfig(p => ({...p, circleRectShow: e.target.checked}))} />
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Rect Color</label>
                                <input type="color" className="w-full h-8 cursor-pointer border border-slate-200 rounded p-0.5" value={overlayConfig.circleRectColor} onChange={e => setOverlayConfig(p => ({...p, circleRectColor: e.target.value}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Opacity: {Math.round(overlayConfig.circleRectOpacity * 100)}%</label>
                                <input type="range" min="0" max="1" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.circleRectOpacity} onChange={e => setOverlayConfig(p => ({...p, circleRectOpacity: parseFloat(e.target.value)}))} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Width (px)</label>
                                <input type="number" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.circleRectWidth} onChange={e => setOverlayConfig(p => ({...p, circleRectWidth: parseInt(e.target.value)}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Height (px)</label>
                                <input type="number" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.circleRectHeight} onChange={e => setOverlayConfig(p => ({...p, circleRectHeight: parseInt(e.target.value)}))} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">X: {Math.round(overlayConfig.circleRectX * 100)}%</label>
                                <input type="range" min="0" max="1" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.circleRectX} onChange={e => setOverlayConfig(p => ({...p, circleRectX: parseFloat(e.target.value)}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Y: {Math.round(overlayConfig.circleRectY * 100)}%</label>
                                <input type="range" min="0" max="1" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.circleRectY} onChange={e => setOverlayConfig(p => ({...p, circleRectY: parseFloat(e.target.value)}))} />
                             </div>
                          </div>
                          <div>
                             <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Border Radius (px)</label>
                             <input type="number" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.circleRectBorderRadius} onChange={e => setOverlayConfig(p => ({...p, circleRectBorderRadius: parseInt(e.target.value)}))} />
                          </div>
                       </div>
                    </AccordionItem>

                    {/* 8. CIRCLE LABELS */}
                    <AccordionItem title="8. Circle Labels" isOpen={openDesignSection === 'circle_labels'} onToggle={() => toggleAccordion('circle_labels')}>
                       <div className="space-y-4">
                          <div className="flex items-center justify-between">
                             <label className="text-[9px] font-bold text-slate-500 uppercase">Show Label</label>
                             <input type="checkbox" className="w-4 h-4 accent-blue-600 rounded" checked={overlayConfig.circleShowLabel} onChange={e => setOverlayConfig(p => ({...p, circleShowLabel: e.target.checked}))} />
                          </div>
                          <div>
                             <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Position</label>
                             <select className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.circleLabelPosition} onChange={e => setOverlayConfig(p => ({...p, circleLabelPosition: e.target.value as any}))}>
                                <option value="top">Top</option>
                                <option value="bottom">Bottom</option>
                                <option value="left">Left</option>
                                <option value="right">Right</option>
                             </select>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Distance (px)</label>
                                <input type="number" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.circleLabelDistance} onChange={e => setOverlayConfig(p => ({...p, circleLabelDistance: parseInt(e.target.value)}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Size (px)</label>
                                <input type="number" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.circleLabelFontSize} onChange={e => setOverlayConfig(p => ({...p, circleLabelFontSize: parseInt(e.target.value)}))} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                               <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Label Color</label>
                               <input type="color" className="w-full h-8 cursor-pointer border border-slate-200 rounded p-0.5" value={overlayConfig.circleLabelColor} onChange={e => setOverlayConfig(p => ({...p, circleLabelColor: e.target.value}))} />
                            </div>
                            <div>
                               <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Font Family</label>
                               <input type="text" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.circleLabelFontFamily} onChange={e => setOverlayConfig(p => ({...p, circleLabelFontFamily: e.target.value}))} />
                            </div>
                          </div>
                          <div className="space-y-2">
                             <input type="text" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold uppercase" placeholder="LINE 1" value={overlayConfig.circleLabelLine1} onChange={e => setOverlayConfig(p => ({...p, circleLabelLine1: e.target.value.toUpperCase()}))} />
                             <input type="text" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold uppercase" placeholder="LINE 2" value={overlayConfig.circleLabelLine2} onChange={e => setOverlayConfig(p => ({...p, circleLabelLine2: e.target.value.toUpperCase()}))} />
                          </div>
                       </div>
                    </AccordionItem>

                    {/* 9. TASK GRAPHICS */}
                    <AccordionItem title="9. Task Graphics" isOpen={openDesignSection === 'task_design'} onToggle={() => toggleAccordion('task_design')}>
                       <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">X Pos: {Math.round(overlayConfig.taskX * 100)}%</label>
                                <input type="range" min="0" max="1" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.taskX} onChange={e => setOverlayConfig(p => ({...p, taskX: parseFloat(e.target.value)}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Y Pos: {Math.round(overlayConfig.taskY * 100)}%</label>
                                <input type="range" min="0" max="1" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.taskY} onChange={e => setOverlayConfig(p => ({...p, taskY: parseFloat(e.target.value)}))} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Circle Scale</label>
                                <input type="number" step="0.1" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.taskCircleScale} onChange={e => setOverlayConfig(p => ({...p, taskCircleScale: parseFloat(e.target.value)}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Primary Color</label>
                                <input type="color" className="w-full h-8 cursor-pointer border border-slate-200 rounded p-0.5" value={overlayConfig.taskPrimaryColor} onChange={e => setOverlayConfig(p => ({...p, taskPrimaryColor: e.target.value}))} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                               <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Circle BG</label>
                               <input type="color" className="w-full h-8 cursor-pointer border border-slate-200 rounded p-0.5" value={overlayConfig.taskCircleBgColor} onChange={e => setOverlayConfig(p => ({...p, taskCircleBgColor: e.target.value}))} />
                            </div>
                            <div>
                               <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Total Opacity: {Math.round(overlayConfig.taskOpacity * 100)}%</label>
                               <input type="range" min="0" max="1" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.taskOpacity} onChange={e => setOverlayConfig(p => ({...p, taskOpacity: parseFloat(e.target.value)}))} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Label BG</label>
                                <input type="color" className="w-full h-8 cursor-pointer border border-slate-200 rounded p-0.5" value={overlayConfig.taskLabelBgColor} onChange={e => setOverlayConfig(p => ({...p, taskLabelBgColor: e.target.value}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Label Opacity: {Math.round(overlayConfig.taskLabelBgOpacity * 100)}%</label>
                                <input type="range" min="0" max="1" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.taskLabelBgOpacity} onChange={e => setOverlayConfig(p => ({...p, taskLabelBgOpacity: parseFloat(e.target.value)}))} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Label Pos</label>
                                <select className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.taskLabelPosition} onChange={e => setOverlayConfig(p => ({...p, taskLabelPosition: e.target.value as any}))}>
                                   <option value="top">Top</option>
                                   <option value="bottom">Bottom</option>
                                   <option value="left">Left</option>
                                   <option value="right">Right</option>
                                </select>
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Spacing Y: {Math.round(overlayConfig.taskSpacingY * 100)}%</label>
                                <input type="range" min="0.05" max="0.4" step="0.01" className="w-full h-4 accent-blue-600" value={overlayConfig.taskSpacingY} onChange={e => setOverlayConfig(p => ({...p, taskSpacingY: parseFloat(e.target.value)}))} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Task Size</label>
                                <input type="number" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.taskFontSize} onChange={e => setOverlayConfig(p => ({...p, taskFontSize: parseInt(e.target.value)}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">% Size</label>
                                <input type="number" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.taskPercentFontSize} onChange={e => setOverlayConfig(p => ({...p, taskPercentFontSize: parseInt(e.target.value)}))} />
                             </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Font Family</label>
                                <input type="text" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.taskFontFamily} onChange={e => setOverlayConfig(p => ({...p, taskFontFamily: e.target.value}))} />
                             </div>
                             <div>
                                <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Font Weight</label>
                                <input type="text" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.taskFontWeight} onChange={e => setOverlayConfig(p => ({...p, taskFontWeight: e.target.value}))} />
                             </div>
                          </div>
                          <div className="flex items-center justify-between">
                             <label className="text-[9px] font-bold text-slate-500 uppercase">Show Label Border</label>
                             <input type="checkbox" className="w-4 h-4 accent-blue-600 rounded" checked={overlayConfig.taskLabelBorderShow} onChange={e => setOverlayConfig(p => ({...p, taskLabelBorderShow: e.target.checked}))} />
                          </div>
                       </div>
                    </AccordionItem>

                    {/* 10. NARRATION BAR */}
                    <AccordionItem title="10. Narration Bar" isOpen={openDesignSection === 'narration_bar'} onToggle={() => toggleAccordion('narration_bar')}>
                       <div className="space-y-4">
                          <div className="flex items-center justify-between">
                             <label className="text-[9px] font-bold text-slate-500 uppercase">Show Narration Bar</label>
                             <input type="checkbox" className="w-4 h-4 accent-blue-600 rounded" checked={overlayConfig.narrationBarShow} onChange={e => setOverlayConfig(p => ({...p, narrationBarShow: e.target.checked}))} />
                          </div>
                          
                          <div>
                             <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Font Family</label>
                             <input type="text" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.narrationFontFamily} onChange={e => setOverlayConfig(p => ({...p, narrationFontFamily: e.target.value}))} />
                          </div>
                          
                          <div>
                             <label className="text-[8px] font-bold text-slate-400 block mb-1 uppercase">Font Size (px)</label>
                             <input type="number" className="w-full p-2 border border-slate-200 rounded text-[10px] font-bold" value={overlayConfig.narrationFontSize} onChange={e => setOverlayConfig(p => ({...p, narrationFontSize: parseInt(e.target.value)}))} />
                          </div>
                       </div>
                    </AccordionItem>
                 </div>
                 
                 <div className="p-4 border-t border-slate-100 bg-slate-50">
                    <button onClick={() => {if(confirm('Reset all design settings?')) setOverlayConfig(DEFAULT_CONFIG)}} className="w-full py-2 bg-slate-200 text-slate-600 text-[10px] font-black rounded uppercase hover:bg-slate-300 transition-colors">RESET TO DEFAULT</button>
                 </div>
               </div>
             )}
             
             {activeTab === 'months' && (
               <div className="p-4 flex flex-col gap-3">
                  {projectMonths.map((m, i) => {
                    const monthKeyframes = keyframes.filter(k => isSameMonth(k.startDate, m));
                    const isCurrent = isSameMonth(m, currentDate);
                    // Use Max value so user sees the "highest" progress this month reaches, revealing data discrepancies
                    const currentMonthProgress = monthKeyframes.length > 0 ? Math.max(...monthKeyframes.map(k => k.progress)) : 0;
                    const representativeKeyframe = monthKeyframes[0]; // Used for ID reference for updates
                    
                    const monthStart = new Date(m.getFullYear(), m.getMonth(), 1).getTime();
                    const monthEnd = new Date(m.getFullYear(), m.getMonth() + 1, 0).getTime();
                    
                    const activeTasks = tasks.filter(t => {
                        const tStart = new Date(t.startDate).getTime();
                        const tEnd = new Date(t.endDate).getTime();
                        return (tStart <= monthEnd && tEnd >= monthStart);
                    });

                    return (
                      <div key={i} className={`p-4 rounded-xl border transition-all ${isCurrent ? 'bg-white border-blue-500 shadow-xl' : 'bg-slate-50 border-slate-100'}`}>
                         <div onClick={() => setCurrentDate(m)} className="flex justify-between items-center mb-4 cursor-pointer">
                            <span className="text-[12px] font-black uppercase tracking-tighter text-slate-800">{m.toLocaleString('en-US', { month: 'long', year: 'numeric' })}</span>
                         </div>
                         
                         {/* MAIN PROGRESS CONTROL IN MONTHS TAB */}
                         <div className="mb-4">
                            <div className="flex justify-between items-center mb-1.5">
                               <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Project Progress</span>
                               <span className="text-[10px] font-black text-blue-600">{currentMonthProgress}%</span>
                            </div>
                            
                            {representativeKeyframe ? (
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="range" 
                                        min="0" 
                                        max="100" 
                                        step="0.1"
                                        value={currentMonthProgress}
                                        onChange={(e) => updateMonthProgress(representativeKeyframe.id, parseFloat(e.target.value))}
                                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                    <input 
                                        type="number"
                                        min="0"
                                        max="100"
                                        step="0.1"
                                        value={currentMonthProgress}
                                        onChange={(e) => updateMonthProgress(representativeKeyframe.id, parseFloat(e.target.value))}
                                        className="w-16 p-1 text-[10px] font-bold border border-slate-200 rounded text-center focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                            ) : (
                                <div className="p-2 bg-slate-100 rounded text-[9px] text-slate-400 italic text-center">
                                    No Stage Data for this month
                                </div>
                            )}
                         </div>
                         
                         {activeTasks.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                                <h4 className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">Task Progress ({activeTasks.length})</h4>
                                {activeTasks.map(t => {
                                    const progress = getTaskProgress(t, m);
                                    return (
                                        <div key={t.id} className="flex items-center justify-between py-1 border-b border-slate-50 last:border-0 hover:bg-slate-50/50 rounded px-1 -mx-1 transition-colors">
                                            <span className="text-[9px] font-bold text-slate-600 uppercase truncate max-w-[60%]" title={t.name}>{t.name}</span>
                                            
                                            <div 
                                                onClick={(e) => {
                                                   e.stopPropagation();
                                                   setEditState({
                                                       type: 'task-progress-month',
                                                       id: t.id,
                                                       label: `EDIT ${t.name} PROGRESS (%)`,
                                                       value: progress.toString(),
                                                       dateContext: m
                                                   });
                                                   setModalInputValue(progress.toString());
                                                }}
                                                className="cursor-pointer group/task flex items-center gap-1 bg-white border border-slate-200 px-2 py-0.5 rounded hover:border-blue-400 transition-colors shadow-sm"
                                            >
                                                <span className="text-[9px] font-black text-slate-700 group-hover/task:text-blue-600">{progress}%</span>
                                                <svg className="w-2.5 h-2.5 text-slate-300 group-hover/task:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                         )}
                      </div>
                    );
                  })}
               </div>
             )}
          </div>
        </aside>
        </>
        )}
      </div>

      {/* Modal and Export UI Overlay */}
      {editState && (
        <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setEditState(null)}>
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                 <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">{editState.label}</h3>
                 <button onClick={() => setEditState(null)} className="text-slate-400 hover:text-red-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                 </button>
              </div>
              <div className="p-4">
                 <input 
                    autoFocus
                    className="w-full text-lg font-bold text-slate-800 border-b-2 border-slate-200 focus:border-blue-500 outline-none py-2 bg-transparent transition-colors placeholder-slate-300"
                    value={modalInputValue}
                    onChange={(e) => setModalInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleModalSave(); }}
                    placeholder="Enter value..."
                 />
                 <div className="flex justify-end gap-2 mt-6">
                    <button onClick={() => setEditState(null)} className="px-4 py-2 text-[9px] font-black uppercase text-slate-400 hover:bg-slate-50 rounded">Cancel</button>
                    <button onClick={handleModalSave} className="px-6 py-2 bg-blue-600 text-white text-[9px] font-black uppercase rounded shadow-lg hover:bg-blue-700 transform active:scale-95 transition-all">Save Changes</button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Export Canvas & Status */}
      <canvas ref={exportCanvasRef} className="hidden" />

      {isExporting !== GenerationStatus.IDLE && (
         <div className="fixed inset-0 z-[300] bg-slate-900 flex flex-col items-center justify-center">
             {isExporting === GenerationStatus.GENERATING && (
                 <>
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-8"></div>
                    <div className="text-2xl font-black text-white mb-2 tracking-tight uppercase">RENDERING VIDEO</div>
                    <div className="text-sm font-bold text-blue-400 uppercase tracking-widest animate-pulse">{statusMessage}</div>
                 </>
             )}
             
             {isExporting === GenerationStatus.SUCCESS && generatedVideoUrl && (
                 <div className="flex flex-col items-center max-w-2xl w-full px-8">
                    <div className="text-3xl font-black text-green-400 mb-2 uppercase tracking-tight">RENDER COMPLETE</div>
                    <p className="text-slate-400 mb-8 text-sm font-medium">Your project sequence has been successfully compiled.</p>
                    
                    <video 
                      src={generatedVideoUrl} 
                      controls 
                      className="w-full aspect-video bg-black rounded-lg shadow-2xl border border-slate-700 mb-8"
                    />
                    
                    <div className="flex gap-4">
                       <button onClick={() => { setIsExporting(GenerationStatus.IDLE); setGeneratedVideoUrl(null); }} className="px-6 py-3 bg-slate-800 text-slate-300 font-black text-xs rounded uppercase hover:bg-slate-700 transition-colors">
                          CLOSE
                       </button>
                       <a 
                         href={generatedVideoUrl} 
                         download={`construction_sequence.${outputExtension}`}
                         className="px-8 py-3 bg-green-600 text-white font-black text-xs rounded uppercase hover:bg-green-700 shadow-lg transition-transform hover:scale-105"
                         onClick={() => setTimeout(() => setIsExporting(GenerationStatus.IDLE), 1000)}
                       >
                          DOWNLOAD FILE
                       </a>
                    </div>
                 </div>
             )}
         </div>
      )}

    </div>
  );
};

export default App;
