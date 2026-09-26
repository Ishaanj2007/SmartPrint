import { db } from "../database/db.js";
import { StorageService } from "../storage/storage.js";
class CleanupService {
  static {
    this.intervalHandle = null;
  }
  static {
    // Retention period: 24 hours for completed or rejected files
    this.RETENTION_HOURS = 24;
  }
  static startScheduler(intervalMs = 30 * 60 * 1e3) {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => {
      this.runCleanup();
    }, intervalMs);
    this.runCleanup();
  }
  static runCleanup() {
    const orders = db.getOrders();
    const cutoff = Date.now() - this.RETENTION_HOURS * 3600 * 1e3;
    let deletedCount = 0;
    for (const order of orders) {
      if ((order.status === "COMPLETED" || order.status === "REJECTED" || order.status === "CANCELLED") && new Date(order.updatedAt).getTime() < cutoff) {
        for (const file of order.files) {
          if (file.storageFilename) {
            const deleted = StorageService.deleteFile(file.storageFilename);
            if (deleted) deletedCount++;
          }
        }
      }
    }
    if (deletedCount > 0) {
      console.log(`[CLEANUP] Automatically pruned ${deletedCount} expired file(s) under retention policy.`);
    }
  }
}
export {
  CleanupService
};
