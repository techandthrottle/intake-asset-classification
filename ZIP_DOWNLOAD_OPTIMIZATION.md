# Optimization Strategies for Bulk ZIP Downloads

The current implementation of the bulk ZIP downloader acts as a sequential proxy, which can lead to slow performance and timeouts when handling large files (especially videos). This document outlines four strategies to optimize or re-engineer this process.

## 1. Parallel Streaming (Low Complexity)
Instead of processing files one by one and waiting for a full buffer, we can parallelize the network I/O and stream data immediately.

- **The Change:** Use a concurrency limiter (like `p-limit`) to fetch 3–5 files at once.
- **True Streaming:** Switch from `axios` with `arraybuffer` to a raw `ReadableStream`. Pipe the GDrive response stream directly into the `archiver` instance.
- **Pros:** Faster perceived speed; lower memory footprint on the function.
- **Cons:** Still subject to the 540s Firebase Function HTTP timeout.

## 2. Client-Side Zipping (Medium Complexity)
Offload the compression work to the user's browser using libraries like `JSZip`.

- **How it works:** 
    1. The backend provides temporary access tokens or signed URLs for the selected files.
    2. The browser downloads files in parallel.
    3. The browser zips them locally and triggers a "Save As" dialog.
- **Pros:** Zero server-side CPU/RAM cost; bypasses all serverless timeouts; scales infinitely.
- **Cons:** Dependent on the user's hardware (RAM/CPU); large ZIPs might crash tabs on low-end devices.

## 3. Asynchronous "Job" Pattern (High Complexity)
Transform the download into a background task for maximum reliability with very large datasets.

- **How it works:**
    1. User clicks "Download All"; UI receives a "Job ID" immediately.
    2. A background Cloud Task or Pub/Sub trigger starts the zipping process.
    3. The worker uploads the completed `.zip` to a Google Cloud Storage (GCS) bucket.
    4. The UI polls for status and provides a fast GCS signed URL once finished.
- **Pros:** 100% robust against timeouts; supports multi-GB downloads.
- **Cons:** More infrastructure to manage (Cloud Tasks, Storage buckets); not an "instant" download.

## 4. GCS Composition & Internal Networking (High Performance)
Leverage the fact that videos may already be registered in Google Cloud Storage during the classification phase.

- **How it works:** Ensure the classification worker always saves a copy of the media to a temporary GCS bucket. At download time, stream from GCS instead of GDrive.
- **Optimization:** Data transfer within Google's internal network (GCS to Cloud Function) is significantly faster and more stable than the public GDrive API.
- **Pros:** Massive speed increase for the "fetch" part of the process.
- **Cons:** Increases storage costs for the temporary GCS buffer.

---

### Comparison Matrix

| Strategy | Speed | Reliability | Server Cost | Implementation Effort |
| :--- | :--- | :--- | :--- | :--- |
| **Parallel Streaming** | 🟢 Good | 🟡 Medium | 🟡 Medium | 🟢 Low |
| **Client-Side** | 🟢 Great | 🟢 High | 🟢 Zero | 🟡 Medium |
| **Async Job** | 🟡 Variable | 🟢 High | 🔴 High | 🔴 High |
| **GCS Sourced** | 🟢 Great | 🟢 High | 🔴 High | 🟡 Medium |
