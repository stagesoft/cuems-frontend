import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-dmx-mixer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dmx-mixer.component.html'
})
export class ProjectEditDmxMixerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);

  projectUuid: string | null = null;

  // The OLA (DMX) web console runs on the same host that serves this UI — the
  // controller — at port 9090. Derive the URL from the current hostname so it
  // is correct on every cluster (it was hardcoded to a stale cluster IP).
  readonly dmxConsoleUrl: SafeResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
    `http://${window.location.hostname}:9090`);

  ngOnInit() {
    this.route.parent?.params.subscribe(params => {
      this.projectUuid = params['uuid'];
    });
  }
} 