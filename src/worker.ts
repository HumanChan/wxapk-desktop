import { parentPort } from 'node:worker_threads';

import { scanDefaultUsersRoot, scanManualInput } from './core/scanner';
import { unpackRequest } from './core/unpack';
import type { WorkerRequest, WorkerResponse } from './shared/types';

if (!parentPort) {
  throw new Error('wxapkg worker must run inside a worker thread');
}

async function handleMessage(message: WorkerRequest): Promise<void> {
  if (message.kind === 'scan-root') {
    const entries = await scanDefaultUsersRoot(message.root);
    parentPort?.postMessage({
      entries,
      kind: 'scan-result',
    } satisfies WorkerResponse);
    return;
  }

  if (message.kind === 'scan-input') {
    const entries = await scanManualInput(message.inputPath);
    parentPort?.postMessage({
      entries,
      kind: 'scan-result',
    } satisfies WorkerResponse);
    return;
  }

  if (message.kind === 'unpack') {
    const result = await unpackRequest(message.request, (event) => {
      parentPort?.postMessage({
        event,
        kind: 'job-event',
      } satisfies WorkerResponse);
    });

    parentPort?.postMessage({
      fileCount: result.fileCount,
      jobId: message.request.jobId,
      kind: 'unpack-result',
      outputDir: result.outputDir,
    } satisfies WorkerResponse);
  }
}

parentPort.on('message', async (message: WorkerRequest) => {
  try {
    await handleMessage(message);
    parentPort?.close();
  } catch (error) {
    parentPort?.postMessage({
      jobId: message.kind === 'unpack' ? message.request.jobId : undefined,
      kind: 'error',
      message: error instanceof Error ? error.message : String(error),
    } satisfies WorkerResponse);
    parentPort?.close();
  }
});
