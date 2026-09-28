/** Lightweight user-agent parsing (no dependency) for activity logging. */

function match(ua, re) {
  const m = ua.match(re);
  return m ? m[1] : null;
}

export function parseDeviceType(ua) {
  const s = String(ua || '');
  if (!s) return null;
  if (/bot|crawler|spider|headless/i.test(s)) return 'bot';
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(s)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(s)) return 'mobile';
  return 'desktop';
}

export function parseBrowser(ua) {
  const s = String(ua || '');
  if (!s) return { name: null, version: null };
  const checks = [
    ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ['Opera', /(?:OPR|Opera)\/([\d.]+)/],
    ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of checks) {
    const version = match(s, re);
    if (version) return { name, version };
  }
  return { name: 'Other', version: null };
}

export function parseOs(ua) {
  const s = String(ua || '');
  if (!s) return { name: null, version: null };
  if (/Windows NT/i.test(s)) {
    const nt = match(s, /Windows NT ([\d.]+)/);
    const names = { '10.0': '10/11', '6.3': '8.1', '6.2': '8', '6.1': '7' };
    return { name: 'Windows', version: names[nt] || nt };
  }
  if (/iPhone|iPad|iPod/i.test(s)) {
    const v = match(s, /OS ([\d_]+)/);
    return { name: 'iOS', version: v ? v.replace(/_/g, '.') : null };
  }
  if (/Mac OS X/i.test(s)) {
    const v = match(s, /Mac OS X ([\d_.]+)/);
    return { name: 'macOS', version: v ? v.replace(/_/g, '.') : null };
  }
  if (/Android/i.test(s)) {
    return { name: 'Android', version: match(s, /Android ([\d.]+)/) };
  }
  if (/CrOS/i.test(s)) return { name: 'ChromeOS', version: null };
  if (/Linux/i.test(s)) return { name: 'Linux', version: null };
  return { name: 'Other', version: null };
}
