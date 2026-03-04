import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { PlayControlsBase } from '../play-controls-base.component';

@Component({
  selector: 'app-play-controls-bar',
  imports: [TranslateModule],
  templateUrl: './play-controls-bar.component.html'
})
export class PlayControlsBarComponent extends PlayControlsBase {}