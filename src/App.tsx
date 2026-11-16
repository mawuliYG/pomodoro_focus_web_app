import { useState, useEffect, useCallback, useRef } from 'react';

// Types
type TimerMode = 'focus' | 'shortBreak' | 'longBreak';

interface TimerSettings {
  focus: number;
  shortBreak: number;
  longBreak: number;
  longBreakInterval: number;
}

interface FocusSession {
  date: string;
  duration: number; // in seconds
  completedAt: number;
}

interface Stats {
  sessions: FocusSession[];
}

// Helper functions
const getTodayKey = (): string => {
  return new Date().toISOString().split('T')[0];
};

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const formatMinutes = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
};

// LocalStorage helpers
const STORAGE_KEYS = {
  SETTINGS: 'pomodoro-settings',
  STATS: 'pomodoro-stats',
};

const loadSettings = (): TimerSettings => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load settings', e);
  }
  return { focus: 25, shortBreak: 5, longBreak: 15, longBreakInterval: 4 };
};

const saveSettings = (settings: TimerSettings): void => {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
};

const loadStats = (): Stats => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.STATS);
    if (stored) return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load stats', e);
  }
  return { sessions: [] };
};

const saveStats = (stats: Stats): void => {
  localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));
};

// Mode config
const MODE_CONFIG: Record<TimerMode, { label: string; color: string; bgGradient: string; ringColor: string; icon: string }> = {
  focus: {
    label: 'Focus',
    color: 'text-rose-600',
    bgGradient: 'from-rose-50 to-orange-50',
    ringColor: 'stroke-rose-500',
    icon: '🎯',
  },
  shortBreak: {
    label: 'Short Break',
    color: 'text-emerald-600',
    bgGradient: 'from-emerald-50 to-teal-50',
    ringColor: 'stroke-emerald-500',
    icon: '☕',
  },
  longBreak: {
    label: 'Long Break',
    color: 'text-blue-600',
    bgGradient: 'from-blue-50 to-indigo-50',
    ringColor: 'stroke-blue-500',
    icon: '🌿',
  },
};

export default function App() {
  const [settings, setSettings] = useState<TimerSettings>(loadSettings);
  const [stats, setStats] = useState<Stats>(loadStats);
  const [mode, setMode] = useState<TimerMode>('focus');
  const [timeLeft, setTimeLeft] = useState(settings.focus * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [completedPomodoros, setCompletedPomodoros] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [tempSettings, setTempSettings] = useState<TimerSettings>(settings);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartRef = useRef<number | null>(null);

  const totalTime = mode === 'focus' ? settings.focus * 60 :
    mode === 'shortBreak' ? settings.shortBreak * 60 :
    settings.longBreak * 60;

  const progress = (totalTime - timeLeft) / totalTime;

  // Today's stats
  const todaySessions = stats.sessions.filter(s => s.date === getTodayKey());
  const todayFocusSeconds = todaySessions.reduce((sum, s) => sum + s.duration, 0);
  const todayPomodoros = todaySessions.length;

  // Timer logic
  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const handleTimerComplete = useCallback(() => {
    clearTimer();
    setIsRunning(false);

    if (mode === 'focus') {
      // Record completed focus session
      const duration = settings.focus * 60;
      const newSession: FocusSession = {
        date: getTodayKey(),
        duration,
        completedAt: Date.now(),
      };
      const newStats = { ...stats, sessions: [...stats.sessions, newSession] };
      setStats(newStats);
      saveStats(newStats);

      const newPomodoros = completedPomodoros + 1;
      setCompletedPomodoros(newPomodoros);

      // Auto switch to break
      if (newPomodoros % settings.longBreakInterval === 0) {
        setMode('longBreak');
        setTimeLeft(settings.longBreak * 60);
      } else {
        setMode('shortBreak');
        setTimeLeft(settings.shortBreak * 60);
      }
    } else {
      // Switch back to focus
      setMode('focus');
      setTimeLeft(settings.focus * 60);
    }

    // Play notification sound
    try {
      const audioCtx = new AudioContext();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      // Audio not available
    }
  }, [mode, settings, stats, completedPomodoros, clearTimer]);

  useEffect(() => {
    if (isRunning) {
      if (!sessionStartRef.current && mode === 'focus') {
        sessionStartRef.current = Date.now();
      }
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleTimerComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearTimer();
    }
    return clearTimer;
  }, [isRunning, handleTimerComplete, clearTimer]);

  const handleStart = () => setIsRunning(true);
  const handlePause = () => {
    setIsRunning(false);
    sessionStartRef.current = null;
  };
  const handleReset = () => {
    setIsRunning(false);
    sessionStartRef.current = null;
    clearTimer();
    if (mode === 'focus') setTimeLeft(settings.focus * 60);
    else if (mode === 'shortBreak') setTimeLeft(settings.shortBreak * 60);
    else setTimeLeft(settings.longBreak * 60);
  };

  const handleModeChange = (newMode: TimerMode) => {
    setIsRunning(false);
    sessionStartRef.current = null;
    clearTimer();
    setMode(newMode);
    if (newMode === 'focus') setTimeLeft(settings.focus * 60);
    else if (newMode === 'shortBreak') setTimeLeft(settings.shortBreak * 60);
    else setTimeLeft(settings.longBreak * 60);
  };

  const handleSaveSettings = () => {
    setSettings(tempSettings);
    saveSettings(tempSettings);
    setShowSettings(false);
    // Reset timer with new settings
    setIsRunning(false);
    sessionStartRef.current = null;
    clearTimer();
    if (mode === 'focus') setTimeLeft(tempSettings.focus * 60);
    else if (mode === 'shortBreak') setTimeLeft(tempSettings.shortBreak * 60);
    else setTimeLeft(tempSettings.longBreak * 60);
  };

  // SVG circle calculations
  const radius = 120;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const config = MODE_CONFIG[mode];

  return (
    <div className={`min-h-screen bg-gradient-to-br ${config.bgGradient} transition-all duration-700 flex flex-col`}>
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🍅</span>
          <h1 className="text-xl font-bold text-gray-800">Pomodoro Focus</h1>
        </div>
        <button
          onClick={() => {
            setTempSettings(settings);
            setShowSettings(!showSettings);
          }}
          className="p-2 rounded-lg hover:bg-white/60 transition-colors text-gray-600 hover:text-gray-800"
          title="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 pb-8">
        {/* Mode Tabs */}
        <div className="flex gap-2 mb-8 bg-white/50 backdrop-blur-sm rounded-xl p-1.5 shadow-sm">
          {(Object.keys(MODE_CONFIG) as TimerMode[]).map((m) => (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === m
                  ? 'bg-white shadow-sm text-gray-800'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'
              }`}
            >
              <span className="mr-1.5">{MODE_CONFIG[m].icon}</span>
              {MODE_CONFIG[m].label}
            </button>
          ))}
        </div>

        {/* Timer Circle */}
        <div className="relative mb-8">
          <svg className="w-72 h-72 -rotate-90" viewBox="0 0 280 280">
            {/* Background circle */}
            <circle
              cx="140"
              cy="140"
              r={radius}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="8"
            />
            {/* Progress circle */}
            <circle
              cx="140"
              cy="140"
              r={radius}
              fill="none"
              className={`${config.ringColor} transition-all duration-1000`}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          {/* Timer display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-6xl font-mono font-bold text-gray-800 tracking-wider">
              {formatTime(timeLeft)}
            </span>
            <span className={`text-sm font-medium mt-2 ${config.color}`}>
              {config.label}
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={handleReset}
            className="w-12 h-12 rounded-full bg-white/70 hover:bg-white shadow-sm flex items-center justify-center text-gray-600 hover:text-gray-800 transition-all"
            title="Reset"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>

          <button
            onClick={isRunning ? handlePause : handleStart}
            className={`w-16 h-16 rounded-full shadow-lg flex items-center justify-center text-white transition-all transform hover:scale-105 active:scale-95 ${
              mode === 'focus' ? 'bg-rose-500 hover:bg-rose-600' :
              mode === 'shortBreak' ? 'bg-emerald-500 hover:bg-emerald-600' :
              'bg-blue-500 hover:bg-blue-600'
            }`}
            title={isRunning ? 'Pause' : 'Start'}
          >
            {isRunning ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => {
              // Skip to next mode
              setIsRunning(false);
              sessionStartRef.current = null;
              clearTimer();
              if (mode === 'focus') {
                if ((completedPomodoros + 1) % settings.longBreakInterval === 0) {
                  setMode('longBreak');
                  setTimeLeft(settings.longBreak * 60);
                } else {
                  setMode('shortBreak');
                  setTimeLeft(settings.shortBreak * 60);
                }
              } else {
                setMode('focus');
                setTimeLeft(settings.focus * 60);
              }
            }}
            className="w-12 h-12 rounded-full bg-white/70 hover:bg-white shadow-sm flex items-center justify-center text-gray-600 hover:text-gray-800 transition-all"
            title="Skip"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Pomodoro counter */}
        <div className="flex items-center gap-2 mb-6">
          <span className="text-sm text-gray-500">Pomodoros today:</span>
          <div className="flex gap-1">
            {Array.from({ length: Math.max(settings.longBreakInterval, todayPomodoros) }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full transition-all ${
                  i < todayPomodoros ? 'bg-rose-400' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Stats Panel */}
        <div className="w-full max-w-md bg-white/60 backdrop-blur-sm rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
            <span>📊</span> Today's Focus
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800">{todayPomodoros}</div>
              <div className="text-xs text-gray-500 mt-1">Sessions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800">{formatMinutes(todayFocusSeconds)}</div>
              <div className="text-xs text-gray-500 mt-1">Focus Time</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-800">{completedPomodoros}</div>
              <div className="text-xs text-gray-500 mt-1">Completed</div>
            </div>
          </div>

          {/* Session history */}
          {todaySessions.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200/50">
              <div className="text-xs text-gray-500 mb-2">Recent sessions</div>
              <div className="flex flex-wrap gap-1.5">
                {todaySessions.slice(-8).map((session, i) => (
                  <div
                    key={i}
                    className="px-2 py-1 bg-rose-100 text-rose-700 text-xs rounded-md font-medium"
                  >
                    {formatMinutes(session.duration)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-gray-800">⚙️ Timer Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-500"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Focus Duration (minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={tempSettings.focus}
                  onChange={(e) => setTempSettings({ ...tempSettings, focus: Math.max(1, Math.min(120, parseInt(e.target.value) || 1)) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Short Break (minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={tempSettings.shortBreak}
                  onChange={(e) => setTempSettings({ ...tempSettings, shortBreak: Math.max(1, Math.min(30, parseInt(e.target.value) || 1)) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Long Break (minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={tempSettings.longBreak}
                  onChange={(e) => setTempSettings({ ...tempSettings, longBreak: Math.max(1, Math.min(60, parseInt(e.target.value) || 1)) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Long Break After (pomodoros)
                </label>
                <input
                  type="number"
                  min={2}
                  max={10}
                  value={tempSettings.longBreakInterval}
                  onChange={(e) => setTempSettings({ ...tempSettings, longBreakInterval: Math.max(2, Math.min(10, parseInt(e.target.value) || 2)) })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-400"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 font-medium transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
