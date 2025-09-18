import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IconComponent } from '../icon/icon.component';
import { DrawerService } from '../../../services/ui/drawer.service';

@Component({
  selector: 'app-activity-drawer',
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: './activity-drawer.component.html',
  styleUrl: './activity-drawer.component.css'
})
export class ActivityDrawerComponent implements OnInit {
  public drawerService = inject(DrawerService);
  
  readonly DRAWER_WIDTH = 500; 

  shouldAnimate = true;

  ngOnInit(): void {
    if (this.drawerService.isActivityDrawerOpen()) {
      this.shouldAnimate = false;
      setTimeout(() => {
        this.shouldAnimate = true;
      }, 0);
    }
  }

  setActiveDrawerTab(tab: 'activity' | 'warnings'): void {
    this.drawerService.setActiveDrawerTab(tab);
  }
}
