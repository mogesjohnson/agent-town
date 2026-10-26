// Quiet synthesized ambience. No audio context or sounds exist until the user opts in.
export function createTownAudio(host) {
  const ui = document.createElement("div"), button = document.createElement("button"), volume = document.createElement("input");
  ui.className = "town-audio";
  ui.style.cssText = "display:flex;align-items:center;gap:6px;pointer-events:auto";
  button.type = "button"; button.textContent = "Enable sound"; button.setAttribute("aria-pressed", "false");
  volume.type = "range"; volume.min = "0"; volume.max = "0.35"; volume.step = "0.01"; volume.value = "0.18";
  volume.setAttribute("aria-label", "Town sound volume"); volume.style.width = "72px";
  ui.append(button, volume);
  const toolbar = host.querySelector(".town-toolbar");
  if (toolbar) toolbar.append(ui);
  else { ui.style.cssText += ";position:absolute;top:10px;right:10px;z-index:15;background:#182a35db;padding:6px;border-radius:8px"; host.append(ui); }
  let context, master, wind, rain, voice, foot, bird, cricket;
  let enabled = false, disposed = false, nextBird = 0, nextCricket = 0, nextStep = 0;
  let environment = { paused: false, weather: "clear", night: false, walking: false };
  const nodes = [], sources = [];
  const node = (n) => (nodes.push(n), n);
  const gain = (level = 0) => { const n = node(context.createGain()); n.gain.value = level; return n; };
  function createGraph() {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) throw new Error("Web Audio unavailable");
    context = new Audio();
    master = gain(); master.connect(context.destination);
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate), data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = node(context.createBufferSource()); noise.buffer = buffer; noise.loop = true; sources.push(noise);
    const layer = (type, frequency) => {
      const filter = node(context.createBiquadFilter()), level = gain();
      filter.type = type; filter.frequency.value = frequency;
      noise.connect(filter); filter.connect(level); level.connect(master); return level;
    };
    wind = layer("lowpass", 400); rain = layer("highpass", 1800); foot = layer("lowpass", 180);
    voice = gain(1); voice.connect(master);
    const tone = (type, frequency) => {
      const oscillator = node(context.createOscillator()), level = gain();
      oscillator.type = type; oscillator.frequency.value = frequency;
      oscillator.connect(level); level.connect(voice); sources.push(oscillator); return { oscillator, level };
    };
    bird = tone("sine", 2400); cricket = tone("sine", 4100);
    for (const source of sources) source.start();
  }
  const smooth = (param, value) => param.setTargetAtTime(value, context.currentTime, 0.08);
  function audible() { return enabled && !disposed && !document.hidden && !environment.paused && Number(volume.value) > 0; }
  function sync() {
    if (!context || context.state === "closed") return;
    // Immediate master mute also cancels already scheduled chirps and footsteps audibly.
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setValueAtTime(audible() ? Number(volume.value) : 0, context.currentTime);
    const wet = ["rain", "storm", "snow"].includes(environment.weather);
    smooth(wind.gain, environment.weather === "storm" || environment.weather === "wind" ? 0.16 : 0.07);
    smooth(rain.gain, wet ? (environment.weather === "snow" ? 0.018 : 0.09) : 0);
  }
  function pulse(level, strength, duration) {
    const at = context.currentTime;
    level.gain.cancelScheduledValues(at); level.gain.setValueAtTime(0, at);
    level.gain.linearRampToValueAtTime(strength, at + 0.012);
    level.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    level.gain.setValueAtTime(0, at + duration + 0.01);
  }
  button.onclick = async () => {
    if (disposed) return;
    enabled = !enabled;
    button.textContent = enabled ? "Mute sound" : "Enable sound"; button.setAttribute("aria-pressed", String(enabled));
    try { if (enabled) { if (!context) createGraph(); await context.resume(); } sync(); }
    catch { enabled = false; button.textContent = "Sound unavailable"; button.disabled = true; button.setAttribute("aria-pressed", "false"); sync(); }
  };
  volume.oninput = sync;
  document.addEventListener("visibilitychange", sync);
  return {
    animate(now, options = {}) {
      environment = { ...environment, ...options }; sync();
      if (!context || !audible()) return;
      const wet = ["rain", "storm"].includes(environment.weather);
      if (!environment.night && !wet && now >= nextBird) {
        bird.oscillator.frequency.setValueAtTime(2100 + Math.random() * 600, context.currentTime);
        bird.oscillator.frequency.exponentialRampToValueAtTime(3400, context.currentTime + 0.16);
        pulse(bird.level, 0.13, 0.25); nextBird = now + 3500 + Math.random() * 4000;
      }
      if (environment.night && !wet && now >= nextCricket) { pulse(cricket.level, 0.035, 0.075); nextCricket = now + 380; }
      if (environment.walking && now >= nextStep) { pulse(foot, 0.18, 0.12); nextStep = now + 420; }
    },
    dispose() {
      if (disposed) return;
      disposed = true; enabled = false; sync();
      document.removeEventListener("visibilitychange", sync); button.onclick = volume.oninput = null; ui.remove();
      for (const source of sources) { try { source.stop(); } catch {} }
      for (const n of nodes) n.disconnect();
      if (context && context.state !== "closed") context.close().catch(() => {});
    },
  };
}
