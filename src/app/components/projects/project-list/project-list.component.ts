// SPDX-FileCopyrightText: 2026 Stagelab Coop SCCL
// SPDX-License-Identifier: GPL-3.0-or-later
// SPDX-FileContributor: Ion Reguera <ion@stagelab.coop>
import { Component, inject, DestroyRef, effect, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AppPageHeaderComponent } from '../../layout/app-page-header/app-page-header.component';
import { ProjectsService, ProjectList } from '../../../services/projects/projects.service';
import { ConfirmationDialogComponent } from '../../ui/confirmation-dialog/confirmation-dialog.component';
import { Subscription } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { ExportService } from '../../../services/media/export.service';
import { OscService } from '../../../services/osc.service';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { IconComponent } from '../../ui/icon/icon.component';
import { ImportService } from '../../../services/media/import.service';
import { ImportDialogComponent } from '../../ui/import-dialog/import-dialog.component';

@Component({
  selector: 'app-project-list',
  standalone: true,
  imports: [CommonModule, RouterModule, AppPageHeaderComponent, ConfirmationDialogComponent, TranslateModule, CdkMenu, CdkMenuItem, CdkMenuTrigger, IconComponent, ImportDialogComponent],
  templateUrl: './project-list.component.html'
})
export class ProjectListComponent implements OnInit, OnDestroy {
  private exportService = inject(ExportService);
  private oscService = inject(OscService);
  public importService = inject(ImportService);

  public projectsService = inject(ProjectsService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);
  private subscription = new Subscription();

  selectedProjects: string[] = [];

  protected isLoading = true;
  projectToDeleteUuid: string | null = null;
  isConfirmDeleteOpen = false;
  isConfirmBulkDeleteOpen = false;
  isBulkDeleting = false;

  // uuid of the project being exported; null when nothing is. One export at a
  // time: the editor works in a folder named after the project.
  exportingUuid: string | null = null;

  private deletingProjects = new Map<string, boolean>();

  constructor() {
    this.refreshProjects();

    effect(() => {
      const projects = this.projectsService.projects();
      this.isLoading = false;

      this.cleanupProjectMaps(projects);
    });
  }

  ngOnInit() {
    this.subscription.add(
      this.projectsService.errorEvent.subscribe(error => {
        console.log('Error event received:', error);

        if (error.action === 'project_delete') {
          if (this.projectToDeleteUuid) {
            this.deletingProjects.delete(this.projectToDeleteUuid);
            this.projectToDeleteUuid = null;
          }

          this.isBulkDeleting = false;
        }
      })
    );
    this.setupExportSubscriptions();

  }

  private setupExportSubscriptions(): void {
    this.subscription.add(
      this.exportService.exportComplete.subscribe(fileUrl => {
        console.log('Export OK:', fileUrl);
        this.exportingUuid = null;
      })
    );

    this.subscription.add(
      this.exportService.exportError.subscribe(error => {
        console.error('Export ERROR:', error);
        this.exportingUuid = null;
      })
    );
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  cleanupProjectMaps(projects: ProjectList[]) {
    const existingUuids = projects.map(p => p.uuid);

    if (this.selectedProjects.length > 0) {
      const previousLength = this.selectedProjects.length;
      this.selectedProjects = this.selectedProjects.filter(uuid => existingUuids.includes(uuid));

      if (previousLength !== this.selectedProjects.length) {
        console.log(`Removed ${previousLength - this.selectedProjects.length} non-existent projects from selection`);
      }
    }

    if (this.deletingProjects.size > 0) {
      let removed = 0;
      this.deletingProjects.forEach((value, uuid) => {
        if (!existingUuids.includes(uuid)) {
          this.deletingProjects.delete(uuid);
          removed++;
        }
      });

      if (this.deletingProjects.size === 0) {
        this.isBulkDeleting = false;
      }
    }
  }

  isProjectBeingDeleted(uuid: string): boolean {
    return this.deletingProjects.has(uuid);
  }

  refreshProjects(): void {
    this.isLoading = true;
    this.projectsService.getProjectList();
    this.projectsService.getProjectTrashList();
  }

  createNewProject(): void {
    this.router.navigate(['/projects/new']);
  }

  openDeleteConfirmation(uuid: string) {
    this.projectToDeleteUuid = uuid;
    this.isConfirmDeleteOpen = true;
  }

  closeDeleteConfirmation() {
    this.isConfirmDeleteOpen = false;
    this.projectToDeleteUuid = null;
  }

  confirmDelete() {
    if (this.projectToDeleteUuid) {
      this.deletingProjects.set(this.projectToDeleteUuid, true);

      if (this.selectedProjects.includes(this.projectToDeleteUuid)) {
        this.selectedProjects = this.selectedProjects.filter(uuid => uuid !== this.projectToDeleteUuid);
      }

      this.executeProjectDeletion(this.projectToDeleteUuid);
      this.closeDeleteConfirmation();

      const uuidToCleanup = this.projectToDeleteUuid;
      setTimeout(() => {
        if (this.deletingProjects.has(uuidToCleanup)) {
          console.log(`Timeout cleanup for project ${uuidToCleanup}`);
          this.deletingProjects.delete(uuidToCleanup);
        }
      }, 3000);
    }
  }

  executeProjectDeletion(uuid: string) {
    this.projectsService.deleteProject(uuid);
  }

  deleteProject(uuid: string) {
    if (this.isProjectBeingDeleted(uuid) || this.importBusy) {
      return;
    }

    this.openDeleteConfirmation(uuid);
  }

  duplicateProject(uuid: string) {
    if (this.importBusy) return;
    this.projectsService.duplicateProject(uuid);
  }

  editProject(uuid: string): void {
    console.log(`Editing project ${uuid} - functionality to be implemented`);
  }

  selectProject(uuid: string): void {
    if (this.isProjectBeingDeleted(uuid)) {
      return;
    }

    if (this.selectedProjects.includes(uuid)) {
      this.selectedProjects = this.selectedProjects.filter(id => id !== uuid);
    } else {
      this.selectedProjects.push(uuid);
    }
  }

  selectAllProjects(): void {
    if (this.selectedProjects.length === this.getSelectableProjects().length) {
      this.selectedProjects = [];
    } else {
      this.selectedProjects = this.getSelectableProjects();
    }
  }

  getSelectableProjects(): string[] {
    return this.projectsService.projects()
      .filter(project => !this.isProjectBeingDeleted(project.uuid))
      .map(project => project.uuid);
  }

  deselectAllProjects(): void {
    this.selectedProjects = [];
  }

  deleteSelectedProjects(): void {
    if (this.selectedProjects.length === 0 || this.importBusy) return;

    const validSelectedProjects = this.selectedProjects.filter(uuid =>
      !this.isProjectBeingDeleted(uuid) &&
      this.projectsService.projects().some(p => p.uuid === uuid)
    );

    this.selectedProjects = validSelectedProjects;

    if (this.selectedProjects.length === 0) return;

    this.isConfirmBulkDeleteOpen = true;
  }

  closeBulkDeleteConfirmation(): void {
    this.isConfirmBulkDeleteOpen = false;
  }

  confirmBulkDelete(): void {
    const validSelectedProjects = this.selectedProjects.filter(uuid =>
      !this.isProjectBeingDeleted(uuid) &&
      this.projectsService.projects().some(p => p.uuid === uuid)
    );

    if (validSelectedProjects.length > 0) {
      this.executeDeleteProjects([...validSelectedProjects]);
    }

    this.closeBulkDeleteConfirmation();
  }

  executeDeleteProjects(uuids: string[]): void {
    if (uuids.length === 0) return;

    this.isBulkDeleting = true;

    uuids.forEach(uuid => {
      this.deletingProjects.set(uuid, true);
    });

    uuids.forEach(uuid =>
      this.projectsService.deleteProject(uuid)
    );

    this.selectedProjects = [];

    setTimeout(() => {
      uuids.forEach(uuid => {
        this.deletingProjects.delete(uuid);
      });

      this.isBulkDeleting = false;
    }, 5000);
  }

  truncateText(text: string, maxLength: number = 17): string {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }

  // Métodos para exportar
  // A project is PLAYING: the editor refuses to export, and the buttons say so before
  // the operator presses. The editor never stops anything to make room.
  //
  // The state comes from the engine's LIVE channel (/engine/status/running and
  // /engine/status/load), the same source as the green project name in the
  // header. ProjectsService.runningProjectUuid/loadedProjectUuid come from
  // `project_status`, which is asked ONCE per connection: a project loaded after
  // this tab opened never reached them, so the warning did not show and the
  // editor had to refuse (1amfwm7kana, seen on rig test). They stay as the
  // fallback while the engine channel is down.
  get exportBlockedByPlayback(): boolean {
    if (this.oscService.isConnected()) {
      return this.oscService.running();
    }
    return this.projectsService.runningProjectUuid() !== null;
  }

  // A project is LOADED but not playing (armed, waiting for GO): a long read of the
  // media could delay that GO, so the operator is warned and decides (Ion, 2026-11-24).
  get exportNeedsLoadedConfirm(): boolean {
    if (this.oscService.isConnected()) {
      return !this.oscService.running() && this.oscService.loadedProject() !== '';
    }
    return this.projectsService.runningProjectUuid() === null
        && this.projectsService.loadedProjectUuid() !== null;
  }

  isConfirmExportOpen = false;
  private projectToExportUuid: string | null = null;

  exportProject(projectUuid: string): void {
    if (this.exportingUuid !== null || this.importBusy || this.exportBlockedByPlayback) return;

    if (this.exportNeedsLoadedConfirm) {
      this.projectToExportUuid = projectUuid;
      this.isConfirmExportOpen = true;
      return;
    }
    this.startExport(projectUuid, false);
  }

  // The dialog emits confirm first and close right after, so the uuid is still here.
  confirmExportLoaded(): void {
    const uuid = this.projectToExportUuid;
    // The state may have moved while the dialog was open: never export into a show that started meanwhile.
    if (!uuid || this.exportingUuid !== null || this.importBusy || this.exportBlockedByPlayback) return;
    this.startExport(uuid, true);
  }

  closeExportConfirmation(): void {
    this.isConfirmExportOpen = false;
    this.projectToExportUuid = null;
  }

  private startExport(projectUuid: string, acceptLoaded: boolean): void {
    this.exportingUuid = projectUuid;
    this.exportService.exportProject(projectUuid, acceptLoaded);
  }

  // Import of a project archive (1amfwm7kcjp). The export's guard, read the same way:
  // a PLAYING project disables the button (the editor refuses too), a LOADED one asks
  // the operator to accept the warning before the request carries accept_loaded.
  // While an import runs the list is locked: no second import, no export, no delete
  // or duplicate. The new project and media reach the lists by list_update.
  @ViewChild('importInput') importInput?: ElementRef<HTMLInputElement>;

  isConfirmImportOpen = false;
  private fileToImport: File | null = null;

  get importBusy(): boolean {
    return this.importService.busy();
  }

  /** Something else holds the list: an export in flight, or an import. */
  get listLocked(): boolean {
    return this.importBusy || this.exportingUuid !== null;
  }

  get importDisabled(): boolean {
    return this.listLocked || this.exportBlockedByPlayback;
  }

  get importTooltipKey(): string | null {
    if (this.exportBlockedByPlayback) return 'project.import.blocked.playing';
    if (this.listLocked) return 'project.import.blocked.busy';
    return null;
  }

  openImportPicker(): void {
    if (this.importDisabled || !this.importInput) return;
    this.importInput.nativeElement.value = '';
    this.importInput.nativeElement.click();
  }

  onImportFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    // The state may have moved while the picker was open.
    if (!file || this.importDisabled) return;

    if (this.exportNeedsLoadedConfirm) {
      this.fileToImport = file;
      this.isConfirmImportOpen = true;
      return;
    }
    this.importService.start(file, false);
  }

  // The dialog emits confirm first and close right after, so the file is still here.
  confirmImportLoaded(): void {
    const file = this.fileToImport;
    // Never import into a show that started while the dialog was open.
    if (!file || this.importDisabled) return;
    this.importService.start(file, true);
  }

  // Cancel sends nothing.
  closeImportConfirmation(): void {
    this.isConfirmImportOpen = false;
    this.fileToImport = null;
  }

  cancelImport(): void {
    this.importService.cancel();
  }

  closeImportDialog(): void {
    this.importService.reset();
  }

  /** The editor refused because a project is loaded: the operator accepts in the dialog. */
  acceptImportLoaded(): void {
    if (this.exportBlockedByPlayback || this.exportingUuid !== null) return;
    this.importService.retryAcceptingLoaded();
  }
}
