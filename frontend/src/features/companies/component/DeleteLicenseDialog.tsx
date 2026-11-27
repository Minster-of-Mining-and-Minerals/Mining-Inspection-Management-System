"use client";

/**
 * Deleting a license. It first checks what would go with it:
 *   - nothing: a plain confirmation
 *   - inspection tasks never submitted (e.g. a test license added to a running schedule): listed, deleted with it
 *   - some of them with saved answers or files: an extra warning and a box to tick
 *   - a submitted inspection: it can't be deleted (set it to revoked or expired instead)
 */
import { useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDeleteLicenseMutation, useGetLicenseDeleteCheckQuery } from "@/redux/api/companyApi";
import type { CompanyLicense } from "@/redux/types/company";
import { formatCalendarDate } from "@/utils/date";

const STATUS = { todo: "To do", in_progress: "In progress", submitted: "Submitted" } as const;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const messageOf = (e: unknown, fallback: string) => (e as { data?: { message?: string } } | undefined)?.data?.message || fallback;

export function DeleteLicenseDialog({ license, companyId, onClose, onEditStatus }: { license: CompanyLicense; companyId: string; onClose: () => void; onEditStatus: () => void }) {
  const { data: check, isLoading, isError, refetch } = useGetLicenseDeleteCheckQuery(license.license_id, { refetchOnMountOrArgChange: true });
  const [del, { isLoading: deleting }] = useDeleteLicenseMutation();
  const [understood, setUnderstood] = useState(false);

  const tasks = check?.tasks ?? [];
  const saved = tasks.filter((t) => t.answers || t.files);
  const answers = saved.reduce((n, t) => n + (t.answers ? 1 : 0), 0);
  const files = tasks.reduce((n, t) => n + t.files, 0);
  const blocked = !!check?.submitted;
  const canDelete = !!check && !blocked && (!saved.length || understood);

  const go = async () => {
    try {
      const r = await del({ licenseId: license.license_id, companyId, withTasks: tasks.length > 0, withAnswers: saved.length > 0 }).unwrap();
      toast.success(r.message || "License deleted.");
      onClose();
    } catch (e) {
      toast.error(messageOf(e, "Could not delete the license."));
      refetch();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !deleting && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-600">
            <DialogTitle className="sr-only">Delete license</DialogTitle>
            <Loader2 className="h-4 w-4 animate-spin" /> Checking the license…
          </div>
        ) : isError || !check ? (
          <>
            <DialogHeader>
              <DialogTitle>Delete license?</DialogTitle>
              <DialogDescription className="text-red-700">Could not check what this license is used for.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => refetch()}>Retry</Button>
            </DialogFooter>
          </>
        ) : blocked ? (
          <>
            <DialogHeader>
              <DialogTitle>This license can&apos;t be deleted</DialogTitle>
              <DialogDescription>
                {license.license_number} has {plural(check.submitted, "submitted inspection")}. Their records are kept. To stop new tasks for it, set its status to <b>revoked</b> or <b>expired</b> instead.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                OK
              </Button>
              <Button
                onClick={() => {
                  onClose();
                  onEditStatus();
                }}
              >
                Edit license status
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {tasks.length > 0 && <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden="true" />} Delete license {license.license_number}?
              </DialogTitle>
              <DialogDescription>
                {tasks.length
                  ? `It has ${plural(tasks.length, "inspection task")} that ${tasks.length === 1 ? "was" : "were"} never submitted. Deleting removes the license and ${tasks.length === 1 ? "this task" : "these tasks"}. This cannot be undone.`
                  : "It has no inspections. This cannot be undone. If it ended, set its status to expired or revoked instead so its history is kept."}
              </DialogDescription>
            </DialogHeader>
            {tasks.length > 0 && (
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                {tasks.map((t) => (
                  <li key={t.inspection_id}>
                    • Round of {formatCalendarDate(t.occurrence_date)}
                    {t.schedule ? ` (${t.schedule})` : ""} · {t.team ?? "no team"} · {STATUS[t.status]}
                    {t.answers || t.files ? <span className="text-red-700"> · {[t.answers ? "answers saved" : "", t.files ? plural(t.files, "file") : ""].filter(Boolean).join(", ")}</span> : null}
                  </li>
                ))}
              </ul>
            )}
            {saved.length > 0 && (
              <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900" role="alert">
                <p className="flex items-start gap-2 font-semibold">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {[answers ? `${plural(answers, "task")} ${answers === 1 ? "has" : "have"} saved answers` : "", files ? plural(files, "file") : ""].filter(Boolean).join(" and ")}. They will be deleted too.
                </p>
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                  <span>I understand the saved answers and files will be deleted</span>
                </label>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={onClose} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" className="gap-1.5" onClick={go} disabled={!canDelete || deleting}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleting ? "Deleting…" : tasks.length ? `Delete license and ${tasks.length === 1 ? "task" : "tasks"}` : "Delete license"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
