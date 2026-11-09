"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ClipboardList, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Loading01 from "@/features/template/component/Loading/Loading01";
import { usePermissions } from "@/hooks/usePermissions";
import { useCreateFormMutation, useGetFormsQuery } from "@/redux/api/formApi";
import { formatDate } from "@/utils/date";

/** Forms: the inspection checklists, their current version and who they're for. */
export default function FormsList() {
  const router = useRouter();
  const { check } = usePermissions();
  const canCreate = check({ allPermissions: ["FORMS:CREATE"] });
  const { data: forms = [], isLoading, isError } = useGetFormsQuery();
  const [creating, setCreating] = useState(false);

  if (isLoading) return <Loading01 />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Forms</h1>
          <p className="text-sm text-slate-500">Inspection checklists. Each change is a new version; inspections keep the version they were filled with.</p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreating(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New form
          </Button>
        )}
      </div>

      {isError ? (
        <p className="py-10 text-center text-red-600">Could not load forms.</p>
      ) : forms.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">No forms yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {forms.map((f) => (
            <button
              key={f.form_id}
              type="button"
              onClick={() => router.push(`/forms/${f.form_id}`)}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <ClipboardList className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-primary">{f.name}</p>
                  {f.name_am && (
                    <p lang="am" className="line-clamp-2 text-xs text-slate-500">
                      {f.name_am}
                    </p>
                  )}
                </div>
                {f.code && <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">{f.code}</span>}
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {f.published ? (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800">
                    Version {f.published.version_number} · {f.published.summary.questions} questions
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">Not published yet</span>
                )}
                {f.draft && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">Draft v{f.draft.version_number}</span>}
                {!f.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">Inactive</span>}
              </div>
              <p className="mt-auto border-t pt-2 text-xs text-slate-500">
                {f.assignment_count ? `${f.assignment_count} assignment${f.assignment_count === 1 ? "" : "s"}` : "Not assigned"}
                {f.published && ` · published ${formatDate(f.published.published_at)}`}
              </p>
            </button>
          ))}
        </div>
      )}

      <NewFormDialog open={creating} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/forms/${id}`)} />
    </div>
  );
}

function NewFormDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [createForm, { isLoading }] = useCreateFormMutation();
  const [name, setName] = useState("");
  const [nameAm, setNameAm] = useState("");
  const [code, setCode] = useState("");

  const save = async () => {
    if (name.trim().length < 3) return toast.error("Give the form a name.");
    try {
      const f = await createForm({ name: name.trim(), name_am: nameAm.trim() || null, code: code.trim() || null }).unwrap();
      toast.success("Form created. Add its sections and questions.");
      setName("");
      setNameAm("");
      setCode("");
      onClose();
      onCreated(f.form_id);
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not create the form.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New form</DialogTitle>
          <DialogDescription>It starts as an empty draft. Publish it when its questions are ready.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nf-name">Name (English) *</Label>
            <Input id="nf-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Small-scale mine quick check" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nf-name-am">ስም (አማርኛ)</Label>
            <Input id="nf-name-am" lang="am" value={nameAm} onChange={(e) => setNameAm(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nf-code">Code</Label>
            <Input id="nf-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SSM-QC" className="max-w-48 font-mono" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isLoading}>
            {isLoading ? "Creating…" : "Create form"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
