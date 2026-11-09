"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, ChevronRight, Edit, FilePlus2, PencilLine, Power, Trash2 } from "lucide-react";
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
import {
  useCreateDraftMutation,
  useDiscardDraftMutation,
  useGetFormByIdQuery,
  useGetFormVersionQuery,
  useGetVersionEditsQuery,
  useUpdateFormMutation,
} from "@/redux/api/formApi";
import { FormDetail as FormDetailType, FormVersionMeta, VERSION_STATUS_LABEL } from "@/redux/types/form";
import { formatDate } from "@/utils/date";
import { EditMode, FormEditor } from "./FormEditor";
import { FormPreview } from "./FormPreview";
import { AssignmentsPanel } from "./AssignmentsPanel";

type Tab = "questions" | "preview" | "assignments" | "versions";

export default function FormDetail() {
  const { formId } = useParams<{ formId: string }>();
  const router = useRouter();
  const { check } = usePermissions();
  const canEdit = check({ allPermissions: ["FORMS:UPDATE"] });
  const canPublish = check({ allPermissions: ["FORMS:PUBLISH"] });
  const canAssign = check({ allPermissions: ["FORMS:ASSIGN"] });
  const canEditLive = check({ allPermissions: ["FORMS:EDIT_LIVE"] });

  const { data: form, isLoading, isError } = useGetFormByIdQuery(formId, { skip: !formId });
  const [createDraft, { isLoading: startingDraft }] = useCreateDraftMutation();
  const [discardDraft, { isLoading: discarding }] = useDiscardDraftMutation();
  const [updateForm, { isLoading: toggling }] = useUpdateFormMutation();
  const [tab, setTab] = useState<Tab>("questions");
  const [editing, setEditing] = useState<EditMode | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [editingDetails, setEditingDetails] = useState(false);
  const [viewVersion, setViewVersion] = useState<string | null>(null);

  if (isLoading) return <Loading01 />;
  if (isError || !form) return <div className="p-8 text-center text-red-600">Checklist not found.</div>;

  // ---------- the editor takes over the page ----------
  if (editing) {
    const source = editing === "draft" ? form.draft : form.published;
    if (!source) return <Loading01 />; // e.g. right after moving live changes into a new draft
    return (
      <FormEditor
        key={`${editing}-${source.version_id}`}
        form={form}
        mode={editing}
        canPublish={canPublish}
        onExit={() => setEditing(null)}
        onSwitchToDraft={() => setEditing("draft")}
      />
    );
  }

  const working = form.draft ?? form.published;
  const tabs: { key: Tab; label: string }[] = [
    { key: "questions", label: "Questions" },
    { key: "preview", label: "Preview" },
    { key: "assignments", label: `Applies to (${form.assignment_count})` },
    { key: "versions", label: `Versions (${form.versions.length})` },
  ];

  const startNewVersion = async () => {
    setChoosing(false);
    if (!form.draft) {
      try {
        await createDraft(form.form_id).unwrap();
      } catch (e: any) {
        return toast.error(e?.data?.message || "Could not start a new version.");
      }
    }
    setEditing("draft");
  };

  /** Edit button: admins choose; everyone else gets a new version. */
  const onEdit = () => {
    if (form.draft || !form.published) return setEditing("draft");
    if (canEditLive) return setChoosing(true);
    startNewVersion();
  };

  const discard = async () => {
    if (!window.confirm(`Discard draft version ${form.draft?.version_number}? Its changes will be lost.`)) return;
    try {
      await discardDraft(form.form_id).unwrap();
      toast.success("Draft discarded.");
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not discard the draft.");
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="outline" size="icon" onClick={() => router.push("/forms")} aria-label="Back to checklists">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-primary">{form.name}</h1>
          {form.name_am && (
            <p lang="am" className="text-slate-600">
              {form.name_am}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
            {form.code && <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600">{form.code}</span>}
            {form.published ? (
              <span className="rounded-full bg-green-100 px-2 py-0.5 font-medium text-green-800">Current: version {form.published.version_number}</span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">Not published yet</span>
            )}
            {form.draft && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800">Draft version {form.draft.version_number}</span>}
            {!form.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">Inactive</span>}
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2"
              disabled={toggling}
              onClick={async () => {
                try {
                  await updateForm({ id: form.form_id, data: { is_active: !form.is_active } }).unwrap();
                  toast.success(form.is_active ? "Checklist deactivated: no new inspections will use it." : "Checklist activated.");
                } catch (e: any) {
                  toast.error(e?.data?.message || "Could not change the status.");
                }
              }}
            >
              <Power className="h-4 w-4" /> {form.is_active ? "Deactivate" : "Activate"}
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setEditingDetails(true)}>
              <Edit className="h-4 w-4" /> Name
            </Button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-semibold ${tab === t.key ? "border-golden-bright text-primary" : "border-transparent text-slate-500 hover:text-primary"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "questions" && (
        <div className="space-y-4">
          {form.draft && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
              <p className="mr-auto text-amber-900">
                <strong>Draft version {form.draft.version_number}</strong> is being prepared ({form.draft.summary.questions} questions, last saved{" "}
                {formatDate(form.draft.updated_at)}).
                {form.published && ` Inspections keep using version ${form.published.version_number} until it is published.`}
              </p>
              {canEdit && (
                <>
                  {form.published && (
                    <Button variant="outline" className="gap-2" onClick={discard} disabled={discarding}>
                      <Trash2 className="h-4 w-4" /> Discard draft
                    </Button>
                  )}
                  <Button className="gap-2" onClick={() => setEditing("draft")}>
                    <Edit className="h-4 w-4" /> Continue editing
                  </Button>
                </>
              )}
            </div>
          )}

          {form.published ? (
            <>
              {!form.draft && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                  <p className="mr-auto text-slate-600">
                    Version {form.published.version_number} is current
                    {(form.published.inspection_count ?? 0) > 0 && ` and has ${form.published.inspection_count} submitted inspection(s)`}.
                  </p>
                  {canEdit && (
                    <Button onClick={onEdit} disabled={startingDraft} className="gap-2">
                      <Edit className="h-4 w-4" /> {startingDraft ? "Starting…" : "Edit checklist"}
                    </Button>
                  )}
                </div>
              )}
              <FormPreview definition={form.published.definition} />
            </>
          ) : (
            !form.draft && <p className="py-10 text-center text-sm text-slate-500">No questions yet.</p>
          )}
        </div>
      )}

      {tab === "preview" &&
        (working ? (
          <>
            {form.draft && <p className="text-xs text-amber-700">Showing draft version {form.draft.version_number}.</p>}
            <FormPreview definition={working.definition} />
          </>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">Nothing to preview yet.</p>
        ))}

      {tab === "assignments" && <AssignmentsPanel formId={form.form_id} canAssign={canAssign} hasPublished={!!form.published} />}

      {tab === "versions" && (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <ul className="divide-y">
            {form.versions.map((v) => (
              <VersionRow key={v.version_id} formId={form.form_id} version={v} onView={() => setViewVersion(v.version_id)} />
            ))}
          </ul>
        </section>
      )}

      {choosing && form.published && (
        <EditChoiceDialog
          form={form}
          busy={startingDraft}
          onNewVersion={startNewVersion}
          onLive={() => {
            setChoosing(false);
            setEditing("live");
          }}
          onClose={() => setChoosing(false)}
        />
      )}
      {viewVersion && <OldVersionDialog formId={form.form_id} versionId={viewVersion} onClose={() => setViewVersion(null)} />}
      {editingDetails && <FormDetailsDialog form={form} onClose={() => setEditingDetails(false)} />}
    </div>
  );
}

/** Admin only: change the form through a new version, or directly in the current one. */
function EditChoiceDialog({
  form,
  busy,
  onNewVersion,
  onLive,
  onClose,
}: {
  form: FormDetailType;
  busy: boolean;
  onNewVersion: () => void;
  onLive: () => void;
  onClose: () => void;
}) {
  const v = form.published!;
  const inspections = v.inspection_count ?? 0;
  const Option = ({ icon, title, text, onClick, recommended }: { icon: React.ReactNode; title: string; text: string; onClick: () => void; recommended?: boolean }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`flex w-full items-start gap-3 rounded-xl border-2 p-4 text-left hover:border-primary ${recommended ? "border-primary/40" : "border-slate-200"}`}
    >
      <span className="mt-0.5 text-primary">{icon}</span>
      <span>
        <span className="block font-semibold text-slate-900">
          {title}
          {recommended && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Recommended</span>}
        </span>
        <span className="mt-1 block text-sm text-slate-600">{text}</span>
      </span>
    </button>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>How do you want to edit?</DialogTitle>
          <DialogDescription>
            Version {v.version_number} is current{inspections > 0 ? ` and has ${inspections} submitted inspection(s)` : ""}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Option
            recommended
            icon={<FilePlus2 className="h-5 w-5" />}
            title={`New version (${v.version_number + 1})`}
            text={`Make changes in a draft, saved as you go. Inspections keep using version ${v.version_number} until you publish.`}
            onClick={onNewVersion}
          />
          <Option
            icon={<PencilLine className="h-5 w-5" />}
            title={`Edit version ${v.version_number} directly`}
            text={
              inspections > 0
                ? "For small fixes: wording, translations, hints, order and new optional questions. Removing questions or changing scores needs a new version."
                : "No inspections use it yet, so any change is allowed. Every edit is recorded in the version history."
            }
            onClick={onLive}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VersionRow({ formId, version: v, onView }: { formId: string; version: FormVersionMeta; onView: () => void }) {
  const [open, setOpen] = useState(false);
  const edits = v.edit_count ?? 0;
  const { data: history, isFetching } = useGetVersionEditsQuery({ formId, versionId: v.version_id }, { skip: !open });
  return (
    <li className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-24 font-semibold text-slate-900">Version {v.version_number}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${v.status === "published" ? "bg-green-100 text-green-800" : v.status === "draft" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}
        >
          {VERSION_STATUS_LABEL[v.status]}
        </span>
        <span className="text-slate-500">
          {v.summary.sections} sections · {v.summary.questions} questions
        </span>
        <span className="text-slate-500">{v.published_at ? `published ${formatDate(v.published_at)}` : `edited ${formatDate(v.updated_at)}`}</span>
        {edits > 0 && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-1 text-primary hover:underline">
            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {edits} direct edit{edits === 1 ? "" : "s"}
          </button>
        )}
        {v.status === "retired" && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onView}>
            View
          </Button>
        )}
      </div>
      {v.change_note && <p className="mt-1 pl-[6.75rem] text-xs text-slate-600">{v.change_note}</p>}
      {open && (
        <ul className="ml-[6.75rem] mt-2 space-y-1 border-l-2 border-violet-200 pl-3 text-xs text-slate-600">
          {isFetching && !history ? (
            <li>Loading…</li>
          ) : (
            history?.map((e) => (
              <li key={e.edit_id}>
                <span className="text-slate-400">{formatDate(e.created_at)}</span> · {e.editor?.full_name ?? "Unknown"}: {e.summary}
                {e.note && <span className="italic"> — {e.note}</span>}
              </li>
            ))
          )}
        </ul>
      )}
    </li>
  );
}

function OldVersionDialog({ formId, versionId, onClose }: { formId: string; versionId: string; onClose: () => void }) {
  const { data, isLoading } = useGetFormVersionQuery({ formId, versionId });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{data ? `Version ${data.version_number} (old)` : "Loading…"}</DialogTitle>
          <DialogDescription>Inspections done with this version show these questions.</DialogDescription>
        </DialogHeader>
        {isLoading || !data ? <Loading01 /> : <FormPreview definition={data.definition} />}
      </DialogContent>
    </Dialog>
  );
}

function FormDetailsDialog({ form, onClose }: { form: FormDetailType; onClose: () => void }) {
  const [updateForm, { isLoading }] = useUpdateFormMutation();
  const [name, setName] = useState(form.name);
  const [nameAm, setNameAm] = useState(form.name_am ?? "");
  const [code, setCode] = useState(form.code ?? "");
  const [description, setDescription] = useState(form.description ?? "");

  const save = async () => {
    if (name.trim().length < 3) return toast.error("Give the checklist a name.");
    try {
      await updateForm({ id: form.form_id, data: { name: name.trim(), name_am: nameAm.trim() || null, code: code.trim() || null, description: description.trim() || null } }).unwrap();
      toast.success("Saved.");
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not save.");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Checklist name and description</DialogTitle>
          <DialogDescription>These apply to all versions.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fd-name">Name (English) *</Label>
            <Input id="fd-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fd-name-am">ስም (አማርኛ)</Label>
            <Input id="fd-name-am" lang="am" value={nameAm} onChange={(e) => setNameAm(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fd-code">Code</Label>
            <Input id="fd-code" value={code} onChange={(e) => setCode(e.target.value)} className="max-w-48 font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fd-desc">Description</Label>
            <textarea
              id="fd-desc"
              rows={4}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isLoading}>
            {isLoading ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
