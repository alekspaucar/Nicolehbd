(function () {
  'use strict';

  const revealSelector = '.birthday-letter, .dedication-section, .music-section, .album-intro, .chapter-heading, .memory';
  const motion = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const pending = new Set();
  let started = false;
  let observer = null;
  let watchingMotion = false;
  let dismissIntro = null;
  let stopConfetti = null;

  function prefersLessMotion() {
    return Boolean(motion && motion.matches);
  }

  function releaseMotionListener() {
    if (!motion || !watchingMotion || pending.size || dismissIntro || stopConfetti) return;
    if (typeof motion.removeEventListener === 'function') motion.removeEventListener('change', onMotionChange);
    else if (typeof motion.removeListener === 'function') motion.removeListener(onMotionChange);
    watchingMotion = false;
  }

  function watchMotion() {
    if (!motion || watchingMotion) return;
    if (typeof motion.addEventListener === 'function') motion.addEventListener('change', onMotionChange);
    else if (typeof motion.addListener === 'function') motion.addListener(onMotionChange);
    else return;
    watchingMotion = true;
  }

  function reveal(element) {
    element.classList.remove('reveal-pending');
    element.classList.add('is-revealed');
    pending.delete(element);
    if (observer) observer.unobserve(element);
    if (!pending.size && observer) {
      observer.disconnect();
      observer = null;
    }
    releaseMotionListener();
  }

  function revealAll() {
    Array.from(pending).forEach(reveal);
    if (observer) observer.disconnect();
    observer = null;
  }

  function onMotionChange() {
    if (!prefersLessMotion()) return;
    if (stopConfetti) stopConfetti();
    revealAll();
    releaseMotionListener();
  }

  function observe(root) {
    root = root || document;
    const elements = [];
    if (typeof root.matches === 'function' && root.matches(revealSelector)) elements.push(root);
    if (typeof root.querySelectorAll === 'function') elements.push.apply(elements, root.querySelectorAll(revealSelector));
    if (!elements.length) return;

    if (prefersLessMotion() || typeof window.IntersectionObserver !== 'function') {
      elements.forEach(reveal);
      return;
    }

    try {
      if (!observer) {
        observer = new window.IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting || entry.boundingClientRect.bottom <= 0) reveal(entry.target);
          });
        }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' });
      }
      elements.forEach(function (element) {
        if (element.classList.contains('is-revealed') || pending.has(element)) return;
        pending.add(element);
        element.classList.add('reveal-pending');
        observer.observe(element);
      });
      if (pending.size) watchMotion();
    } catch (_) {
      revealAll();
      elements.forEach(reveal);
    }
  }

  function showIntro() {
    const intro = document.getElementById('birthday-intro');
    const continueButton = document.getElementById('intro-continue');
    if (!intro || typeof intro.showModal !== 'function' || typeof intro.close !== 'function') return;
    const previousFocus = document.activeElement;
    let finished = false;

    function closeIntro(restoreFocus) {
      if (finished) return;
      finished = true;
      const hadFocus = intro.open && (document.activeElement === intro || intro.contains(document.activeElement));
      if (continueButton) continueButton.removeEventListener('click', onContinue);
      intro.removeEventListener('cancel', onCancel);
      intro.removeEventListener('close', onClose);
      document.body.classList.remove('is-celebrating');
      dismissIntro = null;
      if (intro.open) intro.close();
      if (stopConfetti) stopConfetti();

      const active = document.activeElement;
      const focusIsAvailable = !active || active === document.body || active === previousFocus || intro.contains(active);
      if (restoreFocus && hadFocus && focusIsAvailable && !document.hidden && !document.querySelector('dialog[open]')) {
        const title = document.getElementById('birthday-title');
        if (title) title.focus({ preventScroll: true });
      }
      releaseMotionListener();
    }

    function onContinue() { closeIntro(true); }
    function onCancel(event) { event.preventDefault(); }
    function onClose() { closeIntro(false); }

    try {
      intro.showModal();
    } catch (_) {
      return;
    }
    if (!intro.open) return;
    dismissIntro = closeIntro;
    document.body.classList.add('is-celebrating');
    if (continueButton) {
      continueButton.addEventListener('click', onContinue);
      continueButton.focus({ preventScroll: true });
    }
    intro.addEventListener('cancel', onCancel);
    intro.addEventListener('close', onClose);
    watchMotion();
  }

  function launchConfetti() {
    const canvas = document.getElementById('birthday-confetti');
    if (!canvas || typeof canvas.getContext !== 'function' || typeof window.requestAnimationFrame !== 'function') return;
    const containingDialog = canvas.closest('dialog');
    if (containingDialog && !containingDialog.open) return;
    let context;
    try { context = canvas.getContext('2d'); } catch (_) { return; }
    if (!context) return;

    const colors = ['#d6ac57', '#e6b6bc', '#f2dca4', '#bdaccc', '#94aaa0'];
    const duration = 4400;
    let width = 0;
    let height = 0;
    let frame = null;
    let startedAt = null;
    let previousTime = null;
    let finished = false;
    const particles = [];

    function fitCanvas() {
      const oldWidth = width;
      width = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 1);
      height = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 1);
      const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      canvas.width = Math.ceil(width * ratio);
      canvas.height = Math.ceil(height * ratio);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (oldWidth) particles.forEach(function (particle) { particle.x *= width / oldWidth; });
    }

    function cleanup() {
      if (finished) return;
      finished = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', fitCanvas);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      context.clearRect(0, 0, width, height);
      canvas.hidden = true;
      canvas.width = 1;
      canvas.height = 1;
      particles.length = 0;
      stopConfetti = null;
      releaseMotionListener();
    }

    function onVisibilityChange() { if (document.hidden) cleanup(); }

    function draw(time) {
      if (finished) return;
      if (startedAt === null) startedAt = time;
      const elapsed = time - startedAt;
      if (elapsed >= duration || document.hidden || prefersLessMotion()) {
        cleanup();
        return;
      }
      const step = previousTime === null ? 0 : Math.min((time - previousTime) / 1000, 0.04);
      previousTime = time;
      context.clearRect(0, 0, width, height);
      context.globalAlpha = Math.min(1, (duration - elapsed) / 1100);
      particles.forEach(function (particle) {
        particle.x += (particle.vx + Math.sin(elapsed / 550 + particle.phase) * 22) * step;
        particle.y += particle.vy * step;
        particle.vy += 76 * step;
        particle.angle += particle.spin * step;
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.angle);
        context.fillStyle = particle.color;
        context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
        context.restore();
      });
      frame = window.requestAnimationFrame(draw);
    }

    fitCanvas();
    const count = width <= 640 ? 75 : 120;
    for (let index = 0; index < count; index += 1) {
      particles.push({
        x: Math.random() * width,
        y: -20 - Math.random() * height * 0.55,
        vx: (Math.random() - 0.5) * 70,
        vy: 95 + Math.random() * 95,
        size: 4 + Math.random() * 5,
        angle: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 5,
        phase: Math.random() * Math.PI * 2,
        color: colors[index % colors.length]
      });
    }
    stopConfetti = cleanup;
    canvas.hidden = false;
    window.addEventListener('resize', fitCanvas, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    watchMotion();
    frame = window.requestAnimationFrame(draw);
  }

  function start() {
    if (started || !document.documentElement.classList.contains('unlocked')) return;
    started = true;
    const page = document.getElementById('page');
    if (page) page.classList.add('celebration-ready');
    observe(page || document);
    showIntro();
    if (prefersLessMotion() || document.hidden) return;
    launchConfetti();
  }

  window.BirthdayCelebration = { start: start, observe: observe };
})();
