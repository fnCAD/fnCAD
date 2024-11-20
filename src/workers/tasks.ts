import { TaskProgress, WorkerMessage, WorkerTask } from './messages';

export class TaskQueue {
  private worker: Worker;
  private tasks = new Map<string, TaskProgress>();
  private taskCounter = 0;
  private listeners = new Set<(progress: TaskProgress) => void>();

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module'
    });

    this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      this.handleWorkerMessage(e.data);
    };
  }

  private handleWorkerMessage(message: WorkerMessage) {
    console.log('[TaskQueue] Received worker message:', message);
    
    const task = this.tasks.get(message.taskId);
    if (!task) {
      console.warn('[TaskQueue] No task found for message:', message);
      return;
    }

    switch (message.type) {
      case 'progress':
        task.progress = message.progress || 0;
        break;
      case 'complete':
        console.log('Received complete message:', message);
        task.status = 'completed';
        task.progress = 1;
        task.result = message.data?.result;
        console.log('Updated task with result:', task);
        break;
      case 'error':
        task.status = 'failed';
        task.error = message.error;
        break;
    }

    this.notifyListeners(task);
  }

  private notifyListeners(task: TaskProgress) {
    this.listeners.forEach(listener => listener(task));
  }

  addTask(task: WorkerTask): string {
    const taskId = `task-${++this.taskCounter}`;
    
    const progress: TaskProgress = {
      taskId,
      type: task.type,
      progress: 0,
      status: 'queued'
    };

    this.tasks.set(taskId, progress);
    
    this.worker.postMessage({
      type: 'start',
      taskId,
      data: task
    });

    return taskId;
  }

  onProgress(callback: (progress: TaskProgress) => void) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getTask(taskId: string): TaskProgress | undefined {
    return this.tasks.get(taskId);
  }
}
