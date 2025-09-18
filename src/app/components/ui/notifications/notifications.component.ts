import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService, Notification } from '../../../services/ui/notification.service';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notifications-component.html',
  styleUrls: ['./notifications.component.css']
})
export class NotificationsComponent {
  private notificationService = inject(NotificationService);
  notifications = this.notificationService.getNotifications();

  remove(id: number) {
    this.notificationService.remove(id);
  }
  
  getIconForType(type: Notification['type']) {
    switch (type) {
      case 'info': return 'info';
      case 'success': return 'check';
      case 'error': return 'xMark';
      case 'warning': return 'exclamationTriangle';
      default: return 'info';
    }
  }
  
  getColorClassForType(type: Notification['type']) {
    switch (type) {
      case 'info': return 'bg-primary/10 text-primary';
      case 'success': return 'bg-success/10 text-success';
      case 'error': return 'bg-danger/10 text-danger';
      case 'warning': return 'bg-warning/10 text-warning';
      default: return 'bg-gray-100 text-gray-700';
    }
  }
} 