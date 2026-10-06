import { Component, OnInit, OnDestroy, inject, effect, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ProjectsService } from '../../../../services/projects/projects.service';
import { IconComponent } from '../../../ui/icon/icon.component';
import { ActivityDrawerComponent } from '../../../ui/activity-drawer/activity-drawer.component';
import { DrawerService } from '../../../../services/ui/drawer.service';
import { Subscription } from 'rxjs';
import { OscService } from '../../../../services/osc.service';
import { TranslateModule } from '@ngx-translate/core';
import { cueClassOf, cueDataOf, cueKindOf, timecodeText } from '../../../../core/cue-wire';

@Component({
  selector: 'app-project-show-sequence',
  templateUrl: './sequence.component.html',
  standalone: true,
  imports: [CommonModule, IconComponent, ActivityDrawerComponent, TranslateModule]
})
export class ProjectShowSequenceComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private projectsService = inject(ProjectsService);
  public drawerService = inject(DrawerService);
  private oscService = inject(OscService);

  readonly DRAWER_WIDTH = 500; // px
  
  public project: any;
  public projectUuid: string | null = null;
  private projectLoadedSubscription?: Subscription;

  private el = inject(ElementRef);
  private userScrolling = false;
  private userScrollTimeout: any;
  private scrollDebounce: any;

  constructor() {
    effect(() => {
      const nextCueId = this.oscService.nextCue();
      if (!nextCueId || this.userScrolling) return;
  
      clearTimeout(this.scrollDebounce);
      this.scrollDebounce = setTimeout(() => {
        const row = this.el.nativeElement.querySelector(`[data-cue-id="${nextCueId}"]`) as HTMLElement;
        if (!row) return;
      
        const windowHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
        
        if (documentHeight <= windowHeight) return;
      
        const rowTop = row.getBoundingClientRect().top + window.scrollY;
        const targetScroll = rowTop - (windowHeight / 3); // Top third of the row
      
        window.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: 'smooth'
        });
      }, 300);
    });
  }

  @HostListener('window:wheel')
  onUserScroll(): void {
    this.userScrolling = true;
    clearTimeout(this.userScrollTimeout);
    this.userScrollTimeout = setTimeout(() => {
      this.userScrolling = false;
    }, 3000);
  }  

  ngOnInit(): void {
    this.route.parent?.params.subscribe(params => {
      this.projectUuid = params['uuid'];
      console.log('Sequence - Project UUID:', this.projectUuid);

      if (this.projectsService.projects().length === 0) {
        this.projectsService.getProjectList();
      }

      this.projectsService.loadProject(this.projectUuid);
    });

    this.projectLoadedSubscription = this.projectsService.projectLoaded.subscribe(projectData => {
      if (projectData) {
        const basicProjectData = this.projectsService.projects().find(p => p.uuid === this.projectUuid);
        if (basicProjectData) {
          if (!projectData.uuid) projectData.uuid = basicProjectData.uuid;
          if (!projectData.name) projectData.name = basicProjectData.name;
          if (!projectData.unix_name) projectData.unix_name = basicProjectData.unix_name;
          if (!projectData.created) projectData.created = basicProjectData.created;
          if (!projectData.modified) projectData.modified = basicProjectData.modified;
        }
        
        this.project = projectData;

        if (projectData?.CuemsScript?.CueList?.contents) {
          const namesMap: Record<string, string> = {};
          projectData.CuemsScript.CueList.contents.forEach((cueItem: any) => {
            const id = this.getCueId(cueItem);
            const name = this.getCueName(cueItem);
            if (id !== 'unknown') namesMap[id] = name;
          });
          this.oscService.cueNames.set(namesMap);
        }        
      }
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.scrollDebounce);
    clearTimeout(this.userScrollTimeout);    
    if (this.projectLoadedSubscription) {
      this.projectLoadedSubscription.unsubscribe();
    }
  } 

  /**
   * A listed cue's body: `Cue` + class for hardware cues, ActionCue and FadeCue
   * by key (delta (c)). A nested CueList, or an unknown key, is not a cue here.
   */
  private cueData(cueItem: any): any {
    const kind = cueKindOf(cueItem);
    return kind && kind !== 'cuelist' ? cueDataOf(cueItem) : null;
  }

  getCueId(cueItem: any): string {
    return this.cueData(cueItem)?.id ?? 'unknown';
  }

  getCueName(cueItem: any): string {
    const cueData = this.cueData(cueItem);
    if (!cueData) return 'Unknown Cue';
    const label = (cueKindOf(cueItem) === 'other' ? cueClassOf(cueItem) : cueKindOf(cueItem)) ?? '';
    return cueData.name || `Unnamed ${label.charAt(0).toUpperCase()}${label.slice(1)} Cue`;
  }

  getCueTypeIcon(cueItem: any): string {
    const kind = cueKindOf(cueItem);
    return kind && kind !== 'cuelist' ? kind : 'action';
  }

  getCuePrewait(cueItem: any): string {
    return this.cueData(cueItem)?.prewait?.CTimecode || '00:00:00.000';
  }

  getCuePostwait(cueItem: any): string {
    return this.cueData(cueItem)?.postwait?.CTimecode || '00:00:00.000';
  }

  getCueActionIcon(cueItem: any): string {
    const postGo = this.cueData(cueItem)?.post_go || 'pause';
    return 'post_go_' + postGo;
  }

  /**
   * Format order number with zero padding (0000)
   */
  formatOrderNumber(order: number): string {
    return order.toString().padStart(4, '0');
  }

  getCueDuration(cueItem: any): string {
    const cueData = this.cueData(cueItem);
    // A FadeCue has no Media — its duration is the fade's own cue-level
    // duration (the same source the edit view shows as fade_duration).
    if (cueKindOf(cueItem) === 'fade') return timecodeText(cueData?.duration) || '-';
    // Media.duration arrives wrapped (delta (b)); the wrapper is truthy, so
    // reading it bare rendered `[object Object]`.
    return timecodeText(cueData?.Media?.duration) || '-';
  }

  getCuePlaybackClasses(cueItem: any): string {
    const cueId = this.getCueId(cueItem);
    const isNextCue = this.oscService.nextCue() === cueId;
    const status = this.oscService.getCueStatus(cueId);
    const isPlaying = status >= 1 && status < 100;
    const isPlayed = status === 100;
  
    //console.log('cueId:', cueId, 'status:', status, 'all statuses:', this.oscService.cueStatuses());

    if (isNextCue) {
      return 'hover:bg-primary transition-colors bg-primary-light text-dark-100 font-semibold';
    }
  
    if (isPlaying) {
      return 'hover:bg-secondary transition-colors bg-secondary-light text-dark-100 font-semibold';
    }
  
    if (isPlayed) {
      return 'hover:bg-dark-200 transition-colors opacity-40 text-gray-500';
    }
  
    // unplayed default
    return 'hover:bg-dark-200 transition-colors';
  }

  onClickSetNextCue(cueItem: any): void {
    const uuid = this.getCueId(cueItem);
    this.oscService.setNextCue(uuid);
  }
  
  isCueEnabled(cueItem: any): boolean {
    const uuid = this.getCueId(cueItem);
    return this.oscService.isCueEnabled(uuid);
  }
  
  onToggleEnabled(cueItem: any, event: Event): void {
    event.stopPropagation();
    const uuid = this.getCueId(cueItem);
    const newEnabled = !this.oscService.isCueEnabled(uuid);
    this.oscService.setCueEnabled(uuid, newEnabled);
  }
}
