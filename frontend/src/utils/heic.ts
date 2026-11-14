"use client";

/**
 * HEIC / HEIF photos (the iPhone's default format). Only Safari can draw them, so:
 *   - new uploads are turned into JPEG on the phone before they are sent (heicToJpeg);
 *   - photos already stored as HEIC are turned into a JPEG preview when shown (useHeicPreview).
 * The converter (heic2any) is loaded only when a HEIC file appears.
 */
import { useEffect, useState } from "react";

export const isHeic = (mime?: string, name?: string) => /hei[cf]/i.test(mime ?? "") || /\.hei[cf]$/i.test(name ?? "");

export async function heicToJpeg(blob: Blob, quality = 0.85): Promise<Blob> {
  const { default: heic2any } = await import("heic2any");
  const out = await heic2any({ blob, toType: "image/jpeg", quality });
  return Array.isArray(out) ? out[0] : out;
}

/** A HEIC file picked for upload, as a JPEG file (or the file itself if it can't be converted). */
export async function asJpegIfHeic(file: File): Promise<File> {
  if (!isHeic(file.type, file.name)) return file;
  try {
    const jpeg = await heicToJpeg(file);
    return new File([jpeg], file.name.replace(/\.hei[cf]$/i, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

// One conversion per stored file (signed links change, the path does not)
const previews = new Map<string, Promise<string>>();
const previewOf = (url: string) => {
  const key = url.split("?")[0];
  let p = previews.get(key);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.blob();
      })
      .then((b) => heicToJpeg(b, 0.8))
      .then((jpeg) => URL.createObjectURL(jpeg));
    p.catch(() => previews.delete(key));
    previews.set(key, p);
  }
  return p;
};

/**
 * The address to draw a stored photo from: the file itself, or for HEIC a JPEG made from it.
 * undefined while converting; "failed" if it could not be converted.
 */
export function useHeicPreview(url: string | undefined, heic: boolean): string | undefined | "failed" {
  const [state, setState] = useState<{ url?: string; value?: string | "failed" }>({});
  useEffect(() => {
    if (!url || !heic) return;
    let live = true;
    previewOf(url).then(
      (v) => live && setState({ url, value: v }),
      () => live && setState({ url, value: "failed" }),
    );
    return () => {
      live = false;
    };
  }, [url, heic]);
  if (!heic) return url;
  return state.url === url ? state.value : undefined;
}
