"use client";

/**
 * Inspectors' task list (field-app style): the team, how much is done, pill tabs by status,
 * and compact cards per company license with a clear status chip and due line.
 * Grouped by company by default; also by due date, form or region.
 */
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, MapPin, Search, SlidersHorizontal, UsersRound, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import Loading01 from "@/features/template/component/Loading/Loading01";
import { useGetMyTasksQuery } from "@/redux/api/inspectionApi";
import { FREQUENCY_LABEL, TaskGroup, TaskListItem } from "@/redux/types/inspection";
import { formatCalendarDate, formatMonthYear } from "@/utils/date";
import { scoreText } from "./taskUi";

type Tab = "open" | TaskGroup;
type GroupBy = "due" | "form" | "company" | "region";
type Sort = "due" | "company" | "saved";
type Lang = "am" | "en";

const PREF_KEY = "mims.myTasks.prefs";
const LANG_KEY = "mims.inspection.language"; // same as the inspection page
/** Teams work company by company, so tasks are grouped by company unless the inspector picks otherwise */
const DEFAULT_GROUP_BY: GroupBy = "company";

const T = {
  title: { am: "የእኔ ምደባዎች", en: "My tasks" },
  done: { am: "ተጠናቀዋል", en: "Submitted" },
  leader: { am: "የቡድን መሪ", en: "team leader" },
  open: { am: "ሁሉም", en: "All open" },
  todo: { am: "ያልተጀመሩ", en: "Not started" },
  in_progress: { am: "በሂደት", en: "In progress" },
  returned: { am: "ተመልሰዋል", en: "Returned" },
  overdue: { am: "ያለፈባቸው", en: "Overdue" },
  submitted: { am: "የገቡ", en: "Submitted" },
  search: { am: "ኩባንያ፣ ፈቃድ፣ ቅጽ ወይም አካባቢ", en: "Company, license, checklist, area" },
  groupBy: { am: "በ…", en: "Group by" },
  company: { am: "ኩባንያ", en: "Company" },
  due: { am: "ቀነ ገደብ", en: "Due date" },
  form: { am: "ቼክሊስት", en: "Checklist" },
  region: { am: "ክልል", en: "Region" },
  filters: { am: "ማጣሪያ", en: "Filters" },
  clear: { am: "አጽዳ", en: "Clear" },
  none: { am: "አሁን የሚሠራ ምደባ የለም።", en: "Nothing here right now. New tasks appear when a schedule comes round." },
  noMatch: { am: "የሚመሳሰል የለም።", en: "No tasks match." },
  noTeam: { am: "እስካሁን በምልከታ ቡድን ውስጥ አልተመደቡም። አስተዳዳሪውን ይጠይቁ።", en: "You are not in an inspection team yet. Ask an administrator to add you to a team." },
} as const;

const todayLocal = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);
const lastDay = (dueAt: string) => new Date(new Date(dueAt).getTime() - 1 + 3 * 3600e3).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400e3);

/** Status chip of a task, like the design: Not started · In progress 40% · Returned · Overdue · Submitted. */
const chipFor = (t: TaskListItem, lang: Lang) => {
  const am = lang === "am";
  const pct = t.progress?.total ? Math.round((t.progress.answered / t.progress.total) * 100) : null;
  switch (t.group) {
    case "returned":
      return { text: am ? "ተመልሷል" : "Returned", tone: "bg-red-100 text-red-700" };
    case "overdue":
      return { text: am ? "ቀነ ገደቡ አልፏል" : "Overdue", tone: "bg-red-100 text-red-700" };
    case "in_progress":
      return { text: `${am ? "በሂደት" : "In progress"}${pct != null ? ` ${pct}%` : ""}`, tone: "bg-primary/10 text-primary" };
    case "submitted":
      return t.is_late ? { text: am ? "ዘግይቶ ገብቷል" : "Submitted late", tone: "bg-amber-100 text-amber-800" } : { text: am ? "ገብቷል" : "Submitted", tone: "bg-green-100 text-green-800" };
    default:
      return { text: am ? "ያልተጀመረ" : "Not started", tone: "bg-slate-100 text-slate-600" };
  }
};

/** "ቀነ ገደብ 25 Nov · 5 ቀን ቀርቷል", "ዛሬ", "ቀነ ገደቡ አልፏል · 2 ቀን" … */
const dueLine = (t: TaskListItem, lang: Lang) => {
  const am = lang === "am";
  if (t.status === "submitted") return { text: am ? `ገብቷል ${formatCalendarDate((t.submitted_at ?? "").slice(0, 10))}${t.submitter ? ` · ${t.submitter.full_name}` : ""}` : `Submitted ${formatCalendarDate((t.submitted_at ?? "").slice(0, 10))}${t.submitter ? ` by ${t.submitter.full_name}` : ""}`, urgent: false };
  const last = lastDay(t.due_at);
  const left = daysBetween(todayLocal(), last);
  if (left < 0) return { text: am ? `ቀነ ገደቡ አልፏል · ${-left} ቀን` : `Overdue by ${-left} day${left === -1 ? "" : "s"}`, urgent: true };
  if (left === 0) return { text: am ? "ቀነ ገደብ ዛሬ" : "Due today", urgent: true };
  return { text: am ? `ቀነ ገደብ ${formatCalendarDate(last)} · ${left} ቀን ቀርቷል` : `Due ${formatCalendarDate(last)} · ${left} day${left === 1 ? "" : "s"} left`, urgent: false };
};

interface Group {
  key: string;
  title: string;
  hint?: string;
  tone?: string;
  order: string;
  items: TaskListItem[];
}

/** Puts tasks into the chosen groups, keeping the most urgent groups first. */
const groupTasks = (tasks: TaskListItem[], by: GroupBy, submittedTab: boolean, lang: Lang): Group[] => {
  const am = lang === "am";
  const map = new Map<string, Group>();
  const add = (key: string, make: () => Omit<Group, "items" | "key">, t: TaskListItem) => {
    if (!map.has(key)) map.set(key, { key, ...make(), items: [] });
    map.get(key)!.items.push(t);
  };
  const today = todayLocal();
  for (const t of tasks) {
    if (by === "due") {
      if (submittedTab) {
        const m = (t.submitted_at ?? t.occurrence_date).slice(0, 7);
        add(m, () => ({ title: formatMonthYear(t.submitted_at ?? t.occurrence_date), order: `${9999 - Number(m.replace("-", ""))}` }), t);
        continue;
      }
      const d = lastDay(t.due_at);
      if (t.is_overdue) add("overdue", () => ({ title: am ? "ቀነ ገደቡ ያለፈባቸው" : "Overdue", tone: "text-red-700", order: "0" }), t);
      else if (d === today) add("today", () => ({ title: am ? "ዛሬ የሚጠናቀቁ" : "Due today", tone: "text-amber-700", order: "1" }), t);
      else if (d <= addDays(today, 7)) add("week", () => ({ title: am ? "በዚህ ሳምንት" : "Due this week", order: "2" }), t);
      else add("later", () => ({ title: am ? "በኋላ" : "Later", order: "3" }), t);
    } else if (by === "form") {
      const freq = t.schedule ? FREQUENCY_LABEL[t.schedule.frequency] : null;
      add(`${t.form_id}|${t.schedule_id ?? ""}`, () => ({ title: t.form?.name ?? "Checklist", hint: [t.schedule?.name, freq].filter(Boolean).join(" · "), order: t.form?.name ?? "" }), t);
    } else if (by === "company") {
      add(t.company_id, () => ({ title: t.company?.name ?? "Company", order: (t.company?.name ?? "").toLowerCase() }), t);
    } else {
      const region = t.area?.region ?? null;
      add(region ?? "~none", () => ({ title: region ?? (am ? "ክልል ያልተመዘገበ" : "Region not recorded"), order: region ? region.toLowerCase() : "~" }), t);
    }
  }
  const groups = [...map.values()].sort((a, b) => a.order.localeCompare(b.order));
  for (const g of groups) {
    if (by === "company") {
      const licenses = new Set(g.items.map((t) => t.license_id)).size;
      g.hint = am ? `${licenses} ፈቃድ · ${g.items.length} ምደባ` : `${licenses} license(s) · ${g.items.length} task(s)`;
    }
    if (by === "region") {
      const zones = [...new Set(g.items.map((t) => t.area?.zone).filter(Boolean))];
      if (zones.length) g.hint = zones.join(", ");
    }
  }
  return groups;
};

const readPrefs = (): { groupBy: GroupBy; sort: Sort; lang: Lang } => {
  try {
    const p = JSON.parse(window.localStorage.getItem(PREF_KEY) || "{}");
    const l = window.localStorage.getItem(LANG_KEY);
    return {
      groupBy: ["due", "form", "company", "region"].includes(p.groupBy) ? p.groupBy : DEFAULT_GROUP_BY,
      sort: ["due", "company", "saved"].includes(p.sort) ? p.sort : "due",
      lang: l === "en" ? "en" : "am",
    };
  } catch {
    return { groupBy: DEFAULT_GROUP_BY, sort: "due", lang: "am" };
  }
};

export default function MyTasks() {
  const router = useRouter();
  const { data, isLoading, isError } = useGetMyTasksQuery(undefined, { refetchOnMountOrArgChange: true, pollingInterval: 5 * 60 * 1000 });
  // Lists, tabs and filters are in English; questions and answers (on the inspection page) are in Amharic
  const lang = "en" as Lang;
  const [tab, setTab] = useState<Tab>("open");
  const [groupBy, setGroupBy] = useState<GroupBy>(DEFAULT_GROUP_BY);
  const [sort, setSort] = useState<Sort>("due");
  const [search, setSearch] = useState("");
  const [formFilter, setFormFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const am = lang === "am";
  const t = (k: keyof typeof T) => T[k][lang];

  useEffect(() => {
    const p = readPrefs();
    setGroupBy(p.groupBy);
    setSort(p.sort);
  }, []);
  const savePrefs = (next: { groupBy?: GroupBy; sort?: Sort }) => {
    try {
      window.localStorage.setItem(PREF_KEY, JSON.stringify({ groupBy, sort, ...next }));
    } catch {
      /* preference only */
    }
  };

  const allTasks = useMemo(() => [...(data?.todo ?? []), ...(data?.submitted ?? [])], [data]);
  const formOptions = useMemo(() => [...new Map(allTasks.map((x) => [x.form_id, x.form?.name ?? ""])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [allTasks]);
  const regionOptions = useMemo(() => [...new Set(allTasks.map((x) => x.area?.region).filter(Boolean) as string[])].sort(), [allTasks]);

  const groups = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    let list = tab === "submitted" ? data.submitted : tab === "open" ? data.todo : data.todo.filter((x) => x.group === tab);
    list = list.filter(
      (x) =>
        (!q || [x.company?.name, x.license?.license_number, x.form?.name, x.area?.region, x.area?.zone].some((v) => v?.toLowerCase().includes(q))) &&
        (!formFilter || x.form_id === formFilter) &&
        (!typeFilter || x.license?.license_type === typeFilter) &&
        (!regionFilter || x.area?.region === regionFilter),
    );
    const sorted = [...list].sort((a, b) =>
      sort === "company"
        ? (a.company?.name ?? "").localeCompare(b.company?.name ?? "")
        : sort === "saved"
          ? (b.last_saved_at ?? b.submitted_at ?? "").localeCompare(a.last_saved_at ?? a.submitted_at ?? "")
          : tab === "submitted"
            ? (b.submitted_at ?? "").localeCompare(a.submitted_at ?? "")
            : a.due_at.localeCompare(b.due_at),
    );
    return groupTasks(sorted, groupBy, tab === "submitted", lang);
  }, [data, tab, groupBy, sort, search, formFilter, typeFilter, regionFilter, lang]);

  if (isLoading) return <Loading01 />;
  if (isError || !data) return <p className="py-10 text-center text-red-600">Could not load your tasks.</p>;

  if (!data.team)
    return (
      <div className="space-y-4">
        <div className="mx-auto max-w-md rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-600">
          <UsersRound className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          {t("noTeam")}
        </div>
      </div>
    );

  const total = data.counts.open + data.counts.submitted;
  const pctDone = total ? Math.round((data.counts.submitted / total) * 100) : 0;
  const shownCount = groups.reduce((n, g) => n + g.items.length, 0);
  const filtersOn = !!(formFilter || typeFilter || regionFilter || search);
  const toggle = (key: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const tabs: Tab[] = ["open", "todo", "in_progress", "returned", "overdue", "submitted"];

  return (
    <div className="w-full space-y-3">
      {/* App bar: team · progress */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-slate-900">
              {data.team.name} · {t("title")}
            </h1>
            {data.role === "leader" && <p className="text-xs text-slate-500">{t("leader")}</p>}
          </div>
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">{t("done")}</span>
            <b className="tabular-nums text-slate-900">
              {data.counts.submitted} / {total}
            </b>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={pctDone} aria-valuemin={0} aria-valuemax={100} aria-label={t("done")}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${pctDone}%` }} />
          </div>
        </div>
      </div>

      {/* Pill tabs */}
      <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label={am ? "ሁኔታ" : "Status"}>
        {tabs.map((k) => {
          const n = data.counts[k] ?? 0;
          const urgent = (k === "overdue" || k === "returned") && n > 0;
          return (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm ${
                tab === k ? "border-slate-900 bg-slate-900 text-white" : urgent ? "border-red-200 bg-white text-red-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              {t(k)} <span className="tabular-nums">{n}</span>
            </button>
          );
        })}
      </div>

      {/* Search · group by · filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-52">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input aria-label={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search")} className="h-10 bg-white pl-9" />
        </div>
        <div className="flex rounded-lg bg-slate-200/70 p-1" role="group" aria-label={t("groupBy")}>
          {(
            [
              ["company", Building2],
              ["due", CalendarDays],
              ["form", ClipboardList],
              ["region", MapPin],
            ] as const
          ).map(([key, Icon]) => (
            <button
              key={key}
              type="button"
              aria-pressed={groupBy === key}
              onClick={() => {
                setGroupBy(key);
                setCollapsed(new Set());
                savePrefs({ groupBy: key });
              }}
              className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${groupBy === key ? "bg-white text-primary shadow-sm" : "text-slate-600"}`}
              title={t(key)}
            >
              <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t(key)}</span>
            </button>
          ))}
        </div>
        <Button variant={showFilters || filtersOn ? "secondary" : "outline"} size="sm" className="h-10 gap-1" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
          <SlidersHorizontal className="h-4 w-4" /> <span className="hidden sm:inline">{t("filters")}</span>
        </Button>
      </div>
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-xs">
          <FilterSelect label={t("form")} value={formFilter} onChange={setFormFilter} options={formOptions.map(([v, l]) => [v, l])} />
          <FilterSelect
            label={am ? "የፈቃድ ዓይነት" : "License type"}
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              ["mining", am ? "ማዕድን ማምረት" : "Mining"],
              ["exploration", am ? "ፍለጋ" : "Exploration"],
            ]}
          />
          <FilterSelect label={t("region")} value={regionFilter} onChange={setRegionFilter} options={regionOptions.map((r) => [r, r])} />
          <label className="ml-auto flex items-center gap-1 text-slate-500">
            {am ? "ቅደም ተከተል" : "Sort"}
            <select
              className="h-8 rounded-md border px-2 text-xs text-slate-700"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as Sort);
                savePrefs({ sort: e.target.value as Sort });
              }}
            >
              <option value="due">{am ? "ቀነ ገደብ ቅርብ" : tab === "submitted" ? "Newest first" : "Due soonest"}</option>
              <option value="company">{am ? "ኩባንያ ሀ–ፐ" : "Company A–Z"}</option>
              <option value="saved">{am ? "በቅርቡ የተቀመጡ" : "Recently saved"}</option>
            </select>
          </label>
          {filtersOn && (
            <button
              type="button"
              className="flex items-center gap-1 text-primary hover:underline"
              onClick={() => {
                setSearch("");
                setFormFilter("");
                setTypeFilter("");
                setRegionFilter("");
              }}
            >
              <X className="h-3.5 w-3.5" /> {t("clear")}
            </button>
          )}
        </div>
      )}

      {/* Groups of task cards */}
      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-500" />
          {filtersOn ? t("noMatch") : t("none")}
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500">{am ? `${shownCount} ምደባ` : `${shownCount} task${shownCount === 1 ? "" : "s"}`}</p>
          {groups.map((g) => {
            const isCollapsed = collapsed.has(g.key);
            return (
              <section key={g.key} className="space-y-2">
                <button type="button" onClick={() => toggle(g.key)} aria-expanded={!isCollapsed} className="flex w-full items-center gap-2 text-left">
                  {isCollapsed ? <ChevronRight className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  <span className={`text-sm font-semibold ${g.tone ?? "text-slate-800"}`}>{g.title}</span>
                  <span className="rounded-full bg-slate-200 px-1.5 text-xs text-slate-600">{g.items.length}</span>
                  {g.hint && <span className="truncate text-xs text-slate-500">· {g.hint}</span>}
                </button>
                {!isCollapsed && (
                  <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
                    {g.items.map((x) => (
                      <TaskCard key={x.inspection_id} task={x} groupBy={groupBy} lang={lang} onOpen={() => router.push(`/inspections/${x.inspection_id}`)} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  if (!options.length) return null;
  return (
    <select aria-label={label} className={`h-8 max-w-52 rounded-md border px-2 text-xs ${value ? "border-primary text-primary" : "text-slate-700"}`} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{label}: —</option>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/** A compact card like the design: name + status chip, then license · form · due line. */
function TaskCard({ task: t, groupBy, lang, onOpen }: { task: TaskListItem; groupBy: GroupBy; lang: Lang; onOpen: () => void }) {
  const chip = chipFor(t, lang);
  const due = dueLine(t, lang);
  const done = t.status === "submitted";
  const name = groupBy === "company" ? t.license?.license_number : t.company?.name;
  const area = [t.area?.region, t.area?.zone].filter(Boolean).join(" · ");
  const details = [
    groupBy === "company" ? null : t.license?.license_number,
    t.license?.license_type === "mining" ? (lang === "am" ? "ማምረት" : "Mining") : lang === "am" ? "ፍለጋ" : "Exploration",
    groupBy === "form" ? null : t.form?.name,
    groupBy === "region" ? t.area?.zone : area || null,
  ].filter(Boolean);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`grid w-full gap-1 rounded-xl border bg-white px-3.5 py-3 text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary ${
          t.group === "returned" || t.group === "overdue" ? "border-red-200" : "border-slate-200"
        }`}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate font-semibold text-slate-900">{name}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {done && <span className="text-sm font-bold text-slate-700">{scoreText(t.score)}</span>}
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${chip.tone}`}>{chip.text}</span>
          </span>
        </span>
        <span className="truncate text-xs text-slate-500">{details.join(" · ")}</span>
        <span className={`text-xs ${due.urgent ? "font-semibold text-red-700" : "text-slate-500"}`}>
          {due.text}
          {t.schedule && <span className="font-normal text-slate-400"> · {FREQUENCY_LABEL[t.schedule.frequency]}</span>}
        </span>
        {t.progress && !done && (
          <span className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round((t.progress.answered / Math.max(1, t.progress.total)) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={lang === "am" ? "የተመለሱ" : "Answered"}>
            <span className="block h-full bg-primary" style={{ width: `${(t.progress.answered / Math.max(1, t.progress.total)) * 100}%` }} />
          </span>
        )}
      </button>
    </li>
  );
}
