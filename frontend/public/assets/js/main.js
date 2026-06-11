/* ============================================================
   Nyara Stays — main.js
   Nav scroll state, mobile drawer, marquee duplication, year
   ============================================================ */
(function(){
  'use strict';

  // ---- Nav scroll state -------------------------------------------------
  const nav = document.querySelector('[data-nav]');
  if (nav){
    const onScroll = () => {
      if (window.scrollY > 30) nav.classList.add('is-scrolled');
      else nav.classList.remove('is-scrolled');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // ---- Mobile drawer ----------------------------------------------------
  const burger = document.querySelector('[data-burger]');
  const drawer = document.querySelector('[data-drawer]');
  if (burger && drawer){
    burger.addEventListener('click', () => {
      const open = drawer.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    });
    drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      drawer.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }));
  }

  // ---- Year (in case used) ---------------------------------------------
  document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());

  // ---- Smooth-anchor for in-page nav ----------------------------------
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const t = document.querySelector(id);
      if (t){ e.preventDefault(); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    });
  });
})();
