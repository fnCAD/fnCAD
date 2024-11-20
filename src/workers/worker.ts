import { WorkerMessage, WorkerTask, TaskProgress } from './messages';

// Store active tasks
const activeTasks = new Map<string, TaskProgress>();

// Handle incoming messages
self.onmessage = async (e: MessageEvent<WorkerMessage>) => {
  const { type, taskId, data } = e.data;

  switch (type) {
    case 'start':
      try {
        const task = data as WorkerTask;
        await processTask(taskId, task);
      } catch (err) {
        sendError(taskId, err instanceof Error ? err.message : 'Unknown error');
      }
      break;
  }
};

async function processTask(taskId: string, task: WorkerTask) {
  // Initialize task progress
  const progress: TaskProgress = {
    taskId,
    type: task.type,
    progress: 0,
    status: 'running'
  };
  activeTasks.set(taskId, progress);

  try {
    switch (task.type) {
      case 'octree':
        await processOctreeTask(taskId, task);
        break;
      case 'mesh':
        await processMeshTask(taskId, task);
        break;
    }
  } catch (err) {
    sendError(taskId, err instanceof Error ? err.message : 'Unknown error');
  }
}

async function processOctreeTask(taskId: string, task: OctreeTask) {
  // TODO: Implement octree processing
  updateProgress(taskId, 0.5);
  // Temporary placeholder
  sendComplete(taskId, { result: 'octree-placeholder' });
}

async function processMeshTask(taskId: string, task: MeshTask) {
  // TODO: Implement mesh processing
  updateProgress(taskId, 0.5);
  // Temporary placeholder
  sendComplete(taskId, { result: 'mesh-placeholder' });
}

function updateProgress(taskId: string, progress: number) {
  const task = activeTasks.get(taskId);
  if (task) {
    task.progress = progress;
    self.postMessage({
      type: 'progress',
      taskId,
      progress
    });
  }
}

function sendComplete(taskId: string, data: any) {
  const task = activeTasks.get(taskId);
  if (task) {
    task.status = 'completed';
    task.progress = 1;
    self.postMessage({
      type: 'complete',
      taskId,
      data
    });
    activeTasks.delete(taskId);
  }
}

function sendError(taskId: string, error: string) {
  const task = activeTasks.get(taskId);
  if (task) {
    task.status = 'failed';
    task.error = error;
    self.postMessage({
      type: 'error',
      taskId,
      error
    });
    activeTasks.delete(taskId);
  }
}
