import type { App } from './app';

/** Advance the active group without ever discarding edits or queuing catch-up skips. */
export class PresetTimer {
  running = false;
  remaining = 0;
  message = 'Auto transition off';
  private deadline: number | null = null;
  private lastCheck = -Infinity;

  constructor(private app: App) {
    app.presetGroups.onChange(() => this.reset());
    app.library.onChange((kind) => { if (kind === 'presets') this.reset(); });
    document.addEventListener('visibilitychange', () => this.reset());
  }

  start(time = performance.now() / 1000) {
    if (this.app.dirty) { this.stop('Save your changes before starting.'); return; }
    if (this.app.presetGroups.names(this.app.library.presets).length < 2) {
      this.stop('Add at least two presets to this group.'); return;
    }
    this.running = true;
    this.reset();
    this.tick(time);
  }

  stop(message = 'Auto transition off') {
    this.running = false;
    this.deadline = null;
    this.remaining = 0;
    this.message = message;
  }

  /** Manual navigation, group changes and returning to the tab get a full hold. */
  reset() {
    this.deadline = null;
    this.lastCheck = -Infinity;
    if (this.running) this.remaining = this.app.presetGroups.active.holdSeconds;
  }

  tick(time: number) {
    if (!this.running) return;
    if (document.hidden) { this.reset(); return; }
    const names = this.app.presetGroups.names(this.app.library.presets);
    if (names.length < 2) { this.stop('Add at least two presets to this group.'); return; }
    // Parameter serialization is deliberately throttled while counting down.
    if (time - this.lastCheck >= 0.25 || (this.deadline !== null && time >= this.deadline)) {
      this.lastCheck = time;
      if (this.app.dirty) { this.stop('Stopped to keep your unsaved changes.'); return; }
    }
    if (this.deadline === null) {
      this.deadline = time + this.app.engine.transitionRemaining(time) + this.app.presetGroups.active.holdSeconds;
    }
    this.remaining = Math.max(0, this.deadline - time);
    this.message = `Next preset in ${Math.ceil(this.remaining)}s`;
    if (time < this.deadline) return;
    const current = names.indexOf(this.app.presetName);
    const next = names[(current + 1) % names.length];
    this.app.loadPreset(this.app.library.presets.get(next)!, true, 1);
    // loadPreset resets the timer. Schedule once from the new transition's end.
    this.deadline = time + this.app.engine.transitionRemaining(time) + this.app.presetGroups.active.holdSeconds;
    this.remaining = this.deadline - time;
    this.message = `Next preset in ${Math.ceil(this.remaining)}s`;
  }
}
