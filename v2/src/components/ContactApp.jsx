import React from 'react';
import Window from './Window';

export default function ContactApp({ windowData }) {
  return (
    <Window windowData={{ ...windowData, title: 'About This OS' }}>
      <div className="p-6 flex flex-col items-center bg-white/80 dark:bg-slate-900/90 h-full">
        <div className="w-20 h-20 bg-gradient-to-br from-primary to-purple-600 rounded-full mb-4 shadow-lg flex items-center justify-center">
          <span className="text-white font-bold text-2xl">ED</span>
        </div>
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-4">EDDIE</h2>

        <div className="w-full text-xs text-slate-600 dark:text-slate-300 space-y-2 bg-slate-50/50 dark:bg-black/20 rounded-lg p-3 border border-transparent dark:border-white/5">
          <div className="flex justify-between">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Website</span>
            <span>2.0</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Instagram</span>
            <span>@edpz</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Mail</span>
            <span>eddie@shouli.de</span>
          </div>
        </div>
      </div>
    </Window>
  );
}
