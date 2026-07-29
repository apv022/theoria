import type {
  BrowserEngineState,
  BrowserMcfEngine,
  EngineProgress,
  EngineRequest,
  EngineResult,
  WorkerMessage,
} from "./types";

interface Pending {
  readonly resolve: (value: EngineResult) => void;
  readonly onProgress?: (value: EngineProgress) => void;
  readonly operation: Extract<EngineRequest, { type: "request" }>["operation"];
}

export class WorkerMcfEngine implements BrowserMcfEngine {
  state: BrowserEngineState = { status: "uninitialized" };
  private worker: Worker | undefined;
  private initialization: Promise<BrowserEngineState> | undefined;
  private readonly pending = new Map<string, Pending>();

  initialize(): Promise<BrowserEngineState> {
    if (this.state.status === "ready") return Promise.resolve(this.state);
    if (this.initialization) return this.initialization;
    if (typeof Worker === "undefined") {
      this.state = {
        status: "unsupported",
        reason: "This browser does not support Web Workers.",
      };
      return Promise.resolve(this.state);
    }
    this.state = { status: "initializing" };
    this.initialization = new Promise((resolve) => {
      const worker = new Worker(
        new URL("./engine.worker.ts", import.meta.url),
        { type: "module" },
      );
      this.worker = worker;
      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type === "ready") {
          this.state = { status: "ready", supportedVersions: ["1.0", "1.1"] };
          this.initialization = undefined;
          resolve(this.state);
          return;
        }
        if (event.data.type === "progress") {
          this.pending
            .get(event.data.progress.requestId)
            ?.onProgress?.(event.data.progress);
          return;
        }
        const pending = this.pending.get(event.data.result.requestId);
        if (pending) {
          this.pending.delete(event.data.result.requestId);
          pending.resolve(event.data.result);
        }
      };
      worker.onerror = (event) => {
        this.state = { status: "fatal", message: event.message };
        for (const [requestId, pending] of this.pending) {
          pending.resolve({
            requestId,
            operation: pending.operation,
            status: "error",
            diagnostics: [
              {
                code: "MCF_WORKER_FATAL",
                severity: "error",
                file: "worker",
                message: event.message,
              },
            ],
            fatal: event.message,
          });
        }
        this.pending.clear();
        this.initialization = undefined;
        resolve(this.state);
      };
    });
    return this.initialization;
  }

  async execute(
    request: Extract<EngineRequest, { type: "request" }>,
    onProgress?: (progress: EngineProgress) => void,
  ): Promise<EngineResult> {
    if (this.state.status !== "ready" || !this.worker) {
      return {
        requestId: request.requestId,
        operation: request.operation,
        status: "unsupported",
        reason: "The browser MCF engine is not ready.",
        diagnostics: [],
      };
    }
    return new Promise((resolve) => {
      this.pending.set(request.requestId, {
        resolve,
        operation: request.operation,
        ...(onProgress === undefined ? {} : { onProgress }),
      });
      const transfers: Transferable[] = [];
      if (request.input.type === "archive") transfers.push(request.input.bytes);
      else for (const file of request.input.files) transfers.push(file.bytes);
      this.worker?.postMessage(request, transfers);
    });
  }

  cancel(requestId: string): void {
    const pending = this.pending.get(requestId);
    if (!pending) return;
    pending.resolve({
      requestId,
      operation: pending.operation,
      status: "cancelled",
    });
    this.pending.delete(requestId);
    // Termination gives cancellation teeth even during synchronous decompression.
    this.worker?.terminate();
    this.worker = undefined;
    this.initialization = undefined;
    this.state = { status: "uninitialized" };
    void this.initialize();
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.initialization = undefined;
    this.pending.clear();
    this.state = { status: "uninitialized" };
  }
}
