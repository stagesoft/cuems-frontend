import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IconComponent } from '../../../ui/icon/icon.component';

export interface AudioMixerChangeEvent {
  type: 'master' | 'output' | 'channel';
  cue: any;
  output?: any;
  channel?: any;
  oldValue: number;
  newValue: number;
}

@Component({
  selector: 'app-shared-audio-mixer',
  standalone: true,
  imports: [CommonModule, IconComponent, FormsModule],
  templateUrl: './audio-mixer.component.html',
  styleUrls: ['./audio-mixer.component.css']
})
export class SharedAudioMixerComponent implements OnChanges {
  @Input() audioCues: any[] = [];
  @Input() disabled: boolean = false;
  
  @Output() masterVolumeChange = new EventEmitter<AudioMixerChangeEvent>();
  @Output() outputVolumeChange = new EventEmitter<AudioMixerChangeEvent>();
  @Output() channelVolumeChange = new EventEmitter<AudioMixerChangeEvent>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['audioCues']) {
      console.log('Audio Mixer - Cues updated:', this.audioCues);
    }
  }

  /**
   * Get the short name of an output (remove the UUID from the beginning)
   */
  getOutputDisplayName(outputName: string): string {
    const parts = outputName.split('_');
    if (parts.length > 1) {
      return parts.slice(1).join('_');
    }
    return outputName;
  }

  onMasterVolumeChange(cue: any, newVolume: number): void {
    const oldVolume = cue.master_vol || 0;
    
    cue.master_vol = newVolume;
    
    this.masterVolumeChange.emit({
      type: 'master',
      cue: cue,
      oldValue: oldVolume,
      newValue: newVolume
    });
  }

  onOutputVolumeChange(cue: any, output: any, newVolume: number): void {
    const oldVolume = output.AudioCueOutput.output_vol || 0;
    
    output.AudioCueOutput.output_vol = newVolume;
    
    this.outputVolumeChange.emit({
      type: 'output',
      cue: cue,
      output: output,
      oldValue: oldVolume,
      newValue: newVolume
    });
  }

  onChannelVolumeChange(cue: any, output: any, channel: any, newVolume: number): void {
    const oldVolume = channel.channel.channel_vol || 0;
    
    channel.channel.channel_vol = newVolume;
    
    this.channelVolumeChange.emit({
      type: 'channel',
      cue: cue,
      output: output,
      channel: channel,
      oldValue: oldVolume,
      newValue: newVolume
    });
  }
}
