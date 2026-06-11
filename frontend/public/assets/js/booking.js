/* ============================================================
   Nyara Stays — booking.js
   Multi-step luxury booking flow (no dependencies)
   ============================================================ */
(function(){
  'use strict';

  const root = document.querySelector('[data-booking]');
  if (!root) return;

  // --- State ----------------------------------------------------------
  const state = {
    step: 0,
    stay: null,           // 'yume' | 'nyara'
    checkIn: null,        // Date
    checkOut: null,       // Date
    guests: { adults: 2, children: 0, infants: 0 },
    details: { name:'', email:'', phone:'', requests:'' },
    payment: { method: 'card', cardName:'', cardNum:'', expiry:'', cvc:'', save:false },
    calMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    ref: 'NYR-' + Math.random().toString(36).slice(2, 7).toUpperCase()
  };

  const stays = {
    yume:  { name:'Yume by Nyara',  loc:'Uluwatu · Bali',     price: 320, img:'/assets/images/yume/352664100.jpg' },
    nyara: { name:'Nyara Villas',   loc:'Uluwatu · Bali',  price: 680, img:'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1600&q=80' },
  };

  // --- Prefill from URL ----------------------------------------------
  const params = new URLSearchParams(location.search);
  if (params.get('stay') && stays[params.get('stay')]) state.stay = params.get('stay');

  // --- Elements -------------------------------------------------------
  const stepEls   = root.querySelectorAll('[data-step]');
  const nextBtn   = root.querySelector('[data-step-next]');
  const backBtn   = root.querySelector('[data-step-back]');
  const progress  = root.querySelectorAll('[data-progress] .progress__step');
  const progressTxt = root.querySelector('[data-progress-text]');
  const stepLabels = [
    'Destination', 'Dates', 'Guests', 'Summary', 'Your details', 'Payment', 'Confirmation'
  ];
  const mediaImgs = root.querySelectorAll('[data-booking-media] img');
  const mediaStep = root.querySelector('[data-media-step]');
  const mediaTitle = root.querySelector('[data-media-title]');
  const mediaTitles = [
    'Choose where you\'d like to stay.',
    'Pick the days that suit your slow.',
    'Tell us who is joining.',
    'Almost there.',
    'A few details, gently asked.',
    'A gentle hold, no surprises.',
    'Your stay awaits.'
  ];

  // --- Rendering ------------------------------------------------------
  function setStep(n, opts){
    const isInitial = opts && opts.initial;
    state.step = n;
    stepEls.forEach(el => {
      const idx = Number(el.dataset.step);
      el.classList.toggle('is-active', idx === n);
    });
    progress.forEach((p, i) => {
      p.classList.toggle('is-done', i < n);
      p.classList.toggle('is-active', i === n);
    });
    progressTxt.textContent = `Step ${String(n+1).padStart(2,'0')} of 07 · ${stepLabels[n]}`;
    backBtn.hidden = (n === 0 || n === 6);
    nextBtn.textContent = n === 4 ? 'Continue to payment →' : (n === 5 ? 'Pay & confirm' : (n === 6 ? 'Done' : 'Continue →'));
    if (n === 6) {
      root.classList.add('is-confirmed');
      root.querySelector('[data-confirm-ref]').textContent = state.ref;
      nextBtn.hidden = true;
    } else {
      root.classList.remove('is-confirmed');
      nextBtn.hidden = false;
    }
    // Media swap
    const key = (n === 0) ? 'default' : (state.stay || 'default');
    mediaImgs.forEach(img => img.classList.toggle('is-active', img.dataset.mediaKey === key));
    mediaStep.textContent = `Step ${String(n+1).padStart(2,'0')} · ${stepLabels[n]}`;
    mediaTitle.textContent = mediaTitles[n];
    if (n === 2) updateGuestUI();
    if (n === 3) renderSummary();
    if (n === 5) renderPayment();
    if (n === 1) renderCalendar();

    // Snap user to the top of the active step so they don't land on whitespace (mobile especially)
    if (!isInitial && typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const activeStep = root.querySelector('.step.is-active');
        if (!activeStep) return;
        const isMobile = window.matchMedia('(max-width: 1000px)').matches;
        if (isMobile) {
          // Scroll the panel head into view, accounting for sticky nav (~70px)
          const panel = root.querySelector('.booking__panel');
          const target = panel || activeStep;
          const rect = target.getBoundingClientRect();
          const y = window.scrollY + rect.top - 72;
          window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
        } else {
          activeStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
  }

  function canAdvance(){
    if (state.step === 0) return Boolean(state.stay);
    if (state.step === 1) return Boolean(state.checkIn && state.checkOut);
    if (state.step === 2) return state.guests.adults >= 1;
    if (state.step === 4){
      const f = root.querySelector('[data-details]');
      let ok = true;
      f.querySelectorAll('input[required]').forEach(i => {
        if (!i.value.trim()){ i.classList.add('is-error'); ok = false; }
        else i.classList.remove('is-error');
      });
      // email
      const email = f.querySelector('[data-testid="guest-email"]');
      if (email.value && !/.+@.+\..+/.test(email.value)){ email.classList.add('is-error'); ok = false; }
      if (ok){
        state.details.name = f.querySelector('[data-testid="guest-name"]').value.trim();
        state.details.email = email.value.trim();
        state.details.phone = f.querySelector('[data-testid="guest-phone"]').value.trim();
        state.details.requests = f.querySelector('[data-testid="guest-requests"]').value.trim();
      }
      return ok;
    }
    if (state.step === 5){
      // Stripe Payment Element flow — validation handled inside confirmStripePayment.
      // canAdvance just confirms the cardholder name is filled so the next click
      // can proceed to actually charge the card.
      const nameEl = root.querySelector('[data-pay-cardname]');
      const name = (nameEl && nameEl.value || '').trim();
      if (!name){
        if (nameEl) nameEl.classList.add('is-error');
        setPayError('Please enter the cardholder name.');
        return false;
      }
      if (nameEl) nameEl.classList.remove('is-error');
      state.payment.cardName = name;
      return true;
    }
    return true;
  }

  // --- Destination ----------------------------------------------------
  root.querySelectorAll('[data-dest]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.stay = btn.dataset.dest;
      root.querySelectorAll('[data-dest]').forEach(b => b.classList.toggle('is-selected', b === btn));
    });
  });
  // Apply prefilled stay (URL param)
  if (state.stay){
    const sel = root.querySelector(`[data-dest="${state.stay}"]`);
    if (sel) sel.classList.add('is-selected');
  }

  // --- Calendar -------------------------------------------------------
  const calGrid  = root.querySelector('[data-cal-grid]');
  const calMonth = root.querySelector('[data-cal-month]');
  const calIn    = root.querySelector('[data-cal-in]');
  const calOut   = root.querySelector('[data-cal-out]');
  const calNts   = root.querySelector('[data-cal-nights]');
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function fmt(d){ if(!d) return '—'; return d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }); }
  function isSameDay(a,b){ return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
  function startOfDay(d){ const x = new Date(d); x.setHours(0,0,0,0); return x; }

  function renderCalendar(){
    const m = state.calMonth;
    calMonth.textContent = `${monthNames[m.getMonth()]} ${m.getFullYear()}`;
    calGrid.innerHTML = '';

    // Disable prev if month <= current month
    const today = startOfDay(new Date());
    const firstOfMonth = new Date(m.getFullYear(), m.getMonth(), 1);
    root.querySelector('[data-cal-prev]').disabled = firstOfMonth <= new Date(today.getFullYear(), today.getMonth(), 1);

    // Build days
    const firstDayIdx = (new Date(m.getFullYear(), m.getMonth(), 1).getDay() + 6) % 7; // Monday=0
    const daysInMonth = new Date(m.getFullYear(), m.getMonth()+1, 0).getDate();
    const prevDays = new Date(m.getFullYear(), m.getMonth(), 0).getDate();

    for (let i=0;i<firstDayIdx;i++){
      const d = prevDays - firstDayIdx + 1 + i;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal__day is-muted';
      btn.textContent = d;
      calGrid.appendChild(btn);
    }
    for (let d=1; d<=daysInMonth; d++){
      const date = new Date(m.getFullYear(), m.getMonth(), d);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal__day';
      btn.textContent = d;
      // Seasonal tier (Bali / Phuket calendar)
      const mon = date.getMonth();
      // High: Jul, Aug, Dec, Jan
      // Mid:  May, Jun, Sep
      // Low:  Feb, Mar, Apr, Oct, Nov
      let tier = 'low';
      if ([6,7,11,0].includes(mon))      tier = 'high';
      else if ([4,5,8].includes(mon))    tier = 'mid';
      btn.classList.add(`is-tier-${tier}`);
      if (date < today) btn.classList.add('is-past');
      if (isSameDay(date, today)) btn.classList.add('is-today');
      if (isSameDay(date, state.checkIn))  btn.classList.add('is-start');
      if (isSameDay(date, state.checkOut)) btn.classList.add('is-end');
      if (state.checkIn && state.checkOut && date > state.checkIn && date < state.checkOut) btn.classList.add('is-in-range');
      btn.addEventListener('click', () => pickDay(date));
      calGrid.appendChild(btn);
    }
    // Fill out to 6 rows
    const totalCells = firstDayIdx + daysInMonth;
    const trailing = (7 - (totalCells % 7)) % 7;
    for (let i=1; i<=trailing; i++){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cal__day is-muted';
      btn.textContent = i;
      calGrid.appendChild(btn);
    }

    calIn.textContent = fmt(state.checkIn);
    calOut.textContent = fmt(state.checkOut);
    calNts.textContent = nightsCount() || '—';
  }
  function nightsCount(){
    if (!state.checkIn || !state.checkOut) return 0;
    return Math.round((state.checkOut - state.checkIn) / 86400000);
  }
  function pickDay(date){
    const today = startOfDay(new Date());
    if (date < today) return;
    if (!state.checkIn || (state.checkIn && state.checkOut)){
      state.checkIn = date; state.checkOut = null;
    } else if (date <= state.checkIn){
      state.checkIn = date; state.checkOut = null;
    } else {
      state.checkOut = date;
    }
    renderCalendar();
  }
  root.querySelector('[data-cal-prev]').addEventListener('click', () => {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth()-1, 1);
    renderCalendar();
  });
  root.querySelector('[data-cal-next]').addEventListener('click', () => {
    state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth()+1, 1);
    renderCalendar();
  });

  // --- Guests ---------------------------------------------------------
  root.querySelectorAll('[data-guest]').forEach(row => {
    const key = row.dataset.guest;
    const val = row.querySelector('[data-step-val]');
    row.querySelectorAll('[data-step-dir]').forEach(b => {
      b.addEventListener('click', () => {
        const dir = Number(b.dataset.stepDir);
        const min = key === 'adults' ? 1 : 0;
        const max = key === 'infants' ? 4 : 10;
        let v = state.guests[key] + dir;
        if (v < min || v > max) return;
        state.guests[key] = v;
        val.textContent = v;
        // Subtle pop
        val.animate([{transform:'scale(1.2)'},{transform:'scale(1)'}], {duration:240, easing:'cubic-bezier(.2,.7,.2,1)'});
        updateGuestUI();
      });
    });
  });
  function updateGuestUI(){
    root.querySelectorAll('[data-guest]').forEach(row => {
      const k = row.dataset.guest;
      const min = k === 'adults' ? 1 : 0;
      const max = k === 'infants' ? 4 : 10;
      const dec = row.querySelector('[data-step-dir="-1"]');
      const inc = row.querySelector('[data-step-dir="1"]');
      dec.disabled = state.guests[k] <= min;
      inc.disabled = state.guests[k] >= max;
      row.querySelector('[data-step-val]').textContent = state.guests[k];
    });
  }

  // --- Currency helpers ----------------------------------------------
  function fmtPrice(usd){
    if (!usd) return '—';
    const NC = window.NyaraCurrency;
    if (NC) return NC.format(usd, NC.current());
    return `USD ${Math.round(usd).toLocaleString()}`;
  }
  // Re-render summary/payment when currency changes
  window.addEventListener('nyara:currency', () => {
    if (state.step === 3) renderSummary();
    if (state.step === 5) renderPayment();
  });

  // --- Summary --------------------------------------------------------
  function renderSummary(){
    const s = stays[state.stay] || stays.yume;
    root.querySelector('[data-sum-img]').src = s.img;
    root.querySelector('[data-sum-loc]').textContent = s.loc;
    root.querySelector('[data-sum-name]').textContent = s.name;
    root.querySelector('[data-sum-in]').textContent  = fmt(state.checkIn);
    root.querySelector('[data-sum-out]').textContent = fmt(state.checkOut);
    const nights = nightsCount();
    root.querySelector('[data-sum-nights]').textContent = nights ? `${nights} ${nights===1?'night':'nights'}` : '—';
    const g = state.guests;
    const guestsTxt = [
      `${g.adults} ${g.adults===1?'adult':'adults'}`,
      g.children ? `${g.children} ${g.children===1?'child':'children'}` : null,
      g.infants ? `${g.infants} ${g.infants===1?'infant':'infants'}` : null
    ].filter(Boolean).join(' · ');
    root.querySelector('[data-sum-guests]').textContent = guestsTxt;
    const total = (nights || 0) * s.price;
    root.querySelector('[data-sum-total]').textContent = total ? fmtPrice(total) : '—';
  }

  // --- Floating labels — keep visible when filled --------------------
  root.querySelectorAll('.field input, .field textarea').forEach(el => {
    el.setAttribute('placeholder', ' '); // forces :not(:placeholder-shown) to work
    el.addEventListener('input', () => { el.classList.remove('is-error'); });
  });

  // --- Payment (real Stripe Payment Element) --------------------------
  const stripeState = {
    instance: null,           // Stripe.js loaded instance
    elements: null,           // Elements group
    paymentElement: null,     // mounted PaymentElement
    clientSecret: null,
    paymentIntentId: null,
    bookingRef: null,
    currency: null,
    isoCurrency: null,
    totalMinor: 0,
    depositMinor: 0,
    publishableKey: '',
    isMounting: false,
    isConfirming: false,
  };

  function isoDate(d){
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function fmtMinor(minor, currency){
    if (typeof minor !== 'number') return '—';
    const zeroDecimal = ['IDR','JPY','KRW','VND','CLP'].includes(currency);
    const amount = zeroDecimal ? minor : minor / 100;
    try {
      return new Intl.NumberFormat('en-US', { style:'currency', currency, maximumFractionDigits: zeroDecimal ? 0 : 0 }).format(amount);
    } catch(e){
      return `${currency} ${Math.round(amount).toLocaleString()}`;
    }
  }
  function setPayError(msg){
    const el = root.querySelector('[data-pay-error]');
    if (!el) return;
    if (msg){ el.textContent = msg; el.hidden = false; }
    else { el.textContent = ''; el.hidden = true; }
  }
  function setPayStatus(msg){
    const el = root.querySelector('[data-pay-status]');
    if (!el) return;
    if (msg){ el.textContent = msg; el.hidden = false; }
    else { el.textContent = ''; el.hidden = true; }
  }

  async function renderPayment(){
    setPayError('');
    setPayStatus('');
    const totalEl = root.querySelector('[data-pay-total]');
    const holdEl  = root.querySelector('[data-pay-hold]');
    const placeholder = root.querySelector('[data-pay-placeholder]');
    const mountEl = root.querySelector('[data-stripe-element]');
    if (placeholder) placeholder.style.display = '';

    // Reset previous element if re-rendering (currency change etc.)
    if (stripeState.paymentElement){
      try { stripeState.paymentElement.unmount(); } catch(_){}
      stripeState.paymentElement = null;
      stripeState.elements = null;
    }

    if (stripeState.isMounting) return;
    stripeState.isMounting = true;

    const NC = window.NyaraCurrency;
    const currency = (NC && NC.current()) ? NC.current().toUpperCase() : 'USD';
    const payload = {
      stay: state.stay,
      check_in: isoDate(state.checkIn),
      check_out: isoDate(state.checkOut),
      guests: { adults: state.guests.adults, children: state.guests.children, infants: state.guests.infants },
      currency,
      customer: {
        name: (state.details && state.details.name) || 'Guest',
        email: (state.details && state.details.email) || 'guest@nyarastays.co',
        phone: (state.details && state.details.phone) || '+10000000000',
        requests: (state.details && state.details.requests) || '',
      },
    };

    let data;
    try {
      const res = await fetch('/api/booking/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Could not start payment');
    } catch (e) {
      stripeState.isMounting = false;
      if (placeholder) placeholder.style.display = 'none';
      setPayError(e.message + ' — please try again or contact booking@nyarastays.co');
      if (totalEl) totalEl.textContent = '—';
      if (holdEl)  holdEl.textContent  = '—';
      return;
    }

    stripeState.clientSecret = data.client_secret;
    stripeState.paymentIntentId = data.payment_intent_id;
    stripeState.bookingRef = data.booking_ref;
    stripeState.publishableKey = data.publishable_key || '';
    stripeState.currency = data.currency;
    stripeState.totalMinor = data.amount_total_minor;
    stripeState.depositMinor = data.amount_deposit_minor;

    if (totalEl) totalEl.textContent = fmtMinor(data.amount_total_minor, data.currency);
    if (holdEl)  holdEl.textContent  = fmtMinor(data.amount_deposit_minor, data.currency);
    updateNextButton();

    if (!stripeState.publishableKey){
      stripeState.isMounting = false;
      if (placeholder) placeholder.style.display = 'none';
      setPayError('Payments are not yet activated for this site. Please contact booking@nyarastays.co and we will hold your stay manually.');
      return;
    }

    if (!window.Stripe){
      stripeState.isMounting = false;
      setPayError('Could not load Stripe.js. Check your connection and try again.');
      return;
    }

    if (!stripeState.instance || stripeState.instance._key !== stripeState.publishableKey){
      stripeState.instance = window.Stripe(stripeState.publishableKey);
      stripeState.instance._key = stripeState.publishableKey;
    }

    const appearance = {
      theme: 'flat',
      variables: {
        colorPrimary: '#1a1a1a',
        colorBackground: '#fffdf7',
        colorText: '#1a1a1a',
        colorDanger: '#b3261e',
        fontFamily: '"Manrope", system-ui, sans-serif',
        spacingUnit: '4px',
        borderRadius: '4px',
        fontSizeBase: '15px',
      },
      rules: {
        '.Input': {
          border: '1px solid rgba(26,26,26,.18)',
          padding: '14px 14px',
          backgroundColor: 'transparent',
          boxShadow: 'none',
        },
        '.Input:focus': {
          border: '1px solid rgba(26,26,26,.55)',
          boxShadow: 'none',
        },
        '.Label': {
          fontSize: '11px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'rgba(26,26,26,.55)',
          fontWeight: '500',
        },
        '.Tab': { border: '1px solid rgba(26,26,26,.18)', padding: '12px' },
        '.Tab--selected': { borderColor: '#1a1a1a' },
      },
    };

    stripeState.elements = stripeState.instance.elements({
      clientSecret: stripeState.clientSecret,
      appearance,
    });
    stripeState.paymentElement = stripeState.elements.create('payment', {
      layout: { type: 'tabs', defaultCollapsed: false },
    });
    stripeState.paymentElement.on('ready', () => {
      if (placeholder) placeholder.style.display = 'none';
      stripeState.isMounting = false;
      updateNextButton();
    });
    stripeState.paymentElement.on('change', (ev) => {
      if (ev.error) setPayError(ev.error.message); else setPayError('');
    });
    stripeState.paymentElement.mount(mountEl);
  }

  async function confirmStripePayment(){
    if (stripeState.isConfirming) return;
    if (!stripeState.elements || !stripeState.instance){
      setPayError('Payment is still loading — give it a second.');
      return;
    }
    const nameEl = root.querySelector('[data-pay-cardname]');
    const name = (nameEl && nameEl.value || '').trim();
    if (!name){
      setPayError('Please enter the cardholder name.');
      nameEl && nameEl.focus();
      return;
    }
    stripeState.isConfirming = true;
    setPayError('');
    setPayStatus('Authorising your card securely…');
    updateNextButton();

    const { error, paymentIntent } = await stripeState.instance.confirmPayment({
      elements: stripeState.elements,
      confirmParams: {
        return_url: window.location.origin + '/booking.html?step=6',
        payment_method_data: {
          billing_details: {
            name,
            email: (state.details && state.details.email) || undefined,
            phone: (state.details && state.details.phone) || undefined,
          },
        },
      },
      redirect: 'if_required',
    });

    stripeState.isConfirming = false;
    setPayStatus('');
    updateNextButton();

    if (error){
      setPayError(error.message || 'Payment could not be completed.');
      return;
    }
    if (paymentIntent && paymentIntent.status === 'succeeded'){
      // Tell the backend to settle the booking record so balance-due tracking is in sync.
      try {
        await fetch('/api/booking/payment-status/' + encodeURIComponent(paymentIntent.id));
      } catch(_){}
      const refEl = root.querySelector('[data-confirm-ref]');
      if (refEl) refEl.textContent = stripeState.bookingRef || '—';
      setStep(6);
      return;
    }
    if (paymentIntent && paymentIntent.status === 'processing'){
      try {
        await fetch('/api/booking/payment-status/' + encodeURIComponent(paymentIntent.id));
      } catch(_){}
      const refEl = root.querySelector('[data-confirm-ref]');
      if (refEl) refEl.textContent = stripeState.bookingRef || '—';
      setStep(6);
      return;
    }
    setPayError('Payment status: ' + (paymentIntent ? paymentIntent.status : 'unknown') + '. Please retry.');
  }

  // Re-render summary/payment when currency changes
  window.addEventListener('nyara:currency', () => {
    if (state.step === 3) renderSummary();
    if (state.step === 5) renderPayment();
  });

  // --- Navigation -----------------------------------------------------
  function updateNextButton(){
    if (state.step !== 5){
      nextBtn.disabled = false;
      return;
    }
    const ready = !!stripeState.paymentElement && !!stripeState.clientSecret && !stripeState.isMounting;
    nextBtn.disabled = stripeState.isConfirming || !ready;
    nextBtn.textContent = stripeState.isConfirming ? 'Processing…' : 'Pay & confirm';
  }

  nextBtn.addEventListener('click', async () => {
    if (!canAdvance()){
      // small shake
      nextBtn.animate([{transform:'translateX(0)'},{transform:'translateX(-6px)'},{transform:'translateX(6px)'},{transform:'translateX(0)'}], {duration:340});
      return;
    }
    if (state.step === 5){
      // Trigger the actual Stripe payment confirmation.
      await confirmStripePayment();
      return;
    }
    if (state.step < 6) setStep(state.step + 1);
  });
  backBtn.addEventListener('click', (e) => { e.preventDefault(); if (state.step > 0) setStep(state.step - 1); });

  // Init
  setStep(0, { initial: true });
})();
