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
      upload: async (fieldKey, blob, name, onProgress) => {
        const form = new FormData();
        form.append("field_key", fieldKey); // before the file, so the server reads it first
        form.append("file", blob, name);
        const meta: FormFileMeta = await uploadWithProgress(`${api}/inspections/${inspectionId}/files`, form, onProgress);
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
