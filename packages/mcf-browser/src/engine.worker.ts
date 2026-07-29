/// <reference lib="webworker" />
import type { EngineRequest, WorkerMessage } from "./types";
import { executeEngineRequest } from "./worker-core";

const cancelled = new Set<string>();

self.postMessage({ type: "ready" } satisfies WorkerMessage);
self.onmessage = (event: MessageEvent<EngineRequest>) => {
  const request = event.data;
  if (request.type === "cancel") {
    cancelled.add(request.requestId);
    return;
  }
  void executeEngineRequest(
    request.requestId,
    request.operation,
    request.input,
    (value) =>
      self.postMessage({
        type: "progress",
        progress: value,
      } satisfies WorkerMessage),
    () => cancelled.has(request.requestId),
  ).then((result) => {
    cancelled.delete(request.requestId);
    const transfers: Transferable[] = [];
    if (result.status === "ok") {
      transfers.push(result.sourceArchive);
      if (result.compiledArtifact) transfers.push(result.compiledArtifact);
      for (const file of result.sourceFiles) transfers.push(file.bytes);
    }
    self.postMessage({ type: "result", result } satisfies WorkerMessage, {
      transfer: transfers,
    });
  });
};
