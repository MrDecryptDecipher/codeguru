import React from 'react'

export const DragHandle: React.FC = () => {
    return (
        <div
            className="drag-handle w-full h-8 bg-gradient-to-r from-gray-900/95 to-black/95 backdrop-blur-sm flex items-center justify-between px-4 rounded-t-lg border-b border-gray-800/70"
            style={{
                // @ts-ignore - Webkit specific property
                WebkitAppRegion: 'drag',
                cursor: 'grab'
            }}
        >
            <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500/70"></div>
                <div className="w-2 h-2 rounded-full bg-yellow-500/70"></div>
                <div className="w-2 h-2 rounded-full bg-green-500/70"></div>
            </div>
            <span className="text-xs text-gray-400 font-medium select-none">
                CodeGuru
            </span>
            <div className="w-16"></div> {/* Spacer for balance */}
        </div>
    )
}
