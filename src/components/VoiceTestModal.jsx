import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Bot,
  User,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Send,
  CheckCircle2,
  AudioWaveform,
  Activity,
  Languages
} from 'lucide-react';
import {
  resolveLockedVoice,
  resolveVoiceForText,
  speakTextWithWatchdog,
  stopCurrentSpeech,
  detectTextLanguage
} from '../utils/voiceConsistency';
import { generateAIResponse, getUserApiKeys, transcribeAudioWithGroqWhisper } from '../services/aiCompletionService';

export default function VoiceTestModal({ isOpen, onClose, assistant }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0); // 0 to 100
  const [micPermission, setMicPermission] = useState('prompt'); // 'prompt' | 'granted' | 'denied'
  const [errorMessage, setErrorMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [textInput, setTextInput] = useState('');
  const [selectedLang, setSelectedLang] = useState('auto'); // 'auto' | 'en-IN' | 'hi-IN' | 'mr-IN'
  const [detectedLangBadge, setDetectedLangBadge] = useState('');

  // Audio / Speech Refs
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const recognitionRef = useRef(null);
  const recordedTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const lastDetectedLangRef = useRef('en-IN');
  const speechHandledRef = useRef(false);
  const messagesRef = useRef([]);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const assistantName = assistant?.name || 'Voice Assistant';
  const assistantVoice = assistant?.voice || 'Adam';
  const assistantRole = assistant?.role || 'Customer Assistant';

  // Initialize and clean up on modal open / close
  useEffect(() => {
    if (!isOpen) {
      stopRecordingSession();
      if (synthRef.current) synthRef.current.cancel();
      return;
    }

    // Set initial greeting
    const greeting = assistant?.greeting || `Hello! I'm ${assistantName}, your ${assistantRole}. How can I assist you today?`;
    setMessages([
      {
        id: 'greet-1',
        sender: 'assistant',
        text: greeting,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    speakText(greeting);

    return () => {
      stopRecordingSession();
      if (synthRef.current) synthRef.current.cancel();
    };
  }, [isOpen, assistant?.id]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimTranscript, isThinking]);

  // Cleanly stops all active recording, audio analysis, and speech recognition
  const stopRecordingSession = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch (e) {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) {}
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch (e) {}
      audioContextRef.current = null;
    }
    stopCurrentSpeech();
    setIsRecording(false);
    setAudioLevel(0);
  };

  // Speak text using the assistant's locked persona voice with GC pinning, heartbeat & watchdog
  const speakText = (text) => {
    if (!text) return;
    speakTextWithWatchdog(text, assistantVoice, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false)
    });
  };

  // Start recording audio + Speech Recognition
  const startRecordingSession = async () => {
    stopCurrentSpeech();
    setIsSpeaking(false);
    setErrorMessage('');
    setInterimTranscript('');
    speechHandledRef.current = false;
    recordedTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    audioChunksRef.current = [];

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      mediaStreamRef.current = stream;
      setMicPermission('granted');
    } catch (permErr) {
      console.warn('Microphone permission error:', permErr);
      setMicPermission('denied');
      setErrorMessage('Microphone access was denied. Please allow microphone access in your browser URL bar.');
      return;
    }

    // 1. Setup AudioContext & Analyser to measure real-time mic volume
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        analyserRef.current = analyser;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((acc, val) => acc + val, 0);
          const avg = sum / dataArray.length;
          // Scale avg (0-255) to 0-100
          const level = Math.min(100, Math.round((avg / 128) * 100));
          setAudioLevel(level);
          animFrameRef.current = requestAnimationFrame(updateLevel);
        };
        updateLevel();
      }
    } catch (audioErr) {
      console.warn('AudioContext visualization setup note:', audioErr);
    }

    // 2. Setup MediaRecorder for high-reliability audio blob backup (Whisper transcription)
    try {
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
        else mimeType = '';
      }
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (speechHandledRef.current) return;
        const finalChunkBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const activeKey = assistant?.apiKey || getUserApiKeys().groqKey || getUserApiKeys().activeKey || '';

        // 1. Acoustic Auto-Detection with Groq Whisper (Language Identification LID)
        if (finalChunkBlob.size > 1500 && activeKey && activeKey.startsWith('gsk_')) {
          setInterimTranscript('🌐 Auto-detecting voice language with Whisper...');
          try {
            const whisperPromise = transcribeAudioWithGroqWhisper(finalChunkBlob, activeKey, {
              language: selectedLang === 'auto' ? undefined : selectedLang,
              verbose: true
            });
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Whisper timeout')), 5000));
            const whisperRes = await Promise.race([whisperPromise, timeoutPromise]);
            const cleanWhisper = (whisperRes?.text || '').trim();
            const detectedLID = (whisperRes?.language || '').toLowerCase().trim();
            const isSupportedLID = !detectedLID || ['en', 'english', 'hi', 'hindi', 'mr', 'marathi'].includes(detectedLID);

            if (cleanWhisper && !speechHandledRef.current) {
              if (!isSupportedLID) {
                setErrorMessage('Voice input is restricted strictly to English, Hindi (हिंदी), and Marathi (मराठी).');
                setInterimTranscript('');
                return;
              }
              if (detectedLID) {
                const badge = detectedLID.includes('marathi') ? '🚩 मराठी' :
                              detectedLID.includes('hindi') ? '🇮🇳 हिंदी' :
                              detectedLID.includes('english') ? '🇬🇧 English' :
                              '🇮🇳 Indian English';
                setDetectedLangBadge(badge);
              }
              handleUserSpeech(cleanWhisper);
              return;
            }
          } catch (wErr) {
            console.warn('[Whisper LID Error / Timeout]', wErr);
          }
        }

        // 2. Fallback to Browser Speech Recognition
        const capturedSpeech = (recordedTranscriptRef.current || interimTranscriptRef.current || '').trim();
        if (capturedSpeech && !speechHandledRef.current) {
          handleUserSpeech(capturedSpeech);
          return;
        }

        if (!speechHandledRef.current) {
          setInterimTranscript('');
          setErrorMessage('No voice detected. Tap the mic and speak clearly.');
        }
      };

      recorder.start(250);
    } catch (recErr) {
      console.warn('MediaRecorder setup note:', recErr);
    }

    // 3. Setup Browser Speech Recognition (Instant local STT with accent/dialect auto-adaptation)
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        if (recognitionRef.current) {
          try { recognitionRef.current.abort(); } catch (_) {}
          recognitionRef.current = null;
        }
        const rec = new SpeechRec();
        rec.continuous = true;
        rec.interimResults = true;
        const defaultBrowserLang = 'en-IN';
        rec.lang = (selectedLang && selectedLang !== 'auto')
          ? selectedLang
          : (lastDetectedLangRef.current || defaultBrowserLang);

        rec.onstart = () => {
          setIsRecording(true);
        };

        rec.onresult = (event) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const piece = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              recordedTranscriptRef.current += ' ' + piece;
            } else {
              interim += piece;
            }
          }
          const combined = (recordedTranscriptRef.current + ' ' + interim).trim();
          interimTranscriptRef.current = combined;
          setInterimTranscript(combined);
        };

        rec.onerror = (event) => {
          console.warn('[SpeechRec] Error:', event.error);
          if (event.error === 'not-allowed') {
            setErrorMessage('Microphone permission blocked. Please allow mic in your URL bar.');
          }
        };

        recognitionRef.current = rec;
        rec.start();
      } catch (e) {
        console.warn('SpeechRecognition start failed, will rely on MediaRecorder:', e);
      }
    }

    setIsRecording(true);
  };

  // Stop recording and process user speech
  const stopAndSubmitRecording = () => {
    setIsRecording(false);
    const capturedText = (recordedTranscriptRef.current || interimTranscriptRef.current || interimTranscript || '').trim();

    // Stop tracks & audio
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch (e) {}
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    const activeKey = assistant?.apiKey || getUserApiKeys().groqKey || getUserApiKeys().activeKey || '';

    // If Groq key is present and audio chunks were recorded, let recorder.onstop process with Whisper LID
    if (activeKey && activeKey.startsWith('gsk_') && audioChunksRef.current.length > 0) {
      setInterimTranscript('🌐 Auto-detecting voice language & transcribing...');
      return;
    }

    if (capturedText && !speechHandledRef.current) {
      handleUserSpeech(capturedText);
    } else {
      setTimeout(() => {
        if (!recordedTranscriptRef.current.trim() && !speechHandledRef.current) {
          setErrorMessage('No voice detected. Tap the mic and speak clearly.');
        }
      }, 1000);
    }
  };

  // Toggle listening state (Supports instant barge-in if assistant is speaking)
  const handleToggleListen = () => {
    if (isSpeaking) {
      // Instant barge-in: cancel speech and immediately start recording user's new question
      stopCurrentSpeech();
      setIsSpeaking(false);
      startRecordingSession();
      return;
    }
    if (isRecording) {
      stopAndSubmitRecording();
    } else {
      startRecordingSession();
    }
  };

  // Process user speech through AI completion & speak aloud
  const handleUserSpeech = async (spokenText) => {
    if (!spokenText || !spokenText.trim() || speechHandledRef.current) return;
    speechHandledRef.current = true;
    const cleanText = spokenText.trim();
    setInterimTranscript('');
    recordedTranscriptRef.current = '';
    interimTranscriptRef.current = '';

    // Turn-level dynamic language detection & badge update
    const detectedCode = detectTextLanguage(cleanText);
    if (selectedLang === 'auto') {
      if (detectedCode === 'mr-IN') {
        setDetectedLangBadge('🚩 मराठी');
        lastDetectedLangRef.current = 'mr-IN';
      } else if (detectedCode === 'hi-IN') {
        setDetectedLangBadge('🇮🇳 हिंदी');
        lastDetectedLangRef.current = 'hi-IN';
      } else {
        setDetectedLangBadge('🇬🇧 English');
        lastDetectedLangRef.current = 'en-IN';
      }
    }

    const userMsg = {
      id: 'usr-' + Date.now(),
      sender: 'user',
      text: cleanText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);

    try {
      const activeKey = assistant?.apiKey || getUserApiKeys().activeKey || '';
      const reply = await generateAIResponse(
        cleanText,
        assistant?.systemPrompt || `You are ${assistantName}, a helpful AI voice assistant. Respond in 1-2 clear, conversational spoken sentences.`,
        assistant?.knowledgeBase || [],
        activeKey,
        {
          agentName: assistantName,
          databaseRecords: assistant?.databaseRecords || [],
          databaseConfig: assistant?.databaseConfig || null,
          conversationHistory: messagesRef.current
        }
      );

      const replyText = reply || `I heard: "${cleanText}". How else can I help?`;

      const botMsg = {
        id: 'bot-' + Date.now(),
        sender: 'assistant',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, botMsg]);
      speakText(replyText);
    } catch (err) {
      console.error('Error getting response:', err);
      const fallback = `I encountered an issue: ${err.message || 'Please check your API key'}.`;
      setMessages((prev) => [
        ...prev,
        {
          id: 'bot-err-' + Date.now(),
          sender: 'assistant',
          text: fallback,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      speakText(fallback);
    } finally {
      setIsThinking(false);
      speechHandledRef.current = false;
    }
  };

  const handleSendText = () => {
    const trimmed = textInput.trim();
    if (!trimmed) return;
    setTextInput('');
    speechHandledRef.current = false;
    handleUserSpeech(trimmed);
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <AudioWaveform size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">{assistantName}</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Voice: {assistantVoice}
                </span>
                {assistant?.databaseConfig && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    🔥 Live DB: {assistant.databaseConfig.type === 'firebase' ? 'Firebase' : 'Supabase'} ({assistant.databaseConfig.projectId || 'Connected'})
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Live Microphone Tester &amp; Voice Interaction Sandbox
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Multilingual Speech & Output Selector Bar */}
        <div className="px-6 py-2 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-slate-600 font-semibold text-[11px]">
            <Languages size={14} className="text-indigo-600" />
            <span>Voice Language:</span>
            {detectedLangBadge && (
              <span className="ml-1 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold text-[10px]">
                Detected: {detectedLangBadge}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 shadow-2xs">
            {[
              { id: 'auto', label: 'Auto (Auto-Detect)', flag: '🌐' },
              { id: 'en-IN', label: 'English', flag: '🇬🇧' },
              { id: 'hi-IN', label: 'हिंदी', flag: '🇮🇳' },
              { id: 'mr-IN', label: 'मराठी', flag: '🚩' }
            ].map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setSelectedLang(l.id);
                  if (recognitionRef.current && l.id !== 'auto') {
                    recognitionRef.current.lang = l.id;
                  }
                }}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                  selectedLang === l.id
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span className="mr-1">{l.flag}</span>
                <span>{l.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Central Voice Orb & Soundwave Area */}
        <div className="p-6 bg-gradient-to-b from-indigo-50/40 via-white to-white flex flex-col items-center justify-center border-b border-slate-100">
          <div className="relative flex items-center justify-center my-2">
            {/* Animated Pulsing Waves */}
            {(isRecording || isSpeaking) && (
              <div className="absolute w-28 h-28 rounded-full bg-indigo-400/20 animate-ping duration-1000" />
            )}
            {isSpeaking && (
              <div className="absolute w-36 h-36 rounded-full bg-emerald-400/20 animate-pulse duration-700" />
            )}

            {/* Main Interactive Mic Orb */}
            <button
              type="button"
              onClick={handleToggleListen}
              className={`relative z-10 w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all duration-300 shadow-xl cursor-pointer ${
                isRecording
                  ? 'bg-rose-500 text-white shadow-rose-500/30 scale-105 ring-4 ring-rose-300/50'
                  : isSpeaking
                  ? 'bg-emerald-600 text-white shadow-emerald-500/30 scale-105 ring-4 ring-emerald-300/50'
                  : isThinking
                  ? 'bg-amber-500 text-white shadow-amber-500/30 animate-pulse'
                  : 'bg-gradient-to-tr from-indigo-600 to-violet-600 text-white hover:scale-105 hover:shadow-indigo-500/40'
              }`}
              title={isRecording ? 'Click to stop and send voice' : 'Click to start speaking'}
            >
              {isRecording ? (
                <Mic size={28} className="animate-pulse" />
              ) : isSpeaking ? (
                <Volume2 size={28} className="animate-bounce" />
              ) : isThinking ? (
                <Sparkles size={28} className="animate-spin" />
              ) : (
                <Mic size={28} />
              )}
            </button>
          </div>

          {/* Real-Time Microphone Volume Level Bars */}
          {isRecording && (
            <div className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
              <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider mr-1">Mic Level</span>
              {[15, 30, 45, 60, 75, 90].map((threshold, idx) => (
                <div
                  key={idx}
                  style={{
                    height: audioLevel >= threshold ? `${8 + idx * 2.5}px` : '4px',
                    transition: 'height 0.08s ease'
                  }}
                  className={`w-1.5 rounded-full ${audioLevel >= threshold ? 'bg-emerald-600' : 'bg-slate-200'}`}
                />
              ))}
            </div>
          )}

          {/* Dynamic Voice Status Label */}
          <div className="mt-3 text-center">
            <div className="text-xs font-bold text-slate-800">
              {isRecording
                ? 'Recording... Tap again when finished speaking'
                : isSpeaking
                ? `Speaking (${assistantVoice})...`
                : isThinking
                ? 'Thinking...'
                : 'Tap Microphone to Speak'}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isRecording
                ? 'Dual-Engine Voice (Web Speech API + Groq Whisper Backup)'
                : 'Zero-latency browser speech recognition & native synthesis'}
            </p>
          </div>

          {/* Live Interim Speech Transcript Display */}
          {interimTranscript && (
            <div className="mt-3 w-full max-w-sm px-3.5 py-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-medium text-center animate-in fade-in">
              <span className="opacity-75">Hearing: </span>
              <span className="font-semibold italic">"{interimTranscript}"</span>
            </div>
          )}

          {/* Error / Permission Warning */}
          {errorMessage && (
            <div className="mt-3 w-full max-w-sm px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0 text-rose-600" />
              <span className="text-[11.5px] leading-snug">{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Conversation Transcript Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[160px] max-h-[220px] bg-slate-50/50 text-xs">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-2.5 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {m.sender === 'assistant' && (
                <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={13} />
                </div>
              )}
              <div
                className={`px-3.5 py-2 rounded-2xl max-w-[80%] text-xs leading-relaxed shadow-2xs ${
                  m.sender === 'user'
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                }`}
              >
                <div>{m.text}</div>
                <div
                  className={`text-[9.5px] mt-1 text-right ${
                    m.sender === 'user' ? 'text-indigo-200' : 'text-slate-400'
                  }`}
                >
                  {m.timestamp}
                </div>
              </div>
              {m.sender === 'user' && (
                <div className="w-6 h-6 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                  <User size={13} />
                </div>
              )}
            </div>
          ))}
          <div ref={chatBottomRef} />
        </div>

        {/* Text Input Bar with Voice Button on Left of Enter */}
        <div className="p-3 bg-white border-t border-slate-200 flex items-center gap-2">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
            placeholder="Type a test question or tap mic to speak..."
            className="flex-1 h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:bg-white"
          />
          {/* Voice Button on Left of Enter Button */}
          <button
            type="button"
            onClick={handleToggleListen}
            className={`h-9 w-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
              isRecording
                ? 'bg-rose-50 border-rose-300 text-rose-600 animate-pulse ring-2 ring-rose-400/20'
                : isSpeaking
                ? 'bg-emerald-50 border-emerald-300 text-emerald-600'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-700'
            }`}
            title={isRecording ? 'Click to stop speaking' : 'Click to speak (English | हिंदी | मराठी)'}
          >
            <Mic size={15} className={isRecording ? 'animate-pulse text-rose-600' : ''} />
          </button>
          {/* Enter / Send Button */}
          <button
            type="button"
            onClick={handleSendText}
            className="h-9 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-1 cursor-pointer transition-colors shadow-2xs shrink-0"
            title="Send message"
          >
            <span>Send</span>
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
