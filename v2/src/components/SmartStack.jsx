import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const variants = {
  enter: (direction) => ({
    y: direction > 0 ? 168 : -168,
    opacity: 0,
    scale: 0.9,
  }),
  center: {
    y: 0,
    opacity: 1,
    scale: 1,
  },
  exit: (direction) => ({
    y: direction < 0 ? 168 : -168,
    opacity: 0,
    scale: 0.9,
  }),
};

export default function SmartStack() {
  const [[page, direction], setPage] = useState([0, 0]);

  const cards = [
    <WeatherCard key="weather" />,
    <PortfolioActivityCard key="activity" />,
    <SystemPulseCard key="pulse" />
  ];

  const paginate = (newDirection) => {
    setPage([page + newDirection, newDirection]);
  };

  const currentIndex = ((page % cards.length) + cards.length) % cards.length;

  return (
    <div className="relative h-[168px] rounded-[20px] overflow-hidden bg-[#16213e] shadow-xl">
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={page}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ y: { type: "spring", stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={1}
          onDragEnd={(e, { offset, velocity }) => {
            const swipe = offset.y;
            if (swipe < -30) paginate(1);
            else if (swipe > 30) paginate(-1);
          }}
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
        >
          {cards[currentIndex]}
        </motion.div>
      </AnimatePresence>
      
      {/* Dots Indicator */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-10">
        {cards.map((_, idx) => (
          <div 
            key={idx} 
            className={`w-1.5 h-1.5 rounded-full transition-colors ${idx === currentIndex ? 'bg-white' : 'bg-white/30'}`}
          />
        ))}
      </div>
    </div>
  );
}

// -------------------------
// CARD 1: Weather Widget
// -------------------------
function WeatherCard() {
  const [time, setTime] = useState('12:00');
  
  useEffect(() => {
    const int = setInterval(() => {
      setTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 1000);
    return () => clearInterval(int);
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col p-4 box-border pointer-events-none select-none">
      <div className="flex justify-between items-center">
        <span className="text-white/40 text-[10px] tracking-widest font-semibold uppercase">Berlin</span>
        <span className="text-white/30 text-[9px] tracking-widest uppercase">Time & Weather</span>
      </div>
      <div className="flex-1"></div>
      <div className="flex justify-between items-end">
        <div>
          <div className="text-white text-[30px] font-extralight tracking-tight leading-none font-mono">
            {time}
          </div>
          <div className="text-white/40 text-[10px] font-medium tracking-wider mt-1">
            Sunny
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1 justify-end mb-0.5">
            <span className="text-[18px] leading-none">☀️</span>
            <span className="text-white text-[17px] font-light leading-none">20°C</span>
          </div>
          <div className="text-white/40 text-[10px] mb-1.5">💨 10 km/h</div>
          <div className="flex items-center gap-1.5 justify-end">
            <span className="text-white/60 text-[10px] tracking-wide">✂️ Cutting</span>
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0 animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// -------------------------
// CARD 2: Portfolio Activity
// -------------------------
function PortfolioActivityCard() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-[#2a1420] to-[#1a1018] p-4 flex flex-col box-border pointer-events-none select-none">
      <div className="flex justify-between items-center">
        <div className="px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-wider text-black bg-gray-200">
          HOME
        </div>
        <span className="text-white/40 text-[10px] tracking-widest font-semibold uppercase">Portfolio</span>
      </div>
      <div className="mt-2.5">
        <p className="text-white text-[17px] font-semibold leading-tight m-0">Up next: Edits</p>
        <p className="text-white/50 text-[12px] font-medium mt-0.5">Explore video projects</p>
      </div>
      <div className="flex-1"></div>
      <div className="relative h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="absolute top-0 left-0 h-full w-1/3 bg-pink-500 rounded-full"></div>
      </div>
    </div>
  );
}

// -------------------------
// CARD 3: System Pulse (GitHub)
// -------------------------
function SystemPulseCard() {
  const [commit, setCommit] = useState({ message: 'Fetching latest push...', date: null });

  useEffect(() => {
    fetch('https://api.github.com/repos/edpz/tomin.world/commits?per_page=1')
      .then(res => res.json())
      .then(data => {
        if(data && data[0]) {
          setCommit({
            message: data[0].commit.message,
            date: new Date(data[0].commit.author.date)
          });
        }
      })
      .catch(() => setCommit({ message: 'Ready.' }));
  }, []);

  return (
    <div className="absolute inset-0 bg-gradient-to-br from-[#0a1820] via-[#0d0f14] to-[#0a0c10] p-4 flex flex-col box-border pointer-events-none select-none">
      <div className="flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-white/90 text-[10px] tracking-widest font-extrabold uppercase font-mono">LIVE</span>
        </div>
        <span className="text-white/40 text-[10px] tracking-widest font-semibold uppercase">Changelog</span>
      </div>
      <div className="mt-2.5 z-10">
        <p className="text-white text-[15px] font-semibold leading-tight m-0">Latest commit</p>
        <p className="text-green-100/80 text-[10.5px] mt-1.5 font-medium font-mono bg-white/5 border border-green-500/20 rounded-md px-2 py-1.5 line-clamp-2">
          {commit.message}
        </p>
      </div>
      <div className="flex-1 min-h-[4px]"></div>
      <div className="relative h-[3px] bg-white/10 rounded-full overflow-hidden mb-1">
        <div className="absolute top-0 left-0 w-1/2 h-full bg-gradient-to-r from-transparent via-green-500/80 to-transparent animate-[sysScan_3s_ease-in-out_infinite] translate-x-[-100%]"></div>
      </div>
    </div>
  );
}
