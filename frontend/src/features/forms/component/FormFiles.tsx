"use client";

/**
 * File answers inside a form: photos / documents / videos (file questions and status evidence)
 * and signatures. The inspection page provides a FormFilesApi; without one (form preview)
 * the inputs show what the inspector will see, without uploading.
 */
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Eraser, FileText, Film, ImageUp, Loader2, PenLine, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FileKind, FormField } from "@/redux/types/form";
import type { SignatureAnswer } from "./formLogic";

export interface FormFileMeta {
  file_id: string;
  field_key: string;
  kind: FileKind | "signature";
  original_name: string;
  mime_type: string;
  size_bytes: number;
}

export interface FormFilesApi {
  files: Record<string, FormFileMeta>;
  /** A URL an <img>/<video>/<a> can open (signed, short-lived) */
  urlFor: (fileId: string) => string | undefined;
  upload: (fieldKey: string, file: File | Blob, name: string, onProgress?: (fraction: number) => void) => Promise<FormFileMeta>;
  remove: (fileId: string) => Promise<void>;
  /** Submitted / not the user's team: show files, no adding or removing */
  readOnly?: boolean;
}

export const FormFilesContext = createContext<FormFilesApi | null>(null);

const ACCEPT: Record<FileKind, string> = {
  image: "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif",
  document: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt",
  video: "video/mp4,video/quicktime,video/webm,video/3gpp,.mov,.mkv",
};
const KIND_WORD: Record<FileKind, string> = { image: "photos", document: "documents", video: "videos" };
const MB = 1024 * 1024;

export const formatBytes = (n: number) => (n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const kindOf = (file: File): FileKind | null => {
  const t = file.type;
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (t.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)) return "image";
  if (t.startsWith("video/") || ["mp4", "mov", "webm", "3gp", "mkv"].includes(ext)) return "video";
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt"].includes(ext)) return "document";
  return null;
};

/** Make phone photos smaller before uploading: longest side 2000 px, JPEG 85%. Other files unchanged. */
const shrinkImage = async (file: File): Promise<{ blob: Blob; name: string }> => {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 600 * 1024) return { blob: file, name: file.name };
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return { blob: file, name: file.name };
    return { blob, name: file.name.replace(/\.(png|webp|jpe?g)$/i, "") + ".jpg" };
  } catch {
    return { blob: file, name: file.name };
  }
};

interface Pending {
  id: string;
  name: string;
  progress: number;
}

/** Files of one question (a file question, or a status question's evidence). `value` = file ids. */
export function FileAnswer({
  field: f,
  value,
  onChange,
  language = "am",
}: {
  field: FormField;
  value: string[] | undefined;
  onChange: (ids: string[]) => void;
  label?: string;
  language?: "am" | "en";
}) {
  const am = language === "am";
  const api = useContext(FormFilesContext);
  const ids = value ?? [];
  const accept = f.accept?.length ? f.accept : (["image"] as FileKind[]);
  const max = f.max_files ?? 10;
  const maxMb = f.max_size_mb ?? 20;
  const [pending, setPending] = useState<Pending[]>([]);
  const latest = useRef(ids);
  latest.current = ids;

  if (!api)
    return (
      <UploadField accept={accept} max={max} maxMb={maxMb} count={0} am={am} disabled />
    );

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    let room = max - ids.length - pending.length;
    for (const file of Array.from(list)) {
      const kind = kindOf(file);
      if (!kind || !accept.includes(kind)) {
        toast.error(`“${file.name}”: this question takes ${accept.map((k) => KIND_WORD[k]).join(", ")} only.`);
        continue;
      }
      if (room <= 0) {
        toast.error(`At most ${max} files here.`);
        break;
      }
      const { blob, name } = kind === "image" ? await shrinkImage(file) : { blob: file as Blob, name: file.name };
      if (blob.size > maxMb * MB) {
        toast.error(`“${file.name}” is ${formatBytes(blob.size)}; the limit here is ${maxMb} MB.`);
        continue;
      }
      room--;
      const tempId = `${Date.now()}-${Math.random()}`;
      setPending((p) => [...p, { id: tempId, name, progress: 0 }]);
      api
        .upload(f.key, blob, name, (x) => setPending((p) => p.map((it) => (it.id === tempId ? { ...it, progress: x } : it))))
        .then((meta) => onChange([...latest.current, meta.file_id]))
        .catch((e: Error) => toast.error(e.message || `Could not upload “${name}”.`))
        .finally(() => setPending((p) => p.filter((it) => it.id !== tempId)));
    }
  };

  const remove = async (id: string) => {
    try {
      await api.remove(id);
      onChange(latest.current.filter((x) => x !== id));
    } catch (e: any) {
      toast.error(e?.message || "Could not remove the file.");
    }
  };

  const full = ids.length + pending.length >= max;
  const count = ids.length + pending.length;
  return (
    <div className="space-y-2">
      {(ids.length > 0 || pending.length > 0) && (
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {ids.map((id) => (
          <FileTile key={id} meta={api.files[id]} url={api.urlFor(id)} onRemove={api.readOnly ? undefined : () => remove(id)} />
        ))}
        {pending.map((p) => (
          <li key={p.id} className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2 text-center text-[11px] text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="line-clamp-1 break-all">{p.name}</span>
            <span className="h-1 w-full overflow-hidden rounded-full bg-slate-200">
              <span className="block h-full bg-primary" style={{ width: `${Math.round(p.progress * 100)}%` }} />
            </span>
          </li>
        ))}
      </ul>
      )}
      {!api.readOnly && <UploadField accept={accept} max={max} maxMb={maxMb} count={count} am={am} disabled={full} onPick={add} />}
      {api.readOnly && !ids.length && <p className="text-xs text-slate-500">{am ? "ምንም ፋይል የለም።" : "No files."}</p>}
    </div>
  );
}

const KIND_WORD_AM: Record<FileKind, string> = { image: "ፎቶ", document: "ሰነድ", video: "ቪዲዮ" };
/** "Add photos", "Add documents or videos" … */
const placeholderFor = (accept: FileKind[], am: boolean) => {
  const words = accept.map((k) => (am ? KIND_WORD_AM[k] : KIND_WORD[k]));
  const joined = words.length > 1 ? words.slice(0, -1).join(", ") + (am ? " ወይም " : " or ") + words[words.length - 1] : words[0];
  return am ? `${joined} ያክሉ` : `Add ${joined}`;
};

/** The one upload field: full width, dashed border. The phone offers camera, gallery and files itself; on a computer files can be dropped on it. */
function UploadField({ accept, max, maxMb, count, am, disabled, onPick }: { accept: FileKind[]; max: number; maxMb: number; count: number; am: boolean; disabled?: boolean; onPick?: (f: FileList | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const full = count >= max;
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && onPick) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) onPick?.(e.dataTransfer.files);
        }}
        className={`flex w-full items-center gap-3 rounded-lg border-[1.5px] border-dashed px-4 py-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${over ? "border-primary bg-primary/5" : "border-slate-300 bg-white hover:border-primary"}`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Plus className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-700">{full ? (am ? "የፋይል ገደብ ደርሷል" : "File limit reached") : placeholderFor(accept, am)}</span>
          <span className="block text-xs text-slate-500">
            {count}/{max} · {am ? `እስከ ${maxMb} MB` : `up to ${maxMb} MB each`}
          </span>
        </span>
      </button>
      {onPick && (
        <input
          ref={ref}
          type="file"
          className="hidden"
          accept={accept.map((k) => ACCEPT[k]).join(",")}
          multiple={max - count > 1}
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = "";
          }}
        />
      )}
    </>
  );
}

function FileTile({ meta, url, onRemove }: { meta?: FormFileMeta; url?: string; onRemove?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!meta) return null;
  const isImage = meta.kind === "image" && !/hei[cf]/i.test(meta.mime_type);
  return (
    <li className="group relative aspect-square overflow-hidden rounded-lg border border-slate-200 bg-white">
      <a href={url} target="_blank" rel="noreferrer" className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center" title={meta.original_name}>
        {isImage && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={meta.original_name} className="h-full w-full rounded object-cover" />
        ) : (
          <>
            {meta.kind === "video" ? <Film className="h-6 w-6 text-primary" /> : meta.kind === "image" ? <Camera className="h-6 w-6 text-primary" /> : <FileText className="h-6 w-6 text-primary" />}
            <span className="line-clamp-2 break-all text-[11px] text-slate-700">{meta.original_name}</span>
            <span className="text-[10px] text-slate-500">{formatBytes(meta.size_bytes)}</span>
          </>
        )}
      </a>
      {onRemove && (
      <button
        type="button"
        aria-label={`Remove ${meta.original_name}`}
        onClick={() => (confirming ? onRemove() : setConfirming(true))}
        onBlur={() => setConfirming(false)}
        className={`absolute right-1 top-1 rounded-full bg-white/90 p-1 shadow disabled:hidden ${confirming ? "text-red-600" : "text-slate-600"}`}
      >
        {confirming ? <Trash2 className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
      </button>
      )}
    </li>
  );
}

/* =================== signatures =================== */

const SIGNATURE_MAX_BYTES = 2 * MB; // the server's limit for a signature

/** A photo of a signature on paper, made small enough for a signature: longest side 1600 px, JPEG. */
const signaturePhoto = async (file: File): Promise<{ blob: Blob; name: string }> => {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // transparent PNGs on white
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (blob) return { blob, name: "signature-photo.jpg" };
  } catch {
    /* a format the browser can't open (e.g. HEIC): send it as it is */
  }
  return { blob: file, name: file.name };
};
export function SignatureAnswerInput({ field: f, value, onChange }: { field: FormField; value: SignatureAnswer | SignatureAnswer[] | null | undefined; onChange: (v: SignatureAnswer | SignatureAnswer[] | null) => void }) {
  const api = useContext(FormFilesContext);
  const list: SignatureAnswer[] = Array.isArray(value) ? value : value ? [value] : [];
  const [drawing, setDrawing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const withName = f.with_name !== false;

  if (!api)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
        <PenLine className="h-4 w-4" /> {f.multiple ? "Signatures (one per person)" : "Signature"}
        {withName && ", with name"}
      </div>
    );

  const commit = (next: SignatureAnswer[]) => onChange(f.multiple ? next : next[0] ?? null);
  const save = async (blob: Blob, name = "signature.png") => {
    try {
      const meta = await api.upload(f.key, blob, name);
      commit(f.multiple ? [...list, { file_id: meta.file_id, name: "" }] : [{ file_id: meta.file_id, name: list[0]?.name ?? "" }]);
      if (!f.multiple && list[0]) api.remove(list[0].file_id).catch(() => {});
      setDrawing(false);
    } catch (e: any) {
      toast.error(e?.message || "Could not save the signature.");
    }
  };
  // Instead of drawing: a photo of the signature (e.g. signed on paper)
  const savePhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") && !/.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
      toast.error("Choose a photo (JPEG or PNG) of the signature.");
      return;
    }
    setUploading(true);
    const { blob, name } = await signaturePhoto(file);
    if (blob.size > SIGNATURE_MAX_BYTES) {
      setUploading(false);
      toast.error(`The photo is ${formatBytes(blob.size)}; a signature photo can be at most 2 MB. Take it again as JPEG.`);
      return;
    }
    await save(blob, name);
    setUploading(false);
  };
  const photoButton = (label: string) => (
    <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={uploading} onClick={() => photoInput.current?.click()}>
      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />} {uploading ? "Uploading…" : label}
    </Button>
  );

  return (
    <div className="space-y-2">
      {list.map((s, i) => (
        <div key={s.file_id} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {api.urlFor(s.file_id) ? <img src={api.urlFor(s.file_id)} alt={`Signature of ${s.name || "signer"}`} className="h-16 w-48 rounded bg-white object-contain" /> : <span className="h-16 w-48" />}
          {withName && (
            <label className="min-w-40 flex-1 space-y-1 text-xs text-slate-600">
              Name of the person who signed
              <Input value={s.name ?? ""} onChange={(e) => commit(list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            </label>
          )}
          {!api.readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove signature"
            onClick={() => {
              api.remove(s.file_id).catch(() => {});
              commit(list.filter((_, j) => j !== i));
            }}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
          )}
        </div>
      ))}
      {api.readOnly && !list.length && <p className="text-xs text-slate-500">Not signed.</p>}
      {api.readOnly ? null : drawing ? (
        <SignaturePad onSave={save} onCancel={() => setDrawing(false)} />
      ) : (
        (f.multiple || !list.length) && (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setDrawing(true)}>
              {list.length ? <Plus className="h-4 w-4" /> : <PenLine className="h-4 w-4" />} {list.length ? "Add another signature" : "Sign"}
            </Button>
            <span className="text-xs text-slate-500">or</span>
            {photoButton(list.length ? "Add a signature photo" : "Upload a signature photo")}
          </div>
        )
      )}
      {!api.readOnly && !f.multiple && list.length > 0 && !drawing && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => setDrawing(true)}>
            Sign again
          </button>
          <button type="button" className="text-xs text-primary hover:underline" disabled={uploading} onClick={() => photoInput.current?.click()}>
            {uploading ? "Uploading…" : "Use a photo instead"}
          </button>
        </div>
      )}
      {!api.readOnly && (
        <input
          ref={photoInput}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          aria-label="Photo of the signature"
          onChange={(e) => {
            void savePhoto(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      )}
    </div>
  );
}

/**
 * A signature in a table cell (value = the file id): drawn in a pop-up, or a photo of it.
 */
export function SignatureCell({ fieldKey, value, onChange, signer }: { fieldKey: string; value: string | undefined; onChange: (fileId: string | undefined) => void; signer?: string }) {
  const api = useContext(FormFilesContext);
  const [drawing, setDrawing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);

  if (!api) return <span className="flex items-center gap-1 text-xs text-slate-400"><PenLine className="h-3.5 w-3.5" /> Signature</span>;

  const url = value ? api.urlFor(value) : undefined;
  const replace = async (blob: Blob, name: string) => {
    try {
      const meta = await api.upload(fieldKey, blob, name);
      if (value) api.remove(value).catch(() => {});
      onChange(meta.file_id);
      setDrawing(false);
    } catch (e) {
      toast.error((e instanceof Error && e.message) || "Could not save the signature.");
    }
  };
  const fromPhoto = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const { blob, name } = await signaturePhoto(file);
    if (blob.size > SIGNATURE_MAX_BYTES) toast.error(`The photo is ${formatBytes(blob.size)}; a signature photo can be at most 2 MB.`);
    else await replace(blob, name);
    setUploading(false);
  };

  if (value)
    return (
      <div className="flex items-center gap-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt={`Signature${signer ? ` of ${signer}` : ""}`} className="h-10 w-28 rounded border border-slate-200 bg-white object-contain" /> : <span className="h-10 w-28 rounded border border-slate-200 bg-slate-50" />}
        {!api.readOnly && (
          <button
            type="button"
            aria-label="Remove signature"
            className="rounded p-1 text-slate-400 hover:text-red-600"
            onClick={() => {
              api.remove(value).catch(() => {});
              onChange(undefined);
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  if (api.readOnly) return <span className="text-xs text-slate-400">Not signed</span>;
  return (
    <div className="flex items-center gap-1">
      <Button type="button" variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => setDrawing(true)} aria-label={`Sign${signer ? ` for ${signer}` : ""}`}>
        <PenLine className="h-3.5 w-3.5" /> Sign
      </Button>
      <Button type="button" variant="outline" size="sm" className="h-8 px-2" disabled={uploading} onClick={() => photoInput.current?.click()} aria-label="Upload a photo of the signature" title="Upload a photo of the signature">
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageUp className="h-3.5 w-3.5" />}
      </Button>
      <input
        ref={photoInput}
        type="file"
        className="hidden"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        aria-label="Photo of the signature"
        onChange={(e) => {
          void fromPhoto(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Dialog open={drawing} onOpenChange={setDrawing}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Signature{signer ? ` of ${signer}` : ""}</DialogTitle>
            <DialogDescription>Draw the signature with a finger or the mouse.</DialogDescription>
          </DialogHeader>
          <SignaturePad onSave={(png) => replace(png, "signature.png")} onCancel={() => setDrawing(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Draw with a finger or mouse; saved as a PNG on white. */
function SignaturePad({ onSave, onCancel }: { onSave: (png: Blob) => void; onCancel: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawingNow = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
  }, []);

  const point = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const clear = () => {
    const c = canvas.current!;
    const ctx = c.getContext("2d")!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
    setEmpty(true);
  };

  return (
    <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-2">
      <canvas
        ref={canvas}
        aria-label="Signature pad: draw your signature"
        className="h-40 w-full max-w-xl touch-none rounded border border-dashed border-slate-300 bg-white"
        onPointerDown={(e) => {
          drawingNow.current = true;
          canvas.current!.setPointerCapture(e.pointerId);
          const ctx = canvas.current!.getContext("2d")!;
          const p = point(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawingNow.current) return;
          const ctx = canvas.current!.getContext("2d")!;
          const p = point(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          setEmpty(false);
        }}
        onPointerUp={() => (drawingNow.current = false)}
        onPointerLeave={() => (drawingNow.current = false)}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={empty || saving}
          onClick={() => {
            setSaving(true);
            canvas.current!.toBlob((b) => {
              setSaving(false);
              if (b) onSave(b);
            }, "image/png");
          }}
        >
          {saving ? "Saving…" : "Save signature"}
        </Button>
        <Button type="button" size="sm" variant="outline" className="gap-1" onClick={clear}>
          <Eraser className="h-4 w-4" /> Clear
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
