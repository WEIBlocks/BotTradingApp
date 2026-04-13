/**
 * Notification Job — processes pending notifications every 60 seconds
 * Now uses sendNotification() for ALL notifications (in-app + push)
 */
export declare function startNotificationJob(): Promise<void>;
