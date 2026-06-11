/* ============================================================
   Nyara Stays — animations.js
   IntersectionObserver reveals, parallax, hero title clip-in
   ============================================================ */
(function(){
  'use strict';

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- Reveal on scroll ------------------------------------------------
  const reveals = document.querySelectorAll('[data-reveal]');
  if (reveals.length){
    if (prefersReduced){
      reveals.forEach(el => el.classList.add('is-in'));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting){
            const delay = entry.target.dataset.revealDelay || 0;
            setTimeout(() => entry.target.classList.add('is-in'), Number(delay));
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.05, rootMargin: '0px 0px 80px 0px' });
      reveals.forEach(el => io.observe(el));

      // Safety net: scroll-based fallback in case IO doesn't fire
      // (e.g., complex nested transforms / clip-path layouts)
      let ticking = false;
      const checkReveals = () => {
        ticking = false;
        const vh = window.innerHeight;
        document.querySelectorAll('[data-reveal]:not(.is-in)').forEach(el => {
          const r = el.getBoundingClientRect();
          if (r.top < vh - 40 && r.bottom > 0){
            const delay = el.dataset.revealDelay || 0;
            setTimeout(() => el.classList.add('is-in'), Number(delay));
          }
        });
      };
      window.addEventListener('scroll', () => {
        if (!ticking){ requestAnimationFrame(checkReveals); ticking = true; }
      }, { passive: true });
      // initial check after layout settles
      requestAnimationFrame(() => requestAnimationFrame(checkReveals));
    }
  }

  // ---- Parallax (subtle Y translate on scroll) -------------------------
  const parallaxNodes = document.querySelectorAll('[data-parallax]');
  if (parallaxNodes.length && !prefersReduced){
    let ticking = false;
    const update = () => {
      const vh = window.innerHeight;
      parallaxNodes.forEach(node => {
        const speed = parseFloat(node.dataset.parallax) || 0.15;
        const rect = node.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const offset = (center - vh / 2) * -speed;
        node.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
      });
      ticking = false;
    };
    window.addEventListener('scroll', () => {
      if (!ticking){ requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  // ---- Hero subtle mouse tilt -----------------------------------------
  const hero = document.querySelector('[data-hero]');
  const heroMedia = hero && hero.querySelector('.hero__media');
  if (hero && heroMedia && !prefersReduced && window.matchMedia('(hover: hover)').matches){
    let raf = null;
    hero.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5);
      const y = (e.clientY / window.innerHeight - 0.5);
      if (raf) return;
      raf = requestAnimationFrame(() => {
        heroMedia.style.transform = `translate3d(${(-x*16).toFixed(2)}px, ${(-y*10).toFixed(2)}px, 0) scale(1.04)`;
        raf = null;
      });
    });
  }

  // ---- Tag external links ---------------------------------------------
  document.querySelectorAll('a[target="_blank"]').forEach(a => {
    if (!a.rel.includes('noopener')) a.rel = (a.rel + ' noopener').trim();
  });
})();
