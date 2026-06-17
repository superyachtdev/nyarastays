/* ============================================================
   Nyara Stays — elevate.js
   Intro · Soundscape · Magnetic cursor · Time veil ·
   WhatsApp · Wishlist · Currency · Exit-intent
   ============================================================ */
(function(){
  'use strict';

  const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isCoarse = matchMedia('(hover: none), (pointer: coarse)').matches;

  // ============== 1. INTRO LOADER (first visit / session) =============
  function mountIntro(){
    if (sessionStorage.getItem('nyaraSeen') === '1') return;
    if (document.body.classList.contains('no-intro')) return;
    const intro = document.createElement('div');
    intro.className = 'intro';
    intro.innerHTML = `
      <div class="intro__mark">
        <img src="/assets/images/logo/nyara-logo.jpg" alt="Nyara" />
      </div>
      <div class="intro__caption">
        <span>Welcome</span><span>· Nyara Stays ·</span><span>Phuket · Bali</span>
      </div>`;
    document.body.appendChild(intro);
    // Prevent scroll briefly
    document.documentElement.style.overflow = 'hidden';
    const dwell = prefersReduced ? 600 : 2400;
    setTimeout(() => {
      intro.classList.add('is-gone');
      document.documentElement.style.overflow = '';
      sessionStorage.setItem('nyaraSeen', '1');
      setTimeout(() => intro.remove(), 1000);
    }, dwell);
  }

  // ============== 2. TIME-OF-DAY HERO TINT ============================
  function applyTimeTint(){
    const h = new Date().getHours();
    let tint = 'transparent';
    if (h >= 5 && h < 8)        tint = 'rgba(255, 187, 130, .18)';  // sunrise warm
    else if (h >= 8 && h < 11)  tint = 'rgba(255, 224, 178, .10)';  // morning gold
    else if (h >= 11 && h < 16) tint = 'rgba(255, 255, 255, .05)';  // midday clean
    else if (h >= 16 && h < 18) tint = 'rgba(255, 168, 110, .16)';  // golden hour
    else if (h >= 18 && h < 20) tint = 'rgba(214, 110, 95, .20)';   // sunset
    else                        tint = 'rgba(60, 80, 130, .22)';    // night cool
    document.documentElement.style.setProperty('--time-tint', tint);
  }

  // ============== 3. MAGNETIC CURSOR + SELECTION ======================
  // Design:
  //   • Cursor always follows the MOUSE smoothly (never snaps to element).
  //   • On hover of any interactive element → cursor grows, dot fades.
  //   • On select CTAs → the BUTTON itself shifts toward the cursor (true magnetic).
  //   • Pull composed via CSS vars so existing :hover transforms still work.
  function mountMagneticCursor(){
    if (isCoarse) return;

    // ---- Cursor element ------------------------------------------
    const cursor = document.createElement('div');
    cursor.className = 'cursor';
    cursor.innerHTML = '<span class="cursor__dot"></span>';
    document.body.appendChild(cursor);
    document.body.classList.add('has-magnetic-cursor');

    // ---- Mouse follow (always tracks actual mouse) ---------------
    let mx = window.innerWidth/2, my = window.innerHeight/2;
    let cx = mx, cy = my;
    let visible = false;

    window.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      if (!visible){ visible = true; cursor.classList.add('is-ready'); }
    }, { passive: true });
    document.addEventListener('mouseleave', () => {
      cursor.classList.remove('is-ready'); visible = false;
    });
    document.addEventListener('mouseenter', () => {
      cursor.classList.add('is-ready'); visible = true;
    });

    // ---- Hover detection (cursor grow on any interactive) --------
    const HOVER_SEL = 'a, button, .field, [data-magnetic], input[type="checkbox"], input[type="radio"], .cal__day, .stay-card, .property, .j-card';
    let hoverEl = null;
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest(HOVER_SEL);
      if (t === hoverEl) return;
      hoverEl = t;
      cursor.classList.toggle('is-pull', !!t);
    }, { passive: true });

    // ---- Magnetic pull on select CTAs (CSS-var composed) ---------
    const MAGNETIC_SEL = '.btn, [data-magnetic], .nav__wish, .curr__btn, .pay__method';
    let magnet = null;
    let magnetRect = null;

    function clearMagnet(el){
      if (!el) return;
      el.style.setProperty('--pull-x', '0px');
      el.style.setProperty('--pull-y', '0px');
    }
    function setMagnet(el){
      if (magnet === el) return;
      clearMagnet(magnet);
      magnet = el || null;
      magnetRect = el ? el.getBoundingClientRect() : null;
    }
    document.addEventListener('mouseover', (e) => {
      const t = e.target.closest(MAGNETIC_SEL);
      setMagnet(t);
    }, { passive: true });
    document.addEventListener('mouseout', (e) => {
      if (!magnet) return;
      // released only when we leave the current magnet's bounds
      const next = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(MAGNETIC_SEL);
      if (next !== magnet){
        clearMagnet(magnet);
        magnet = null; magnetRect = null;
      }
    }, { passive: true });
    // Keep rect fresh on scroll/resize
    const refreshRect = () => { if (magnet) magnetRect = magnet.getBoundingClientRect(); };
    window.addEventListener('scroll', refreshRect, { passive: true });
    window.addEventListener('resize', refreshRect);

    // ---- RAF loop ------------------------------------------------
    function raf(){
      cx += (mx - cx) * 0.22;
      cy += (my - cy) * 0.22;
      cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;

      if (magnet && magnetRect){
        const ecx = magnetRect.left + magnetRect.width / 2;
        const ecy = magnetRect.top  + magnetRect.height / 2;
        // 22% pull, capped
        const dx = Math.max(-10, Math.min(10, (mx - ecx) * 0.22));
        const dy = Math.max(-8,  Math.min(8,  (my - ecy) * 0.22));
        magnet.style.setProperty('--pull-x', `${dx}px`);
        magnet.style.setProperty('--pull-y', `${dy}px`);
      }
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);
  }

  // ============== 4. SOUNDSCAPE (procedural crashing waves) ===========
  function mountSoundscape(){
    const btn = document.createElement('button');
    btn.className = 'sound';
    btn.setAttribute('aria-label', 'Toggle ambient sound');
    btn.setAttribute('data-testid', 'sound-toggle');
    btn.innerHTML = `
      <span class="sound__bars" aria-hidden="true">
        <i></i><i></i><i></i><i></i>
      </span>
      <span class="sound__label">Ambient · Off</span>`;
    document.body.appendChild(btn);

    let ctx, master, sources = [];
    let on = false;
    let birdTimer = null;

    function buildAmbient(){
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0;
      master.connect(ctx.destination);

      // Soft saturation/limiter so the layered sources stay polite
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -18;
      limiter.knee.value = 24;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.01;
      limiter.release.value = 0.25;
      limiter.connect(master);

      // ---- Shared pink-noise buffer (4s, looped) -----------------------
      const bufSize = 4 * ctx.sampleRate;
      const pinkBuf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const pinkData = pinkBuf.getChannelData(0);
      let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
      for (let i=0;i<bufSize;i++){
        const white = Math.random()*2-1;
        b0 = 0.99886*b0 + white*0.0555179;
        b1 = 0.99332*b1 + white*0.0750759;
        b2 = 0.96900*b2 + white*0.1538520;
        b3 = 0.86650*b3 + white*0.3104856;
        b4 = 0.55000*b4 + white*0.5329522;
        b5 = -0.7616*b5 - white*0.0168980;
        pinkData[i] = (b0+b1+b2+b3+b4+b5+b6+white*0.5362)*0.11;
        b6 = white*0.115926;
      }

      // ---- 1. DEEP OCEAN RUMBLE (sub-low filtered noise) --------------
      // The constant low-end "body" of the sea — felt more than heard.
      const rumble = ctx.createBufferSource();
      rumble.buffer = pinkBuf; rumble.loop = true;
      const rumbleLP = ctx.createBiquadFilter();
      rumbleLP.type = 'lowpass';
      rumbleLP.frequency.value = 220;
      rumbleLP.Q.value = 0.4;
      const rumbleGain = ctx.createGain();
      rumbleGain.gain.value = 0.55;
      rumble.connect(rumbleLP).connect(rumbleGain).connect(limiter);
      rumble.start();

      // ---- 2. SURF WASH (mid-band noise with slow swell) --------------
      // The continuous hiss/rush of foam pulling back over sand. A slow
      // LFO breathes the volume so it feels like the tide swelling.
      const wash = ctx.createBufferSource();
      wash.buffer = pinkBuf; wash.loop = true;
      const washBP = ctx.createBiquadFilter();
      washBP.type = 'bandpass';
      washBP.frequency.value = 900;
      washBP.Q.value = 0.6;
      const washLP = ctx.createBiquadFilter();
      washLP.type = 'lowpass';
      washLP.frequency.value = 2600;
      const washGain = ctx.createGain();
      washGain.gain.value = 0.36;
      const washLfo = ctx.createOscillator();
      const washLfoGain = ctx.createGain();
      washLfo.frequency.value = 0.085;          // ~12s swell cycle
      washLfoGain.gain.value = 0.18;
      washLfo.connect(washLfoGain).connect(washGain.gain);
      washLfo.start();
      wash.connect(washBP).connect(washLP).connect(washGain).connect(limiter);
      wash.start();

      // ---- 3. HIGH SEA SPRAY (gentle airy shimmer) --------------------
      // Subtle high-frequency hiss layered on top so the sound has "air"
      // and reads as ocean rather than just rumble.
      const spray = ctx.createBufferSource();
      spray.buffer = pinkBuf; spray.loop = true;
      const sprayHP = ctx.createBiquadFilter();
      sprayHP.type = 'highpass';
      sprayHP.frequency.value = 3200;
      const sprayGain = ctx.createGain();
      sprayGain.gain.value = 0.07;
      const sprayLfo = ctx.createOscillator();
      const sprayLfoGain = ctx.createGain();
      sprayLfo.frequency.value = 0.13;
      sprayLfoGain.gain.value = 0.03;
      sprayLfo.connect(sprayLfoGain).connect(sprayGain.gain);
      sprayLfo.start();
      spray.connect(sprayHP).connect(sprayGain).connect(limiter);
      spray.start();

      // ---- 4. CRASHING WAVE EVENTS ------------------------------------
      // Periodic louder breakers. Each crash is a noise burst with a fast
      // rise, broad spectral sweep (low → mid as the wave rolls and
      // breaks), then a longer decay tail as the foam dissipates.
      function scheduleCrash(){
        if (!on || !ctx) return;
        const delay = 6 + Math.random() * 7;   // 6–13s between crashes
        birdTimer = setTimeout(() => {         // reuse timer handle for cleanup
          if (!on || !ctx) return;
          const t = ctx.currentTime + 0.05;
          const dur = 3.2 + Math.random() * 2.4; // 3.2–5.6s wave length

          // Noise source for the crash itself
          const crash = ctx.createBufferSource();
          crash.buffer = pinkBuf;
          crash.loop = true;

          // Bandpass that sweeps upward — wave rolling in, breaking, hissing
          const bp = ctx.createBiquadFilter();
          bp.type = 'bandpass';
          bp.Q.value = 0.7;
          bp.frequency.setValueAtTime(180, t);
          bp.frequency.exponentialRampToValueAtTime(1600 + Math.random() * 900, t + 0.55);
          bp.frequency.exponentialRampToValueAtTime(700, t + dur);

          // Lowpass tail keeps it natural (no harsh top-end)
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 4200;

          // Envelope: fast-ish attack, long decay
          const g = ctx.createGain();
          const peak = 0.55 + Math.random() * 0.25; // some waves bigger than others
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(peak, t + 0.45);
          g.gain.exponentialRampToValueAtTime(0.18, t + 1.2);
          g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

          crash.connect(bp).connect(lp).connect(g).connect(limiter);
          crash.start(t);
          crash.stop(t + dur + 0.05);

          scheduleCrash();
        }, delay * 1000);
      }
      // expose so the toggle handler can start/stop crash scheduling
      ctx._scheduleBird = scheduleCrash;

      sources.push(rumble, wash, spray, washLfo, sprayLfo);
    }

    function setLabel(){
      const lbl = btn.querySelector('.sound__label');
      lbl.textContent = on ? 'Ambient · On' : 'Ambient · Off';
    }

    btn.addEventListener('click', () => {
      activate(!on);
    });

    function activate(turnOn){
      if (!ctx) buildAmbient();
      if (ctx.state === 'suspended') ctx.resume();
      on = !!turnOn;
      btn.classList.toggle('is-on', on);
      // fade master gain
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(on ? 0.42 : 0, now + 1.4);
      // crashing waves only play when ambient is on
      if (on && ctx._scheduleBird) {
        // Welcome wave ~0.4s after activation so the guest unmistakably hears it
        const t = ctx.currentTime + 0.35;
        const dur = 2.6;
        const crash = ctx.createBufferSource();
        // reuse the shared pink buffer attached to the master chain
        const tmpBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
        const d = tmpBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        crash.buffer = tmpBuf;
        crash.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.Q.value = 0.7;
        bp.frequency.setValueAtTime(220, t);
        bp.frequency.exponentialRampToValueAtTime(1800, t + 0.5);
        bp.frequency.exponentialRampToValueAtTime(800, t + dur);
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 4000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.55, t + 0.4);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        crash.connect(bp).connect(lp).connect(g).connect(master); // bypass limiter for clarity
        crash.start(t);
        crash.stop(t + dur + 0.05);
        ctx._scheduleBird();
      } else if (birdTimer) {
        clearTimeout(birdTimer);
        birdTimer = null;
      }
      setLabel();
    }

    // Auto-start on the first user gesture (browsers block autoplay without one).
    // Honours sessionStorage so a guest who muted it stays muted while browsing.
    const muted = (() => {
      try { return sessionStorage.getItem('nyara:ambient') === 'off'; } catch { return false; }
    })();
    if (!muted) {
      const kick = () => {
        if (on) return;
        activate(true);
        window.removeEventListener('pointerdown', kick);
        window.removeEventListener('keydown', kick);
        window.removeEventListener('scroll', kick);
        window.removeEventListener('touchstart', kick);
      };
      window.addEventListener('pointerdown', kick, { once: false, passive: true });
      window.addEventListener('keydown', kick, { once: false });
      window.addEventListener('scroll', kick, { once: false, passive: true });
      window.addEventListener('touchstart', kick, { once: false, passive: true });
    }

    // Remember the guest's choice for this session
    btn.addEventListener('click', () => {
      try { sessionStorage.setItem('nyara:ambient', on ? 'on' : 'off'); } catch (_e) { /* sessionStorage unavailable, ignore */ }
    });
  }

  // ============== 5. WHATSAPP CONCIERGE BUBBLE ========================
  function mountWhatsApp(){
    const phone = '6285100000000'; // placeholder Indonesian number
    const msg = encodeURIComponent("Hi Nyara, I'd like to ask about a stay.");
    const a = document.createElement('a');
    a.className = 'wa';
    a.href = `https://wa.me/${phone}?text=${msg}`;
    a.target = '_blank'; a.rel = 'noopener';
    a.setAttribute('aria-label', 'Chat on WhatsApp');
    a.setAttribute('data-testid', 'whatsapp-cta');
    a.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.6 1.38 5.1L2 22l4.95-1.36A9.95 9.95 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18.1c-1.65 0-3.18-.45-4.51-1.22l-.32-.19-2.94.81.79-2.86-.21-.33A8.05 8.05 0 0 1 3.9 12C3.9 7.53 7.53 3.9 12 3.9S20.1 7.53 20.1 12 16.47 20.1 12 20.1zm4.43-6.06c-.24-.12-1.41-.7-1.63-.78-.22-.08-.38-.12-.54.12s-.62.78-.76.94c-.14.16-.28.18-.52.06s-1.02-.38-1.94-1.2c-.72-.64-1.2-1.43-1.34-1.67-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.41-.54-.42h-.46c-.16 0-.42.06-.64.3s-.84.82-.84 2 .86 2.32.98 2.48c.12.16 1.7 2.6 4.13 3.64.58.25 1.03.4 1.38.51.58.18 1.11.16 1.53.1.47-.07 1.41-.58 1.61-1.13.2-.55.2-1.03.14-1.13-.06-.1-.22-.16-.46-.28z"/></svg>
      <span class="wa__label">Chat with concierge</span>
    `;
    document.body.appendChild(a);
  }

  // ============== 6. WISHLIST =========================================
  const STAYS = {
    yume:  { name:'Yume by Nyara', loc:'Uluwatu · Bali', img:'/assets/images/yume/352664100.jpg', href:'/locations/yume.html' },
    nyara: { name:'Nyara Villas',  loc:'Rawai · Phuket', img:'/assets/images/yume/352684018.jpg', href:'/locations/nyara-villas.html' }
  };

  function getWishlist(){
    try { return JSON.parse(localStorage.getItem('nyaraWishlist') || '[]'); }
    catch { return []; }
  }
  function setWishlist(arr){ localStorage.setItem('nyaraWishlist', JSON.stringify(arr)); updateWishUI(); }
  function toggleWish(id){
    const list = getWishlist();
    const idx = list.indexOf(id);
    if (idx >= 0) list.splice(idx, 1); else list.push(id);
    setWishlist(list);
  }

  function updateWishUI(){
    const list = getWishlist();
    // update hearts on page
    document.querySelectorAll('.wish[data-wish]').forEach(el => {
      el.classList.toggle('is-saved', list.includes(el.dataset.wish));
    });
    // nav badge
    document.querySelectorAll('.nav__wish').forEach(el => {
      el.setAttribute('data-count', String(list.length));
    });
    // popover body
    const body = document.querySelector('[data-wish-pop-body]');
    if (body){
      if (list.length === 0){
        body.innerHTML = '<div class="wish-pop__empty">Nothing saved yet. Tap the ♡ on any stay.</div>';
      } else {
        body.innerHTML = list.map(id => {
          const s = STAYS[id]; if (!s) return '';
          return `<a class="wish-pop__item" href="${s.href}">
            <img src="${s.img}" alt="" />
            <div class="wish-pop__item-body">
              <p class="wish-pop__item-title">${s.name}</p>
              <p class="wish-pop__item-loc">${s.loc}</p>
            </div>
            <button class="wish-pop__remove" data-wish-remove="${id}" aria-label="Remove">
              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M6 6l12 12M6 18L18 6"/></svg>
            </button>
          </a>`;
        }).join('');
      }
    }
  }

  function ensureNavRight(){
    const nav = document.querySelector('.nav');
    if (!nav) return null;
    let right = nav.querySelector('.nav__right');
    if (right) return right;
    const cta = nav.querySelector('.nav__cta');
    const burger = nav.querySelector('.nav__burger');
    right = document.createElement('div');
    right.className = 'nav__right';
    if (cta) right.appendChild(cta);
    // Insert before burger (so burger remains the last hidden mobile element)
    if (burger) nav.insertBefore(right, burger);
    else nav.appendChild(right);
    return right;
  }

  function mountWishlistNav(){
    const right = ensureNavRight();
    if (!right) return;
    // Wishlist button
    const wishBtn = document.createElement('button');
    wishBtn.className = 'nav__wish';
    wishBtn.setAttribute('aria-label', 'Saved stays');
    wishBtn.setAttribute('data-testid', 'nav-wishlist');
    wishBtn.setAttribute('data-count', '0');
    wishBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>`;
    right.insertBefore(wishBtn, right.firstChild);

    // Popover
    const pop = document.createElement('div');
    pop.className = 'wish-pop';
    pop.innerHTML = `<h4>Your shortlist</h4><div data-wish-pop-body></div>`;
    document.body.appendChild(pop);

    wishBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      pop.classList.toggle('is-open');
    });
    document.addEventListener('click', (e) => {
      if (!pop.contains(e.target) && !wishBtn.contains(e.target)) pop.classList.remove('is-open');
    });
    pop.addEventListener('click', (e) => {
      const r = e.target.closest('[data-wish-remove]');
      if (r){ e.preventDefault(); toggleWish(r.dataset.wishRemove); }
    });
  }

  function mountWishlistHearts(){
    document.querySelectorAll('[data-stay]').forEach(card => {
      const id = card.dataset.stay;
      if (!STAYS[id]) return;
      // Find the media container to anchor the heart
      const anchor = card.querySelector('.stay-card__media, .detail-hero__media, .property__media');
      if (!anchor) return;
      if (anchor.querySelector('.wish')) return;
      const btn = document.createElement('button');
      btn.className = 'wish';
      btn.dataset.wish = id;
      btn.setAttribute('aria-label', 'Save to shortlist');
      btn.setAttribute('data-testid', `wish-${id}`);
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.6" fill="none"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>`;
      btn.addEventListener('click', (e) => {
        e.preventDefault(); e.stopPropagation();
        toggleWish(id);
        btn.classList.add('is-pulse');
        setTimeout(() => btn.classList.remove('is-pulse'), 600);
      });
      anchor.appendChild(btn);
    });
  }

  // ============== 7. CURRENCY SWITCHER ================================
  const RATES = {
    USD: { rate: 1,       sym: '$',    code: 'USD', label: 'US Dollar' },
    EUR: { rate: 0.92,    sym: '€',    code: 'EUR', label: 'Euro' },
    AUD: { rate: 1.52,    sym: 'A$',   code: 'AUD', label: 'Australian Dollar' },
    IDR: { rate: 15600,   sym: 'Rp',   code: 'IDR', label: 'Indonesian Rupiah' },
    GBP: { rate: 0.79,    sym: '£',    code: 'GBP', label: 'British Pound' }
  };
  function currentCurrency(){
    return localStorage.getItem('nyaraCurrency') || 'USD';
  }
  function formatPrice(usd, code){
    const r = RATES[code] || RATES.USD;
    const val = usd * r.rate;
    if (code === 'IDR'){
      return `Rp ${Math.round(val/1000)*1000 / 1000}k`.replace('.0k','k');
    }
    return `${r.code} ${Math.round(val).toLocaleString()}`;
  }
  function applyCurrency(code){
    document.querySelectorAll('[data-price-usd]').forEach(el => {
      const usd = parseFloat(el.dataset.priceUsd);
      if (!isFinite(usd)) return;
      const suffix = el.dataset.priceSuffix || '';
      el.textContent = `${formatPrice(usd, code)}${suffix}`;
    });
    document.querySelectorAll('[data-curr-current]').forEach(el => el.textContent = code);
    document.querySelectorAll('.curr__opt').forEach(o => o.classList.toggle('is-active', o.dataset.curr === code));
    window.dispatchEvent(new CustomEvent('nyara:currency', { detail: { code } }));
  }
  function mountCurrency(){
    const right = ensureNavRight();
    if (!right) return;
    const wish = right.querySelector('.nav__wish');
    const wrap = document.createElement('div');
    wrap.className = 'curr';
    const cur = currentCurrency();
    wrap.innerHTML = `
      <button class="curr__btn" type="button" data-testid="currency-toggle">
        <span data-curr-current>${cur}</span>
        <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="1.6" fill="none"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="curr__menu">
        ${Object.values(RATES).map(r => `
          <button class="curr__opt ${r.code===cur?'is-active':''}" type="button" data-curr="${r.code}" data-testid="currency-${r.code}">
            <span class="curr__opt-code">${r.code}</span>
            <span class="curr__opt-sym">${r.sym} · ${r.label}</span>
          </button>`).join('')}
      </div>`;
    // Insert currency BEFORE wishlist (so order is: Currency · Wishlist · Reserve)
    if (wish) right.insertBefore(wrap, wish);
    else right.insertBefore(wrap, right.firstChild);
    const btn = wrap.querySelector('.curr__btn');
    btn.addEventListener('click', (e) => { e.stopPropagation(); wrap.classList.toggle('is-open'); });
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) wrap.classList.remove('is-open'); });
    wrap.querySelectorAll('.curr__opt').forEach(opt => {
      opt.addEventListener('click', () => {
        const code = opt.dataset.curr;
        localStorage.setItem('nyaraCurrency', code);
        applyCurrency(code);
        wrap.classList.remove('is-open');
      });
    });
    applyCurrency(cur);
  }
  // expose for booking.js
  window.NyaraCurrency = { current: currentCurrency, format: formatPrice, rates: RATES };

  // ============== 8. EXIT-INTENT (booking page only) ==================
  function mountExitIntent(){
    if (!document.body.classList.contains('page-booking')) return;
    if (sessionStorage.getItem('nyaraExitSeen') === '1') return;

    const modal = document.createElement('div');
    modal.className = 'exit';
    modal.innerHTML = `
      <div class="exit__card">
        <button class="exit__close" data-exit-close aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M6 6l12 12M6 18L18 6"/></svg>
        </button>
        <span class="exit__kicker">Soft hold · No commitment</span>
        <h3 class="exit__title">Leaving so soon?<br/>We'll hold your dates.</h3>
        <p class="exit__body">A short, quiet hold. No card needed. We'll keep this villa unbookable by anyone else while you think it through.</p>
        <div class="exit__timer"><span data-exit-timer>30:00</span><span>held</span></div>
        <div class="exit__cta">
          <button class="btn btn--primary" data-exit-continue data-testid="exit-continue">Continue reservation</button>
          <button class="btn btn--text" data-exit-close data-testid="exit-dismiss">Maybe later</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    let timerInt = null;
    function startTimer(){
      let remain = 30 * 60;
      const el = modal.querySelector('[data-exit-timer]');
      timerInt = setInterval(() => {
        remain -= 1;
        if (remain <= 0){ clearInterval(timerInt); el.textContent = '00:00'; return; }
        const m = String(Math.floor(remain/60)).padStart(2,'0');
        const s = String(remain%60).padStart(2,'0');
        el.textContent = `${m}:${s}`;
      }, 1000);
    }

    function open(){
      if (sessionStorage.getItem('nyaraExitSeen') === '1') return;
      sessionStorage.setItem('nyaraExitSeen', '1');
      modal.classList.add('is-open');
      startTimer();
    }
    function close(){
      modal.classList.remove('is-open');
      if (timerInt) clearInterval(timerInt);
    }
    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-exit-close]') || e.target === modal){ close(); }
      if (e.target.closest('[data-exit-continue]')){ close(); }
    });

    // Trigger: mouse leaves top of viewport when dates picked
    let armed = false;
    function arm(){
      // arm only if dates exist (data-cal-in not "—")
      const i = document.querySelector('[data-cal-in]');
      armed = !!(i && i.textContent && i.textContent.trim() && i.textContent.trim() !== '—');
    }
    setInterval(arm, 1200);
    document.addEventListener('mouseout', (e) => {
      if (!armed) return;
      if (e.relatedTarget) return;
      if (e.clientY > 8) return;
      open();
    });
  }

  // ============== BOOTSTRAP ===========================================
  function init(){
    mountIntro();
    applyTimeTint();
    setInterval(applyTimeTint, 5 * 60 * 1000);
    if (!prefersReduced) mountMagneticCursor();
    mountSoundscape();
    mountWhatsApp();
    mountWishlistNav();
    mountWishlistHearts();
    updateWishUI();
    mountCurrency();
    mountExitIntent();
  }
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
