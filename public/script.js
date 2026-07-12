/* WeCare Counseling — premium interactions */
(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // ---------- Mobile nav ----------
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const open = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    navLinks.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.setAttribute('aria-label', 'Open menu');
      }
    });
  }

  // ---------- Scroll progress + nav state ----------
  const nav = document.querySelector('.nav');
  const progress = document.getElementById('navProgress');
  const onScrollChrome = () => {
    const y = window.scrollY || 0;
    if (nav) nav.classList.toggle('scrolled', y > 12);
    if (progress) {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (y / max) * 100 : 0;
      progress.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    }
  };
  window.addEventListener('scroll', onScrollChrome, { passive: true });
  onScrollChrome();

  // ---------- Cursor glow ----------
  const glow = document.getElementById('cursorGlow');
  if (glow && !reduceMotion && window.matchMedia('(hover: hover)').matches) {
    let gx = window.innerWidth / 2;
    let gy = window.innerHeight / 2;
    let tx = gx;
    let ty = gy;
    window.addEventListener('pointermove', (e) => {
      tx = e.clientX;
      ty = e.clientY;
    }, { passive: true });
    const tickGlow = () => {
      gx += (tx - gx) * 0.12;
      gy += (ty - gy) * 0.12;
      glow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
      requestAnimationFrame(tickGlow);
    };
    requestAnimationFrame(tickGlow);
  }

  // ---------- Hero video ----------
  const heroMedia = document.getElementById('heroMedia');
  const heroVideo = document.getElementById('heroVideo');
  if (heroVideo && heroMedia) {
    const tryPlay = () => {
      if (reduceMotion) return;
      const p = heroVideo.play();
      if (p && typeof p.then === 'function') {
        p.then(() => heroMedia.classList.add('has-video'))
          .catch(() => { /* keep poster image */ });
      }
    };
    if (heroVideo.readyState >= 2) tryPlay();
    else heroVideo.addEventListener('loadeddata', tryPlay, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) heroVideo.pause();
      else tryPlay();
    });
  }

  // ---------- Scroll reveal ----------
  const revealEls = document.querySelectorAll('[data-reveal]');
  if (revealEls.length) {
    if (reduceMotion || !('IntersectionObserver' in window)) {
      revealEls.forEach((el) => el.classList.add('is-visible'));
    } else {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target;
          const delay = Number(el.getAttribute('data-reveal-delay') || 0);
          if (delay) {
            setTimeout(() => el.classList.add('is-visible'), delay);
          } else {
            el.classList.add('is-visible');
          }
          io.unobserve(el);
        });
      }, { threshold: 0.14, rootMargin: '0px 0px -40px 0px' });
      revealEls.forEach((el) => io.observe(el));
    }
  }

  // ---------- 3D tilt / parallax on media & cards ----------
  const tiltEls = document.querySelectorAll('[data-tilt]');
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (!reduceMotion && canHover) {
    tiltEls.forEach((el) => {
      const max = el.classList.contains('hero-media') ? 8 : 6;
      let raf = 0;
      let mx = 0;
      let my = 0;

      const apply = () => {
        raf = 0;
        const rect = el.getBoundingClientRect();
        const px = (mx - rect.left) / rect.width - 0.5;
        const py = (my - rect.top) / rect.height - 0.5;
        const rx = (-py * max).toFixed(2);
        const ry = (px * max).toFixed(2);
        el.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;

        el.querySelectorAll('[data-depth]').forEach((layer) => {
          const d = Number(layer.getAttribute('data-depth') || 0.05);
          layer.style.transform = `translate3d(${(px * d * 40).toFixed(1)}px, ${(py * d * 40).toFixed(1)}px, 0)`;
        });

        if (el.classList.contains('card')) {
          el.style.setProperty('--mx', `${(px + 0.5) * 100}%`);
          el.style.setProperty('--my', `${(py + 0.5) * 100}%`);
        }
      };

      el.addEventListener('pointermove', (e) => {
        mx = e.clientX;
        my = e.clientY;
        if (!raf) raf = requestAnimationFrame(apply);
      });
      el.addEventListener('pointerleave', () => {
        el.style.transform = '';
        el.querySelectorAll('[data-depth]').forEach((layer) => {
          layer.style.transform = '';
        });
      });
    });
  }

  // ---------- Hero background parallax on scroll ----------
  const hero = document.getElementById('hero');
  const orbs = document.querySelectorAll('.hero-orb[data-depth]');
  if (!reduceMotion && hero && orbs.length) {
    let ticking = false;
    const updateParallax = () => {
      ticking = false;
      const rect = hero.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      const progressY = (window.innerHeight / 2 - (rect.top + rect.height / 2)) / window.innerHeight;
      orbs.forEach((orb) => {
        const d = Number(orb.getAttribute('data-depth') || 0.1);
        orb.style.transform = `translate3d(0, ${(progressY * d * 180).toFixed(1)}px, 0)`;
      });
    };
    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateParallax);
      }
    }, { passive: true });
    updateParallax();
  }

  // ---------- Magnetic primary CTA ----------
  if (!reduceMotion && canHover) {
    document.querySelectorAll('.btn-magnetic').forEach((btn) => {
      btn.addEventListener('pointermove', (e) => {
        const r = btn.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2;
        const y = e.clientY - r.top - r.height / 2;
        btn.style.transform = `translate(${x * 0.15}px, ${y * 0.2}px)`;
      });
      btn.addEventListener('pointerleave', () => {
        btn.style.transform = '';
      });
    });
  }

  // ---------- Contact form ----------
  const form = document.getElementById('contactForm');
  const statusEl = document.getElementById('formStatus');
  const submitBtn = document.getElementById('submitBtn');

  function showStatus(msg, ok) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = 'form-status ' + (ok ? 'ok' : 'err');
  }

  if (form && submitBtn) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      statusEl.className = 'form-status';
      const data = Object.fromEntries(new FormData(form).entries());

      if (!String(data.name || '').trim()) return showStatus('Please enter your name.', false);
      if (!String(data.email || '').trim() && !String(data.phone || '').trim()) {
        return showStatus('Please provide an email or phone number so we can reach you.', false);
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending…';
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
        form.reset();
        showStatus('Thank you — your request has been received. Lisa will reach out soon.', true);
      } catch (err) {
        showStatus(err.message || 'Something went wrong. Please try again.', false);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Request';
      }
    });
  }

  // ---------- FAQ: only one open at a time (optional polish) ----------
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach((item) => {
    item.addEventListener('toggle', () => {
      if (!item.open) return;
      faqItems.forEach((other) => {
        if (other !== item) other.open = false;
      });
    });
  });
})();
