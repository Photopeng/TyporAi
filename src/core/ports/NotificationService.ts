export interface NotificationService {
  show(message: string, level?: 'info' | 'warning' | 'error'): void;
}
