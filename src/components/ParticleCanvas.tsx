import { useEffect, useRef } from 'react';

// ──────────── Constants ────────────
const FINANCIAL_FIGURES = [
  '+€2,847', '-€342', '€12,500', '+34.2%', '-8.1%',
  '€847', '+€1,204', '92.3%', '€43,891', '-€156',
  '+€5,320', '€891', '-€2,100', '+12.8%', '€7,450',
  '-€430', '+€18,200', '€3,670', '+6.4%', '-15.3%',
  '€25,000', '+€990', '-€1,780', '€4,210', '+22.1%',
];

const SYMBOLS = ['€', '£', '$', '%', '↑', '↗', '↘', '✓'];

const GRID_OPACITY = 0.15;
const GRID_SPACING = 80;

// ──────────── Types ────────────
interface FallingNumber {
  x: number;
  y: number;
  speed: number;
  text: string;
  opacity: number;
  fontSize: number;
}

interface MiniChart {
  x: number;
  y: number;
  speed: number;
  rotation: number;
  rotationSpeed: number;
  points: number[];
  opacity: number;
  width: number;
  height: number;
}

interface FloatingSymbol {
  x: number;
  y: number;
  speed: number;
  text: string;
  opacity: number;
  drift: number;
}

// ──────────── Helpers ────────────
function randomBetween(a: number, b: number) {
  return a + Math.random() * (b - a);
}

function createFallingNumber(w: number, startTop?: boolean): FallingNumber {
  return {
    x: Math.random() * w,
    y: startTop ? -20 : Math.random() * -600, // stagger initial positions
    speed: randomBetween(0.15, 0.45),
    text: FINANCIAL_FIGURES[Math.floor(Math.random() * FINANCIAL_FIGURES.length)],
    opacity: randomBetween(0.15, 0.20),
    fontSize: randomBetween(11, 13),
  };
}

function createMiniChart(w: number, h: number): MiniChart {
  const pts: number[] = [];
  const numPts = 8 + Math.floor(Math.random() * 6);
  let val = 12;
  for (let i = 0; i < numPts; i++) {
    val += randomBetween(-4, 4);
    val = Math.max(2, Math.min(23, val));
    pts.push(val);
  }
  return {
    x: Math.random() * w,
    y: h + Math.random() * 200,
    speed: randomBetween(0.1, 0.3),
    rotation: randomBetween(-0.08, 0.08),
    rotationSpeed: randomBetween(-0.0003, 0.0003),
    points: pts,
    opacity: randomBetween(0.15, 0.20),
    width: 60,
    height: 25,
  };
}

function createFloatingSymbol(w: number, h: number): FloatingSymbol {
  return {
    x: Math.random() * w,
    y: h + Math.random() * 100,
    speed: randomBetween(0.1, 0.3),
    text: SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
    opacity: randomBetween(0.15, 0.20),
    drift: randomBetween(-0.15, 0.15),
  };
}

// ──────────── Component ────────────
export default function FinancialCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    let mouseX = -1000;
    let mouseY = -1000;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initElements();
    };

    let numbers: FallingNumber[] = [];
    let charts: MiniChart[] = [];
    let symbols: FloatingSymbol[] = [];

    const initElements = () => {
      const NUM_NUMBERS = 25;
      const NUM_CHARTS = 8;
      const NUM_SYMBOLS = 15;

      numbers = [];
      for (let i = 0; i < NUM_NUMBERS; i++) {
        const n = createFallingNumber(w, false);
        n.y = Math.random() * h; 
        numbers.push(n);
      }

      charts = [];
      for (let i = 0; i < NUM_CHARTS; i++) {
        const c = createMiniChart(w, h);
        c.y = Math.random() * h; 
        charts.push(c);
      }

      symbols = [];
      for (let i = 0; i < NUM_SYMBOLS; i++) {
        const s = createFloatingSymbol(w, h);
        s.y = Math.random() * h; 
        symbols.push(s);
      }
    };

    resize();
    window.addEventListener('resize', resize);

    // Theme listener setup
    let canvasColor = '#f5a623'; // fallback
    const updateThemeColor = () => {
      // Small timeout ensures CSS vars match up visually
      setTimeout(() => {
        const raw = getComputedStyle(document.documentElement).getPropertyValue('--theme-accent').trim();
        if (raw) canvasColor = `hsl(${raw})`;
      }, 50);
    };
    updateThemeColor();
    window.addEventListener('themechange', updateThemeColor);

    // ──── Draw grid ────
    function drawGrid() {
      ctx!.save();
      ctx!.strokeStyle = canvasColor;
      ctx!.globalAlpha = GRID_OPACITY;
      ctx!.lineWidth = 0.5;

      for (let x = 0; x < w; x += GRID_SPACING) {
        ctx!.beginPath();
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, h);
        ctx!.stroke();
      }
      for (let y = 0; y < h; y += GRID_SPACING) {
        ctx!.beginPath();
        ctx!.moveTo(0, y);
        ctx!.lineTo(w, y);
        ctx!.stroke();
      }
      ctx!.restore();

      // Mouse glow
      if (mouseX > -1000) {
        ctx!.save();
        const grad = ctx!.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, 150);
        // Using raw parsing for generic drop-ins based on CSS variables wouldn't natively match HSL/rgba intersections flawlessly. 
        // Best approach is a raw color mapping off the theme variable base if needed, but for simplicity a static soft glow using raw CSS works.
        const glowColor = getComputedStyle(document.documentElement).getPropertyValue('--gold-glow').trim() || '245 166 35 / 0.15';
        grad.addColorStop(0, `hsl(${glowColor})`);
        grad.addColorStop(1, 'transparent');
        ctx!.fillStyle = grad;
        ctx!.beginPath();
        ctx!.arc(mouseX, mouseY, 150, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.restore();
      }
    }

    // ──── Animate ────
    function animate() {
      ctx!.clearRect(0, 0, w, h);

      // 1. Grid (static + mouse glow)
      drawGrid();

      // 2. Falling numbers
      ctx!.save();
      ctx!.font = '500 12px Inter, monospace';
      for (const n of numbers) {
        let alpha = n.opacity;
        if (n.y < 60) alpha *= n.y / 60;
        if (n.y > h - 60) alpha *= (h - n.y) / 60;
        
        let currentSpeed = n.speed;
        const dist = Math.hypot(n.x - mouseX, n.y - mouseY);
        
        if (dist < 120) {
          alpha = 0.18;
          n.x += (n.x - mouseX) * 0.03;
          n.y += (n.y - mouseY) * 0.03;
          currentSpeed *= 0.5;
        }

        if (alpha <= 0 && dist >= 120) { n.y += currentSpeed; continue; }

        ctx!.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx!.fillStyle = canvasColor;
        ctx!.font = `500 ${n.fontSize}px Inter, monospace`;
        ctx!.fillText(n.text, n.x, n.y);

        n.y += currentSpeed;
        if (n.y > h) {
          n.y = -20;
          n.x = Math.random() * w;
        }
        if (n.x < -100) n.x = w;
        if (n.x > w + 100) n.x = 0;
      }
      ctx!.restore();

      // 3. Mini charts (float upward)
      ctx!.save();
      for (const c of charts) {
        let alpha = c.opacity;
        if (c.y < 60) alpha *= c.y / 60;
        if (c.y > h - 60) alpha *= (h - c.y) / 60;
        
        let currentSpeed = c.speed;
        const dist = Math.hypot(c.x - mouseX, c.y - mouseY);
        
        if (dist < 120) {
          alpha = 0.18;
          c.x += (c.x - mouseX) * 0.03;
          c.y += (c.y - mouseY) * 0.03;
          currentSpeed *= 0.5;
        }

        if (alpha <= 0 && dist >= 120) { c.y -= currentSpeed; continue; }

        ctx!.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx!.strokeStyle = canvasColor;
        ctx!.lineWidth = 1;

        ctx!.save();
        ctx!.translate(c.x, c.y);
        ctx!.rotate(c.rotation);

        // Draw sparkline
        const stepX = c.width / (c.points.length - 1);
        ctx!.beginPath();
        for (let i = 0; i < c.points.length; i++) {
          const px = i * stepX - c.width / 2;
          const py = c.points[i] - c.height / 2;
          if (i === 0) ctx!.moveTo(px, py);
          else ctx!.lineTo(px, py);
        }
        ctx!.stroke();
        ctx!.restore();

        c.y -= currentSpeed;
        c.rotation += c.rotationSpeed;
        if (c.y < -50) {
          c.y = h + 50;
          c.x = Math.random() * w;
        }
        if (c.x < -100) c.x = w;
        if (c.x > w + 100) c.x = 0;
      }
      ctx!.restore();

      // 4. Floating symbols (drift upward)
      ctx!.save();
      ctx!.font = '10px Inter, sans-serif';
      for (const s of symbols) {
        let alpha = s.opacity;
        if (s.y < 40) alpha *= s.y / 40;
        if (s.y > h - 40) alpha *= (h - s.y) / 40;
        
        let currentSpeed = s.speed;
        const dist = Math.hypot(s.x - mouseX, s.y - mouseY);
        
        if (dist < 120) {
          alpha = 0.18;
          s.x += (s.x - mouseX) * 0.03;
          s.y += (s.y - mouseY) * 0.03;
          currentSpeed *= 0.5;
        }

        if (alpha <= 0 && dist >= 120) { s.y -= currentSpeed; continue; }

        ctx!.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx!.fillStyle = canvasColor;
        ctx!.fillText(s.text, s.x, s.y);

        s.y -= currentSpeed;
        s.x += s.drift;
        if (s.y < -20) {
          s.y = h + 20;
          s.x = Math.random() * w;
        }
        if (s.x < -100) s.x = w;
        if (s.x > w + 100) s.x = 0;
      }
      ctx!.restore();

      rafRef.current = requestAnimationFrame(animate);
    }

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('themechange', updateThemeColor);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 1,
        pointerEvents: 'none',
        opacity: 1,
      }}
    />
  );
}
