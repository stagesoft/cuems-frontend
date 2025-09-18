import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-audio-mixer',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './audio-mixer.component.html'
})
export class ProjectEditAudioMixerComponent implements OnInit {
  private route = inject(ActivatedRoute);
  
  projectUuid: string | null = null;
  
  ngOnInit() {
    this.route.parent?.params.subscribe(params => {
      this.projectUuid = params['uuid'];
    });
  }
} 