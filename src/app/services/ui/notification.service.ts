import { Injectable, signal } from '@angular/core';

export interface Notification {
  id: number;
  type: 'info' | 'success' | 'error' | 'warning';
  title?: string;
  content: string;
  autoClose: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private notifications = signal<Notification[]>([]);
  private nextId = 0;

  constructor() {}

  getNotifications() {
    return this.notifications;
  }

  show(type: 'info' | 'success' | 'error' | 'warning', content: string, title?: string, autoClose: boolean = true) {
    const id = this.nextId++;
    const notification: Notification = { id, type, title, content, autoClose };
    
    this.notifications.update(notifications => [...notifications, notification]);
    
    if (autoClose) {
      setTimeout(() => {
        this.remove(id);
      }, 5000);
    }
    
    return id;
  }

  remove(id: number) {
    this.notifications.update(notifications => 
      notifications.filter(notification => notification.id !== id)
    );
  }

  showSuccess(content: string, title?: string) {
    return this.show('success', content, title);
  }

  showError(content: string, title?: string) {
    return this.show('error', content, title);
  }

  showInfo(content: string, title?: string) {
    return this.show('info', content, title);
  }
  
  showWarning(content: string, title?: string) {
    return this.show('warning', content, title);
  }
  
  clearAll() {
    this.notifications.set([]);
  }
} 