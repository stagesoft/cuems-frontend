import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-dmx-mixer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dmx-mixer.component.html'
})
export class ProjectEditDmxMixerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  
  projectUuid: string | null = null;
  
  ngOnInit() {
    this.route.parent?.params.subscribe(params => {
      this.projectUuid = params['uuid'];
    });
  }
} 