// 3-Space tape model + magazine reader.
// Spaces: edits (offset -1) | desktop (0) | magazine (+1).
// All three panels slide simultaneously so direct Edits↔Magazine
// travel passes through the desktop (200% distance).

import { portfolioData } from '../../data.js';

const editsViewer = document.getElementById('edits-viewer');
const desktopMain = document.getElementById('desktop-main');

const magazineReader = document.getElementById('magazine-reader');
const btnCloseMagazine = document.getElementById('btn-close-magazine');
const magazineScroller = document.getElementById('magazine-scroller');
const magazineTitle = document.getElementById('magazine-title');
const magazineProgress = document.getElementById('magazine-progress');
const magazineCurrentPage = document.getElementById('magazine-current-page');
const magazineTotalPages = document.getElementById('magazine-total-pages');

export function switchToSpace(target) {
  const offsets = { edits: -1, desktop: 0, magazine: 1 };
  const o = offsets[target];
  editsViewer.style.transform = `translateX(${(-1 - o) * 100}%)`;
  desktopMain.style.transform = `translateX(${(0 - o) * 100}%)`;
  magazineReader.style.transform = `translateX(${(1 - o) * 100}%)`;
  editsViewer.classList.toggle('pointer-events-auto', target === 'edits');
  editsViewer.classList.toggle('pointer-events-none', target !== 'edits');
  magazineReader.classList.toggle('pointer-events-auto', target === 'magazine');
  magazineReader.classList.toggle('pointer-events-none', target !== 'magazine');
}

let isDraggingSlider = false;
magazineProgress.addEventListener('mousedown', () => isDraggingSlider = true);
magazineProgress.addEventListener('touchstart', () => isDraggingSlider = true, { passive: true });
window.addEventListener('mouseup', () => isDraggingSlider = false);
window.addEventListener('touchend', () => isDraggingSlider = false);

window.openMagazineReader = function (folder, index) {
  const magItem = portfolioData[folder][index];
  const magKey = folder + "/" + magItem.name;
  const images = portfolioData[magKey] || [];

  let cachedViews = [];
  const updateCachedViews = () => {
    cachedViews = getMagazineViews();
  };

  // magazine reader is full-screen overlay, no bringToFront needed
  magazineTitle.innerText = magItem.name;
  magazineScroller.innerHTML = "";

  if (images.length === 0) {
    magazineScroller.innerHTML = `<div class="w-full h-full flex items-center justify-center text-slate-500 dark:text-white/50">No pages found in this magazine.</div>`;
    magazineProgress.max = 1;
    magazineTotalPages.innerText = "0";
  } else {
    magazineScroller.style.scrollSnapType = 'none';
    magazineScroller.style.scrollBehavior = 'auto'; // allow pure scroll sync dragging

    // Dynamic spacers that will be adjusted once image/video widths are known
    let htmlSnippet = `<div id="mag-spacer-start" class="shrink-0 h-full pointer-events-none bg-transparent" style="width: 50vw;"></div>`;
    images.forEach((img, i) => {
      if (img.isVideo) {
        htmlSnippet += `
          <video data-src="${img.src}" class="mag-page h-full w-auto object-contain shrink-0 block mx-0 pointer-events-none"
            data-index="${i}" style="max-height: 100vh;" loop muted playsinline preload="none"></video>
        `;
      } else {
        htmlSnippet += `
          <img src="${img.src}" class="mag-page h-full w-auto object-contain shrink-0 block mx-0 pointer-events-none" 
            data-index="${i}" style="max-height: 100vh;">
        `;
      }
    });
    htmlSnippet += `<div id="mag-spacer-end" class="shrink-0 h-full pointer-events-none bg-transparent" style="width: 50vw;"></div>`;
    magazineScroller.innerHTML = htmlSnippet;

    // Seamless video loop + lazy load only visible videos
    const magVids = magazineScroller.querySelectorAll('video');
    magVids.forEach(v => {
      v.addEventListener('timeupdate', () => {
        if (v.duration && v.currentTime > v.duration - 0.08) {
          v.currentTime = 0;
          v.play();
        }
      });
    });
    const magVidObserver = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        const v = e.target;
        if (e.isIntersecting) {
          if (!v.src && v.dataset.src) { v.src = v.dataset.src; }
          v.play().catch(() => { });
        } else {
          v.pause();
        }
      });
    }, { root: magazineScroller, threshold: 0.3 });
    magVids.forEach(v => magVidObserver.observe(v));

    magazineProgress.max = 10000;
    magazineProgress.value = 0;
    magazineTotalPages.innerText = images.length;
    magazineCurrentPage.innerText = 1;

    const getViewIndex = () => {
      const current = magazineScroller.scrollLeft;
      // Fallback if cache isn't ready yet
      const activeViews = (cachedViews && cachedViews.length > 0) ? cachedViews : getMagazineViews();
      let closestIndex = 0;
      let minDiff = Infinity;
      for (let i = 0; i < activeViews.length; i++) {
        const diff = Math.abs(current - activeViews[i]);
        if (diff < minDiff) {
          minDiff = diff;
          closestIndex = i;
        }
      }
      return closestIndex;
    };

    const updatePageIndicator = (viewIndex) => {
      const activeViews = (cachedViews && cachedViews.length > 0) ? cachedViews : getMagazineViews();
      if (activeViews.length === 0) return;

      if (viewIndex === 0) {
        magazineCurrentPage.innerText = "1";
      } else if (viewIndex === activeViews.length - 1 && images.length > 1) {
        magazineCurrentPage.innerText = images.length;
      } else {
        magazineCurrentPage.innerText = `${viewIndex}-${viewIndex + 1}`;
      }
    };

    const snapToView = () => {
      updateCachedViews(); // Ensure we have latest layout
      const current = magazineScroller.scrollLeft;
      if (cachedViews.length === 0) return;
      let closest = cachedViews[0];
      let minDiff = Infinity;
      cachedViews.forEach(v => {
        const diff = Math.abs(current - v);
        if (diff < minDiff) {
          minDiff = diff;
          closest = v;
        }
      });
      magazineScroller.scrollTo({ left: closest, behavior: 'smooth' });
    };

    magazineScroller.onscroll = () => {
      if (isDraggingSlider || isPanning) {
        updatePageIndicator(getViewIndex());
        return;
      }
      const maxScroll = magazineScroller.scrollWidth - magazineScroller.clientWidth;
      if (maxScroll > 0) {
        const progress = (magazineScroller.scrollLeft / maxScroll) * 10000;
        magazineProgress.value = progress;
      }
      updatePageIndicator(getViewIndex());
    };

    magazineProgress.oninput = (e) => {
      const val = parseInt(e.target.value);
      const maxScroll = magazineScroller.scrollWidth - magazineScroller.clientWidth;
      const targetScroll = (val / 10000) * maxScroll;
      magazineScroller.scrollTo({ left: targetScroll, behavior: 'auto' });
      updatePageIndicator(getViewIndex());
    };

    magazineProgress.onchange = () => {
      snapToView();
    };

    // Setup custom drag to pan
    let isPanning = false;
    let startX;
    let scrollLeft;
    magazineScroller.hasDragged = false;

    magazineScroller.onpointerdown = (e) => {
      isPanning = true;
      magazineScroller.style.cursor = 'grabbing';
      magazineScroller.style.scrollBehavior = 'auto'; // Immediate response
      // Cancel any ongoing smooth scroll
      magazineScroller.scrollTo({ left: magazineScroller.scrollLeft, behavior: 'instant' });

      startX = e.clientX;
      scrollLeft = magazineScroller.scrollLeft;
      magazineScroller.hasDragged = false;
    };

    magazineScroller.onpointerleave = () => {
      if (isPanning) {
        isPanning = false;
        magazineScroller.style.cursor = 'auto';
        snapToView();
      }
    };

    magazineScroller.onpointerup = () => {
      if (isPanning) {
        isPanning = false;
        magazineScroller.style.cursor = 'auto';
        snapToView();
      }
    };

    magazineScroller.onpointermove = (e) => {
      if (!isPanning) return;
      e.preventDefault();
      const walk = (e.clientX - startX);
      if (Math.abs(walk) > 10) {
        magazineScroller.hasDragged = true;
      }
      magazineScroller.scrollLeft = scrollLeft - walk;
    };

    // Setup click navigation right on the scroller bounds
    magazineScroller.onclick = (e) => {
      if (magazineScroller.hasDragged) {
        magazineScroller.hasDragged = false;
        return;
      }
      const rect = magazineScroller.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const views = getMagazineViews();
      const current = magazineScroller.scrollLeft;

      if (x < rect.width * 0.25) {
        const prev = [...views].reverse().find(v => v < current - 10);
        if (prev !== undefined) {
          magazineScroller.scrollTo({ left: prev, behavior: 'smooth' });
        } else {
          magazineScroller.scrollTo({ left: 0, behavior: 'smooth' });
        }
      } else if (x > rect.width * 0.75) {
        const next = views.find(v => v > current + 10);
        if (next !== undefined) {
          magazineScroller.scrollTo({ left: next, behavior: 'smooth' });
        } else {
          magazineScroller.scrollTo({ left: magazineScroller.scrollWidth, behavior: 'smooth' });
        }
      }
    };
  }

  switchToSpace('magazine');

  // Auto-align spacers so the cover centers at scrollLeft = 0
  const firstImg = magazineScroller.querySelector('.mag-page');
  const lastImg = Array.from(magazineScroller.querySelectorAll('.mag-page')).pop();
  const startSpacer = document.getElementById('mag-spacer-start');
  const endSpacer = document.getElementById('mag-spacer-end');

  let scrollAttempts = 0;
  const alignSpacersAndScroll = () => {
    const half = magazineScroller.clientWidth / 2;
    const firstImgWidth = firstImg ? firstImg.offsetWidth : 0;
    const lastImgWidth = lastImg ? lastImg.offsetWidth : 0;

    // If image width isn't ready, wait
    if (firstImgWidth === 0 && scrollAttempts < 25) {
      scrollAttempts++;
      requestAnimationFrame(alignSpacersAndScroll);
      return;
    }

    // Adjust spacers so cover center is at 0 and back center is at maxScroll
    if (startSpacer && firstImgWidth > 0) {
      startSpacer.style.width = (half - firstImgWidth / 2) + "px";
    }
    if (endSpacer && lastImgWidth > 0) {
      endSpacer.style.width = (half - lastImgWidth / 2) + "px";
    }

    updateCachedViews();
    magazineScroller.scrollTo({ left: 0, behavior: 'instant' });
  };

  if (firstImg) {
    if (firstImg.tagName === 'VIDEO') {
      firstImg.onloadedmetadata = alignSpacersAndScroll;
    } else {
      if (firstImg.complete) {
        alignSpacersAndScroll();
      } else {
        firstImg.onload = alignSpacersAndScroll;
      }
    }
  }
  setTimeout(alignSpacersAndScroll, 100);
  setTimeout(alignSpacersAndScroll, 500);
};

const magFullscreenToggle = document.getElementById('mag-fullscreen-toggle');
if (magFullscreenToggle) {
  magFullscreenToggle.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });
}

btnCloseMagazine.addEventListener('click', () => {
  switchToSpace('desktop');

  setTimeout(() => {
    magazineScroller.innerHTML = "";
  }, 500); // clear after animation
});

const getMagazineViews = () => {
  const views = [];
  const imgs = magazineScroller.querySelectorAll('.mag-page');
  const halfScreen = magazineScroller.clientWidth / 2;
  const maxScroll = Math.max(0, magazineScroller.scrollWidth - magazineScroller.clientWidth);

  if (imgs.length > 0) {
    // View 1: Center of first image (Cover)
    const v0 = imgs[0].offsetLeft + (imgs[0].offsetWidth / 2) - halfScreen;
    views.push(Math.max(0, Math.min(v0, maxScroll)));

    // Views 2 to N: Center of all seams between images (Spreads)
    for (let i = 1; i < imgs.length; i++) {
      const vi = imgs[i].offsetLeft - halfScreen;
      views.push(Math.max(0, Math.min(vi, maxScroll)));
    }

    // Last View: Center of last image (Back Cover)
    if (imgs.length > 1) {
      const vLast = imgs[imgs.length - 1].offsetLeft + (imgs[imgs.length - 1].offsetWidth / 2) - halfScreen;
      views.push(Math.max(0, Math.min(vLast, maxScroll)));
    }
  }
  return views;
};

document.addEventListener('keydown', (e) => {
  // Only process keys if magazine reader is fully open (translate-x-0)
  if (magazineReader.classList.contains('pointer-events-auto')) {
    const views = getMagazineViews();
    const current = magazineScroller.scrollLeft;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = views.find(v => v > current + 10);
      if (next !== undefined) {
        magazineScroller.scrollTo({ left: next, behavior: 'smooth' });
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = [...views].reverse().find(v => v < current - 10);
      if (prev !== undefined) {
        magazineScroller.scrollTo({ left: prev, behavior: 'smooth' });
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      btnCloseMagazine.click();
    }
  }
});



// ── UI Bindings ─────────────────────────────────────────────────────────
// Replaces all the inline onclick handlers that used to live in index.html.
// Group together so a future move to <event-delegate>/JSX is one diff away.
