// Fetches /api/summary and feeds the charts. Falls back to the built-in sample data
// and says so in the top bar, so sample numbers are never mistaken for real ones.
window.LIVE = null;

// L(section, key, fallback): live value when available, otherwise the sample fallback.
window.L = (section, key, fallback) => (window.LIVE?.[section]?.[key]) ?? fallback;

// LP(fallback, kind, all): pipeline stages from estimates. Doughnut skips closed stages.
window.LP = (fallback, kind, all) => {
  const p = window.LIVE?.pipeline;
  if (!p) return fallback;
  const entries = Object.entries(p).filter(([k]) => all || !['Accepted', 'Declined'].includes(k));
  return kind === 'labels' ? entries.map((e) => e[0]) : entries.map((e) => e[1]);
};

function badge(text, color) {
  let b = document.getElementById('dataBadge');
  if (!b) {
    b = document.createElement('div');
    b.id = 'dataBadge';
    b.style.cssText = 'font:600 10px Montserrat,sans-serif;letter-spacing:.08em;padding:4px 10px;border-radius:12px;margin-right:12px;white-space:nowrap';
    document.querySelector('.topbar-clock')?.before(b);
  }
  b.textContent = text;
  b.style.color = color;
  b.style.border = `1px solid ${color}`;
}

const status = (t) => { const e = document.getElementById('sysStatus'); if (e) e.textContent = t; };

async function refresh() {
  try {
    const r = await fetch('/api/summary');
    const j = await r.json();
    window.LIVE = j.live ? j : null;
    if (j.live) {
      const t = new Date(j.syncedAt).toLocaleTimeString('en-SA', { hour: '2-digit', minute: '2-digit' });
      badge(`${j.stale ? 'STALE' : 'LIVE'} · ${j.source.toUpperCase()} · ${t} · CHARTS ONLY`, j.stale ? '#FFB300' : '#00E676');
      status(j.stale ? 'Live data stale' : `Live — ${j.source}`);
    } else {
      badge('SAMPLE DATA — not connected', '#FF6D00');
      status('Sample data');
      console.warn('Live data unavailable:', j.error);
    }
  } catch (e) {
    window.LIVE = null;
    badge('SAMPLE DATA — server unreachable', '#FF1744');
    status('Offline');
  }
  const active = document.querySelector('.nav-item.active');
  const m = active?.getAttribute('onclick')?.match(/'(\w+)'\)/);
  if (m && typeof renderCharts === 'function') renderCharts(m[1]);
}

document.addEventListener('DOMContentLoaded', () => { refresh(); setInterval(refresh, 5 * 60 * 1000); });
