"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSession } from "next-auth/react";
import { resolveApiBaseUrl } from "@/utils/apiUrl";
import type { FormFileMeta, FormFilesApi } from "@/features/forms/component/FormFiles";
import type { InspectionFile } from "@/redux/types/inspection";

const LINK_REFRESH_MS = 8 * 60 * 1000; // links last 10 minutes

const authHeader = async (): Promise<Record<string, string>> => {
  const session = await getSession();
  return session?.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {};
};

/** Upload with progress (fetch can't report upload progress). */
const uploadWithProgress = async (url: string, form: FormData, onProgress?: (f: number) => void) => {
  const headers = await authHeader();
  return new Promise<any>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let body: any = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON (e.g. a proxy error page) */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body?.data);
      else reject(new Error(body?.message || (xhr.status === 413 ? "The file is too large." : "Upload failed. Check your internet connection.")));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your internet connection."));
    xhr.send(form);
  });
};

/** Files above this go up in pieces that can resume after a dropped connection. */
const PIECES_FROM = 15 * 1024 * 1024;
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });
const cancelled = () => Object.assign(new Error("Upload cancelled."), { cancelled: true });

/**
 * A large file in pieces (about 8 MB each). A failed piece is retried with growing waits (no
 * internet: it waits for the connection to come back); the server says where to continue, so a
 * retry never sends data twice. Picking the same file again later resumes from what arrived.
 */
const uploadInPieces = async (base: string, fieldKey: string, blob: Blob, name: string, onProgress?: (f: number) => void, signal?: AbortSignal) => {
  const call = async (url: string, init: RequestInit = {}) => {
    const r = await fetch(url, { ...init, signal, headers: { ...(await authHeader()), ...(init.headers || {}) } });
    const body = await r.json().catch(() => null);
    return { r, body };
  };
  const started = await call(`${base}/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ field_key: fieldKey, name, type: blob.type, size: blob.size }),
  });
  if (!started.r.ok) throw new Error(started.body?.message || "Could not start the upload.");
  const id: string = started.body.data.upload_id;
  const piece: number = started.body.data.chunk_size || 8 * 1024 * 1024;
  let received: number = started.body.data.received || 0;
  onProgress?.(received / blob.size);
  let failures = 0;
  try {
    while (received < blob.size) {
      if (signal?.aborted) throw cancelled();
      try {
        const { r, body } = await call(`${base}/uploads/${id}?offset=${received}`, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: blob.slice(received, Math.min(received + piece, blob.size)),
        });
        if (r.status === 409 && typeof body?.received === "number") {
          received = body.received; // the server has more (or less) than we thought: continue from there
          continue;
        }
        if (!r.ok) {
          // A refusal (not allowed, too large…) won't get better by retrying
          if (r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) throw Object.assign(new Error(body?.message || "Upload refused."), { final: true });
          throw new Error(body?.message || `Server error ${r.status}`);
        }
        received = body.data.received;
        failures = 0;
        onProgress?.(received / blob.size);
      } catch (e) {
        if (signal?.aborted) throw cancelled();
        if ((e as { final?: boolean }).final) throw e;
        failures += 1;
        if (failures > 12) throw new Error(`The upload of “${name}” stopped (no connection for a while). Pick the file again to continue where it stopped.`);
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          // Wait for the connection to come back (or 60 s, then try anyway)
          await Promise.race([new Promise((ok) => window.addEventListener("online", ok, { once: true })), sleep(60000, signal)]);
        } else await sleep(Math.min(30000, 1000 * 2 ** failures), signal);
      }
    }
    const done = await call(`${base}/uploads/${id}/complete`, { method: "POST" });
    if (!done.r.ok) throw new Error(done.body?.message || "Could not save the file.");
    return done.body.data as FormFileMeta;
  } catch (e) {
    // Cancelled on purpose: drop what arrived. Otherwise keep it, so picking the file again resumes.
    if ((e as { cancelled?: boolean }).cancelled) await fetch(`${base}/uploads/${id}`, { method: "DELETE", headers: await authHeader() }).catch(() => {});
    throw e;
  }
};

/** Files of one inspection, for FormFilesContext. */
export function useInspectionFiles(inspectionId: string, initial: InspectionFile[], readOnly: boolean): FormFilesApi {
  const [own, setFiles] = useState<Record<string, FormFileMeta>>(() => Object.fromEntries(initial.map((f) => [f.file_id, f])));
  // Watching (read-only): the files the server lists now, so the team's new uploads appear live
  const listed = useMemo(() => Object.fromEntries(initial.map((f) => [f.file_id, f as FormFileMeta])), [initial]);
  const files = readOnly ? listed : own;
  const fileIds = Object.keys(files).sort().join(",");
  const [links, setLinks] = useState<Record<string, string>>({});
  const api = resolveApiBaseUrl();

  const refreshLinks = useCallback(async () => {
    try {
      const r = await fetch(`${api}/inspections/${inspectionId}/files/links`, { headers: await authHeader() });
      if (!r.ok) return;
      const body = await r.json();
      setLinks(Object.fromEntries(Object.entries<string>(body.data || {}).map(([id, path]) => [id, `${api}${path}`])));
    } catch {
      /* offline: keep the old links */
    }
  }, [api, inspectionId]);

  useEffect(() => {
    if (!fileIds) return;
    refreshLinks();
    const t = setInterval(refreshLinks, LINK_REFRESH_MS);
    return () => clearInterval(t);
  }, [refreshLinks, readOnly ? fileIds : ""]); // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo<FormFilesApi>(
    () => ({
      files,
      readOnly,
      urlFor: (id) => links[id],
      upload: async (fieldKey, blob, name, onProgress, signal) => {
        let meta: FormFileMeta;
        if (blob.size > PIECES_FROM) {
          // Large (videos, big documents): in pieces that resume after a dropped connection
          meta = await uploadInPieces(`${api}/inspections/${inspectionId}`, fieldKey, blob, name, onProgress, signal);
        } else {
          const form = new FormData();
          form.append("field_key", fieldKey); // before the file, so the server reads it first
          form.append("file", blob, name);
          meta = await uploadWithProgress(`${api}/inspections/${inspectionId}/files`, form, onProgress);
        }
        setFiles((f) => ({ ...f, [meta.file_id]: meta }));
        refreshLinks();
        return meta;
      },
      remove: async (id) => {
        const r = await fetch(`${api}/inspections/${inspectionId}/files/${id}`, { method: "DELETE", headers: await authHeader() });
        if (!r.ok && r.status !== 404) {
          const body = await r.json().catch(() => null);
          throw new Error(body?.message || "Could not remove the file.");
        }
        setFiles((f) => {
          const { [id]: _gone, ...rest } = f;
          return rest;
        });
      },
    }),
    [files, links, readOnly, api, inspectionId, refreshLinks],
  );
}
