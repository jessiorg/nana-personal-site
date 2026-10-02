/**
 * Kanay H2 Truck Supply Chain — Game Loop (Layer 4)
 *
 * Same pattern as refinery / payment-system:
 * - requestAnimationFrame
 * - deltaTime accumulation
 * - speed control (1x..360x real-time)
 * - simDay advances when simAcc >= 1
 */
const SupplyChainLoop = (() => {
  let running = false;
  let lastFrame = 0;
  let simAcc = 0;
  let speed = 1;
  let fpsAcc = 0;
  let fpsFrameCount = 0;
  let onTick = null;
  let onFrame = null;

  function start(opts) {
    onTick = opts.onTick || (() => {});
    onFrame = opts.onFrame || (() => {});
    running = true;
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }

  function stop() { running = false; }

  function frame(ts) {
    if (!running) return;
    const dt = ts - lastFrame;
    lastFrame = ts;

    fpsAcc += dt;
    fpsFrameCount++;
    if (fpsAcc > 1000) {
      const fps = Math.round(1000 * fpsFrameCount / fpsAcc);
      const el = document.getElementById('te-fps');
      if (el) el.textContent = fps;
      fpsAcc = 0;
      fpsFrameCount = 0;
    }

    // 1 simulated day per real second at speed=1
    const simDelta = (dt / 1000) * speed;
    simAcc += simDelta;
    while (simAcc >= 1) {
      onTick();
      simAcc -= 1;
    }

    onFrame({ dt, simDelta });
    requestAnimationFrame(frame);
  }

  function setSpeed(s) { speed = s; }
  function getSpeed() { return speed; }

  return { start, stop, setSpeed, getSpeed };
})();
