import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface SolvePromptProps {
  language: string | null;
  confidence: number;
  snippet: string;
  hotkey: string;
  onSolve: () => void;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export function SolvePrompt({
  language,
  confidence,
  snippet,
  hotkey,
  onSolve,
  onDismiss,
  autoDismissMs = 5000,
}: SolvePromptProps) {
  const [timeLeft, setTimeLeft] = useState(autoDismissMs / 1000);

  useEffect(() => {
    // Auto-dismiss timer
    const dismissTimer = setTimeout(() => {
      onDismiss();
    }, autoDismissMs);

    // Countdown timer
    const countdownInterval = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 0.1));
    }, 100);

    // Cleanup
    return () => {
      clearTimeout(dismissTimer);
      clearInterval(countdownInterval);
    };
  }, [autoDismissMs, onDismiss]);

  // Listen for hotkey
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Check if hotkey matches (e.g., Ctrl+Enter)
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        onSolve();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [onSolve]);

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg shadow-2xl p-4 min-w-[320px] max-w-[400px] border border-blue-400/30">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-white font-semibold text-sm">
              Code Detected
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="text-white/70 hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>

        {/* Language & Confidence */}
        <div className="flex items-center gap-2 mb-3">
          {language && (
            <span className="px-2 py-0.5 bg-white/20 rounded text-white text-xs font-medium">
              {language.toUpperCase()}
            </span>
          )}
          <span className="text-white/80 text-xs">
            {Math.round(confidence * 100)}% confidence
          </span>
        </div>

        {/* Code Snippet Preview */}
        <div className="bg-black/30 rounded p-2 mb-3 max-h-[100px] overflow-hidden">
          <code className="text-white/90 text-xs font-mono block whitespace-pre-wrap break-all">
            {snippet.length > 150 ? snippet.substring(0, 150) + '...' : snippet}
          </code>
        </div>

        {/* Action Button */}
        <button
          onClick={onSolve}
          className="w-full bg-white hover:bg-gray-100 text-gray-900 font-semibold py-2 px-4 rounded transition-colors flex items-center justify-center gap-2"
        >
          <span>Press {hotkey} to SOLVE</span>
          <kbd className="px-2 py-0.5 bg-gray-200 rounded text-xs">
            {hotkey}
          </kbd>
        </button>

        {/* Auto-dismiss indicator */}
        <div className="mt-2 flex items-center justify-between text-xs text-white/60">
          <span>Auto-dismiss in {timeLeft.toFixed(1)}s</span>
          <div className="w-24 h-1 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-white/60 transition-all duration-100"
              style={{ width: `${(timeLeft / (autoDismissMs / 1000)) * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Add animation to index.css
// @keyframes slide-up {
//   from {
//     transform: translateY(20px);
//     opacity: 0;
//   }
//   to {
//     transform: translateY(0);
//     opacity: 1;
//   }
// }
// .animate-slide-up {
//   animation: slide-up 0.3s ease-out;
// }
