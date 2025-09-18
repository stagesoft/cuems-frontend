import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DrawerService {
  public isActivityDrawerOpen = signal(false);
  public activeDrawerTab = signal<'activity' | 'warnings'>('activity');

  toggleActivityDrawer(): void {
    this.isActivityDrawerOpen.set(!this.isActivityDrawerOpen());
  }

  closeActivityDrawer(): void {
    this.isActivityDrawerOpen.set(false);
  }

  openActivityDrawer(): void {
    this.isActivityDrawerOpen.set(true);
  }

  setActiveDrawerTab(tab: 'activity' | 'warnings'): void {
    this.activeDrawerTab.set(tab);
  }
} 