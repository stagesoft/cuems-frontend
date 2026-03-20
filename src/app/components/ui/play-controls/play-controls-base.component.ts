import { inject } from '@angular/core';
import { OscService } from '../../../services/osc.service';

export abstract class PlayControlsBase {
  protected oscService = inject(OscService);

  get timecodeDisplay(): string {
    const ms = this.oscService.timecodeMs();
    return ms != null ? this.oscService.timecodeToHHMMSS(ms) : '--:--:--';
  }

  protected simulateInterval: ReturnType<typeof setInterval> | null = null;

  simulateRunning(): void {
    if (this.simulateInterval) {
      clearInterval(this.simulateInterval);
      this.simulateInterval = null;
      this.oscService.running.set(false);
      this.oscService.timecodeMs.set(null);
      return;
    }

    let ms = 0;
    this.oscService.running.set(true);
    this.oscService.armed.set(true);
    this.oscService.loadedProject.set('Simulate Project');

    this.simulateInterval = setInterval(() => {
      ms += 40;
      this.oscService.timecodeMs.set(ms);
    }, 40);
  }
}