import { Component, computed, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { PayloadVersionService } from '../../core/payload-version.service';

/**
 * The single refusal surface (FR-070a). The shell (app.component.html) puts
 * it above the router outlet and creates the outlet only once the gate has
 * opened, hiding it while refused: no routed screen — project, media, mixer,
 * nodes, config — renders while the session gate is not open. It is
 * deliberately not a per-screen condition: a screen that forgot one would
 * present misread values as data.
 *
 * The header (and its language choice) stays outside, so the refusal is
 * readable and the shell usable. A reconnect — which re-runs the gate — only
 * shows a notice: the open screen and its unsaved state survive.
 */
@Component({
  selector: 'app-payload-gate',
  standalone: true,
  imports: [TranslateModule],
  templateUrl: './payload-gate.component.html',
})
export class PayloadGateComponent {
  private payloadVersion = inject(PayloadVersionService);

  readonly gate = this.payloadVersion.gate;
  readonly announced = this.payloadVersion.announced;
  readonly implemented = this.payloadVersion.implemented;

  readonly everOpened = this.payloadVersion.everOpened;

  readonly refused = computed(() => this.gate().status === 'refused');
  readonly pending = computed(() => this.gate().status === 'pending');

  /** `detail` of a refusal, typed loosely for the template. */
  readonly detail = computed<Record<string, any>>(() => {
    const state = this.gate();
    return state.status === 'refused' ? (state.detail ?? {}) : {};
  });

  readonly reason = computed(() => {
    const state = this.gate();
    return state.status === 'refused' ? state.reason : null;
  });
}
