import type { Step } from "./model";
export type Status = "running" | "paused" | "complete";
export type Snapshot = { index: number; remaining: number; status: Status };
export class TimerEngine {
  index = 0;
  remaining: number;
  status: Status = "paused";
  private deadline = 0;
  private fresh = true;
  constructor(
    public steps: Step[],
    private clock: () => number = () => performance.now(),
    private cue: (end: boolean) => void = () => {},
    private cancel: () => void = () => {},
  ) {
    this.remaining = (steps[0]?.seconds ?? 0) * 1000;
  }
  snapshot(): Snapshot {
    return {
      index: this.index,
      remaining: this.remaining,
      status: this.status,
    };
  }
  resume() {
    if (this.status === "complete" || !this.steps.length) return;
    this.deadline = this.clock() + this.remaining;
    this.status = "running";
  }
  pause() {
    if (this.status !== "running") return;
    this.tick();
    if (this.status === "running") this.status = "paused";
    this.cancel();
  }
  tick() {
    if (this.status !== "running") return;
    const now = this.clock();
    const previous = this.remaining + (this.fresh ? 1 : 0);
    this.fresh = false;
    let transitioned = false;
    while (now >= this.deadline) {
      const lateness = now - this.deadline;
      if (lateness < 200) this.cue(true);
      if (this.index === this.steps.length - 1) {
        this.status = "complete";
        this.remaining = 0;
        return;
      }
      this.index++;
      this.deadline += this.steps[this.index].seconds * 1000;
      transitioned = true;
    }
    this.remaining = Math.max(0, this.deadline - now);
    for (const threshold of [3000, 2000, 1000]) {
      const before = transitioned
        ? this.steps[this.index].seconds * 1000 + 1
        : previous;
      if (
        before > threshold &&
        this.remaining <= threshold &&
        threshold - this.remaining < 200
      )
        this.cue(false);
    }
  }
  jump(index: number) {
    if (index < 0 || index >= this.steps.length) return;
    this.cancel();
    const running = this.status === "running";
    this.index = index;
    this.fresh = true;
    this.remaining = this.steps[index].seconds * 1000;
    this.status = running ? "running" : "paused";
    this.deadline = this.clock() + this.remaining;
  }
  previousTarget(scope: "interval" | "series") {
    if (this.status === "complete" || !this.steps.length) return -1;
    let index = this.index;
    let remaining =
      this.status === "running" ? this.deadline - this.clock() : this.remaining;
    // Resolve delayed callbacks without emitting any cues during navigation.
    while (remaining <= 0 && index < this.steps.length - 1)
      remaining += this.steps[++index].seconds * 1000;
    let elapsed = this.steps[index].seconds * 1000 - Math.max(0, remaining);
    if (scope === "interval") return elapsed > 2000 ? index : index - 1;
    const start = this.steps.findIndex(
      (step) => step.blockId === this.steps[index].blockId,
    );
    for (let i = start; i < index; i++) elapsed += this.steps[i].seconds * 1000;
    if (elapsed > 2000) return start;
    if (start === 0) return -1;
    return this.steps.findIndex(
      (step) => step.blockId === this.steps[start - 1].blockId,
    );
  }
  back(scope: "interval" | "series") {
    this.jump(this.previousTarget(scope));
  }
  seriesTarget(direction: -1 | 1) {
    const current = this.steps[this.index].blockId;
    if (direction === 1)
      return this.steps.findIndex(
        (s, i) => i > this.index && s.blockId !== current,
      );
    const start = this.steps.findIndex((s) => s.blockId === current);
    if (!start) return -1;
    const previous = this.steps[start - 1].blockId;
    return this.steps.findIndex((s) => s.blockId === previous);
  }
  reset() {
    this.cancel();
    this.status = "paused";
    this.fresh = true;
    this.index = 0;
    this.remaining = (this.steps[0]?.seconds ?? 0) * 1000;
  }
}
export class Beeper {
  context?: AudioContext;
  muted = false;
  nodes = new Set<OscillatorNode>();
  async initialize() {
    this.context ??= new AudioContext();
    if (this.context.state === "suspended") await this.context.resume();
  }
  play(end: boolean) {
    if (this.muted || !this.context || this.context.state !== "running") return;
    const c = this.context;
    const oscillator = c.createOscillator();
    const gain = c.createGain();
    const duration = end ? 0.45 : 0.12;
    oscillator.frequency.value = end ? 1100 : 740;
    gain.gain.setValueAtTime(0, c.currentTime);
    gain.gain.linearRampToValueAtTime(0.8, c.currentTime + 0.01);
    gain.gain.setValueAtTime(0.8, c.currentTime + duration - 0.025);
    gain.gain.linearRampToValueAtTime(0, c.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(c.destination);
    this.nodes.add(oscillator);
    oscillator.onended = () => {
      this.nodes.delete(oscillator);
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start();
    oscillator.stop(c.currentTime + duration);
  }
  cancel() {
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {}
    }
    this.nodes.clear();
  }
}
