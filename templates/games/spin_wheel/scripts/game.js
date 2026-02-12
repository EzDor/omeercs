class SpinWheelGame {
  constructor(config) {
    this.config = config;
    this.canvas = document.getElementById('wheel-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.spinButton = document.getElementById('spin-button');
    this.resultOverlay = document.getElementById('result-overlay');
    this.resultTitle = document.getElementById('result-title');
    this.resultMessage = document.getElementById('result-message');
    this.resultPrize = document.getElementById('result-prize');

    this.currentAngle = 0;
    this.isSpinning = false;
    this.segments = this.buildSegments();

    this.applyThemeColors();
    this.setupCanvas();
    this.bindEvents();
    this.draw();
    this.loadAudio();
  }

  buildSegments() {
    const mechanics = this.config.mechanics || {};
    if (mechanics.segments && Array.isArray(mechanics.segments)) {
      return mechanics.segments;
    }

    const colors = this.config.visuals?.colors || {};
    return [
      { label: 'Prize 1', color: colors.primary || '#e94560', prize: '10% Off', weight: 20 },
      { label: 'Prize 2', color: colors.secondary || '#0f3460', prize: '20% Off', weight: 15 },
      { label: 'Try Again', color: colors.accent || '#16213e', prize: null, weight: 30 },
      { label: 'Prize 3', color: colors.primary || '#e94560', prize: 'Free Item', weight: 10 },
      { label: 'Prize 4', color: colors.secondary || '#0f3460', prize: '15% Off', weight: 15 },
      { label: 'Try Again', color: colors.accent || '#16213e', prize: null, weight: 10 },
    ];
  }

  applyThemeColors() {
    const colors = this.config.visuals?.colors || {};
    const root = document.documentElement;

    if (colors.primary) root.style.setProperty('--primary-color', colors.primary);
    if (colors.secondary) root.style.setProperty('--secondary-color', colors.secondary);
    if (colors.accent) root.style.setProperty('--accent-color', colors.accent);
    if (colors.background) {
      root.style.setProperty('--bg-primary', colors.background);
      root.style.setProperty('--bg-secondary', this.darkenColor(colors.background, 20));
    }
  }

  darkenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max((num >> 16) - amt, 0);
    const G = Math.max((num >> 8 & 0x00FF) - amt, 0);
    const B = Math.max((num & 0x0000FF) - amt, 0);
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  }

  setupCanvas() {
    const container = document.getElementById('game-container');
    const size = Math.min(container.clientWidth, container.clientHeight) * 0.7;

    this.canvas.width = size;
    this.canvas.height = size;
    this.centerX = size / 2;
    this.centerY = size / 2;
    this.radius = size / 2 - 10;
  }

  bindEvents() {
    this.spinButton.addEventListener('click', () => this.spin());
    this.spinButton.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.spin();
    });

    this.resultOverlay.addEventListener('click', () => this.hideResult());

    window.addEventListener('resize', () => {
      this.setupCanvas();
      this.draw();
    });
  }

  loadAudio() {
    const audioConfig = this.config.audio || {};
    this.audioEnabled = audioConfig.bgm?.enabled !== false;

    if (this.audioEnabled) {
      this.spinSound = new Audio();
      this.winSound = new Audio();
      this.loseSound = new Audio();

      const assets = this.config.visuals?.assets || {};
      if (assets.spin_sound?.uri) this.spinSound.src = assets.spin_sound.uri;
      if (assets.win_sound?.uri) this.winSound.src = assets.win_sound.uri;
      if (assets.lose_sound?.uri) this.loseSound.src = assets.lose_sound.uri;
    }
  }

  draw() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const totalWeight = this.segments.reduce((sum, s) => sum + (s.weight || 1), 0);
    let currentAngle = this.currentAngle;

    this.ctx.save();
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    this.ctx.shadowBlur = 20;
    this.ctx.shadowOffsetX = 0;
    this.ctx.shadowOffsetY = 5;

    this.segments.forEach((segment, index) => {
      const segmentAngle = ((segment.weight || 1) / totalWeight) * Math.PI * 2;

      this.ctx.beginPath();
      this.ctx.moveTo(this.centerX, this.centerY);
      this.ctx.arc(this.centerX, this.centerY, this.radius, currentAngle, currentAngle + segmentAngle);
      this.ctx.closePath();

      this.ctx.fillStyle = segment.color || this.getDefaultColor(index);
      this.ctx.fill();

      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      this.drawSegmentText(segment.label, currentAngle, segmentAngle);

      currentAngle += segmentAngle;
    });

    this.ctx.restore();

    this.drawCenterCircle();
  }

  getDefaultColor(index) {
    const colors = ['#e94560', '#0f3460', '#16213e', '#533483', '#e94560', '#0f3460'];
    return colors[index % colors.length];
  }

  drawSegmentText(text, startAngle, segmentAngle) {
    const textAngle = startAngle + segmentAngle / 2;
    const textRadius = this.radius * 0.65;

    this.ctx.save();
    this.ctx.translate(this.centerX, this.centerY);
    this.ctx.rotate(textAngle);
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    const fontSize = Math.max(12, this.radius * 0.08);
    this.ctx.font = `bold ${fontSize}px sans-serif`;
    this.ctx.fillStyle = 'white';
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    this.ctx.shadowBlur = 4;

    const maxWidth = this.radius * 0.4;
    const words = text.split(' ');
    let line = '';
    let y = textRadius;

    if (words.length > 1) {
      y -= fontSize / 2;
    }

    words.forEach((word, i) => {
      const testLine = line + (line ? ' ' : '') + word;
      if (this.ctx.measureText(testLine).width > maxWidth && line) {
        this.ctx.fillText(line, textRadius, y - fontSize / 2);
        line = word;
        y += fontSize;
      } else {
        line = testLine;
      }
    });
    this.ctx.fillText(line, textRadius, y - fontSize / 2);

    this.ctx.restore();
  }

  drawCenterCircle() {
    const centerRadius = this.radius * 0.15;

    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, centerRadius, 0, Math.PI * 2);
    this.ctx.fillStyle = 'white';
    this.ctx.fill();

    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, centerRadius - 4, 0, Math.PI * 2);
    const gradient = this.ctx.createRadialGradient(
      this.centerX, this.centerY, 0,
      this.centerX, this.centerY, centerRadius - 4
    );
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(1, '#e0e0e0');
    this.ctx.fillStyle = gradient;
    this.ctx.fill();
  }

  spin() {
    if (this.isSpinning) return;

    this.isSpinning = true;
    this.spinButton.disabled = true;
    this.spinButton.classList.add('spinning');

    if (this.spinSound && this.spinSound.src) {
      this.spinSound.currentTime = 0;
      this.spinSound.play().catch(() => {});
    }

    const winningSegmentIndex = this.determineWinner();
    const targetAngle = this.calculateTargetAngle(winningSegmentIndex);

    const spinDuration = this.config.mechanics?.spin_duration_ms || 5000;
    const friction = this.config.mechanics?.friction || 0.98;

    this.animateSpin(targetAngle, spinDuration, () => {
      this.onSpinComplete(winningSegmentIndex);
    });
  }

  determineWinner() {
    const winProbability = this.config.settings?.difficulty?.win_probability ?? 0.3;
    const isWin = Math.random() < winProbability;

    const winningSegments = [];
    const losingSegments = [];

    this.segments.forEach((segment, index) => {
      if (segment.prize && segment.prize !== 'Try Again') {
        winningSegments.push(index);
      } else {
        losingSegments.push(index);
      }
    });

    if (isWin && winningSegments.length > 0) {
      return this.weightedRandomSelect(winningSegments);
    } else if (losingSegments.length > 0) {
      return this.weightedRandomSelect(losingSegments);
    }

    return Math.floor(Math.random() * this.segments.length);
  }

  weightedRandomSelect(indices) {
    const weights = indices.map(i => this.segments[i].weight || 1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < indices.length; i++) {
      random -= weights[i];
      if (random <= 0) return indices[i];
    }

    return indices[indices.length - 1];
  }

  calculateTargetAngle(segmentIndex) {
    const totalWeight = this.segments.reduce((sum, s) => sum + (s.weight || 1), 0);

    let angleToSegmentStart = 0;
    for (let i = 0; i < segmentIndex; i++) {
      angleToSegmentStart += ((this.segments[i].weight || 1) / totalWeight) * Math.PI * 2;
    }

    const segmentAngle = ((this.segments[segmentIndex].weight || 1) / totalWeight) * Math.PI * 2;
    const segmentCenter = angleToSegmentStart + segmentAngle / 2;

    const pointerAngle = -Math.PI / 2;
    const baseRotations = 5 + Math.floor(Math.random() * 3);
    const targetAngle = baseRotations * Math.PI * 2 + (pointerAngle - segmentCenter);

    return this.currentAngle + targetAngle + (Math.random() - 0.5) * segmentAngle * 0.5;
  }

  animateSpin(targetAngle, duration, onComplete) {
    const startAngle = this.currentAngle;
    const startTime = performance.now();

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      this.currentAngle = startAngle + (targetAngle - startAngle) * easedProgress;
      this.draw();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        onComplete();
      }
    };

    requestAnimationFrame(animate);
  }

  onSpinComplete(segmentIndex) {
    this.isSpinning = false;
    this.spinButton.disabled = false;
    this.spinButton.classList.remove('spinning');

    const segment = this.segments[segmentIndex];
    const isWin = segment.prize && segment.prize !== 'Try Again';

    if (isWin) {
      if (this.winSound && this.winSound.src) {
        this.winSound.play().catch(() => {});
      }
      this.showResult(true, segment);
    } else {
      if (this.loseSound && this.loseSound.src) {
        this.loseSound.play().catch(() => {});
      }
      this.showResult(false, segment);
    }

    this.emitGameComplete(isWin, segment);
  }

  showResult(isWin, segment) {
    const copy = this.config.copy || {};

    this.resultTitle.textContent = isWin ? (copy.title || 'Congratulations!') : 'Better Luck Next Time!';
    this.resultTitle.className = isWin ? 'win' : 'lose';

    this.resultMessage.textContent = isWin
      ? (copy.win_message || 'You won a prize!')
      : (copy.lose_message || 'Try again for another chance!');

    this.resultPrize.textContent = segment.prize || segment.label;
    this.resultPrize.style.display = isWin ? 'inline-block' : 'none';

    this.resultOverlay.classList.remove('hidden');
  }

  hideResult() {
    this.resultOverlay.classList.add('hidden');
  }

  emitGameComplete(isWin, segment) {
    const event = new CustomEvent('game_complete', {
      detail: {
        type: 'game_complete',
        result: isWin ? 'win' : 'lose',
        prize: segment.prize,
        segment_label: segment.label,
        timestamp: Date.now(),
      },
    });

    window.dispatchEvent(event);

    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'game_complete',
        result: isWin ? 'win' : 'lose',
        prize: segment.prize,
        segment_label: segment.label,
      }, '*');
    }
  }
}

async function loadConfig() {
  try {
    const response = await fetch('./game_config.json');
    if (!response.ok) throw new Error('Config not found');
    return await response.json();
  } catch (error) {
    console.warn('Using default config:', error.message);
    return {
      template_id: 'spin_wheel',
      version: '1.0.0',
      settings: {
        duration_sec: 60,
        difficulty: { level: 'medium', win_probability: 0.3 },
        locale: 'en',
      },
      visuals: {
        theme: 'default',
        colors: {
          primary: '#e94560',
          secondary: '#0f3460',
          accent: '#16213e',
          background: '#1a1a2e',
        },
        assets: {},
        animations: {},
      },
      audio: { bgm: { enabled: true, volume: 0.5, loop: true }, sfx: {} },
      mechanics: {
        segments: [
          { label: '10% Off', color: '#e94560', prize: '10% Off', weight: 20 },
          { label: '20% Off', color: '#0f3460', prize: '20% Off', weight: 15 },
          { label: 'Try Again', color: '#16213e', prize: null, weight: 25 },
          { label: 'Free Gift', color: '#533483', prize: 'Free Gift', weight: 10 },
          { label: '15% Off', color: '#e94560', prize: '15% Off', weight: 15 },
          { label: 'Try Again', color: '#0f3460', prize: null, weight: 15 },
        ],
        spin_duration_ms: 5000,
        friction: 0.98,
      },
      copy: {
        title: 'Spin & Win!',
        instructions: 'Tap the button to spin the wheel!',
        win_message: 'Congratulations! You won!',
        lose_message: 'Better luck next time!',
      },
    };
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const config = await loadConfig();
  window.game = new SpinWheelGame(config);
});
