import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-project-show-dmx-mixer',
  templateUrl: './dmx-mixer.component.html',
  standalone: true,
  imports: [CommonModule]
})
export class ProjectShowDmxMixerComponent {
  // The OLA (DMX) web console runs on the same host that serves this UI — the
  // controller — at port 9090. Derive the URL from the current hostname so it
  // is correct on every cluster (it was hardcoded to a stale cluster IP).
  readonly dmxConsoleUrl: SafeResourceUrl;

  constructor(sanitizer: DomSanitizer) {
    this.dmxConsoleUrl = sanitizer.bypassSecurityTrustResourceUrl(
      `http://${window.location.hostname}:9090`);
  }
}
