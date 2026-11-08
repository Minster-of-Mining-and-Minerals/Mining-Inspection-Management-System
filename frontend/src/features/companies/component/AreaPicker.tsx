"use client";

import { useState } from "react";
import { MapPin, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchableSelect, SelectOption } from "@/components/ui/searchable-select";
import { useGetAdminAreasQuery } from "@/redux/api/adminAreaApi";
import { AdminArea } from "@/redux/types/adminArea";
import { LicenseAreaRef, areaPath } from "@/redux/types/company";

interface Props {
  value: LicenseAreaRef[];
  onChange: (areas: LicenseAreaRef[]) => void;
  disabled?: boolean;
}

const toOption = (a: AdminArea): SelectOption => ({ value: a.area_id, label: a.name });

/**
 * Pick the places a license covers: choose Region → Zone → Woreda and press Add.
 * Usually woredas; a zone or region can be added when nothing finer is known.
 */
export function AreaPicker({ value, onChange, disabled }: Props) {
  const [region, setRegion] = useState<SelectOption | null>(null);
  const [zone, setZone] = useState<SelectOption | null>(null);
  const [woreda, setWoreda] = useState<SelectOption | null>(null);

  const { data: regions } = useGetAdminAreasQuery({ level: "region", is_active: true, limit: 50 });
  const { data: zones, isFetching: zonesLoading } = useGetAdminAreasQuery(
    { parent_id: region?.value, is_active: true, limit: 100 },
    { skip: !region },
  );
  const { data: woredas, isFetching: woredasLoading } = useGetAdminAreasQuery(
    { parent_id: zone?.value, is_active: true, limit: 500 },
    { skip: !zone },
  );

  const byId = (list: AdminArea[] | undefined, id?: string) => list?.find((a) => a.area_id === id);

  const add = () => {
    const r = byId(regions?.data, region?.value);
    const z = byId(zones?.data, zone?.value);
    const w = byId(woredas?.data, woreda?.value);
    const pick = w || z || r;
    if (!pick || value.some((v) => v.area_id === pick.area_id)) return;

    // Keep the path so the chip can show "Woreda, Zone, Region" without another request
    const ref: LicenseAreaRef = w
      ? { ...w, parent: z ? { ...z, parent: r ?? null } : null }
      : z
        ? { ...z, parent: r ?? null }
        : { ...r! };
    onChange([...value, ref]);
    setWoreda(null);
  };

  const remove = (id: string) => onChange(value.filter((v) => v.area_id !== id));
  const level = woreda ? "woreda" : zone ? "zone" : region ? "region" : null;

  return (
    <div className="space-y-3">
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((a) => (
            <li key={a.area_id} className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 py-1 pl-3 pr-1 text-sm text-primary">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span>{areaPath(a)}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(a.area_id)}
                  className="rounded-full p-0.5 hover:bg-red-500 hover:text-white"
                  aria-label={`Remove ${a.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm italic text-slate-400">No location yet.</p>
      )}

      {!disabled && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <SearchableSelect
            options={(regions?.data ?? []).map(toOption)}
            value={region}
            onChange={(o) => {
              setRegion(o as SelectOption | null);
              setZone(null);
              setWoreda(null);
            }}
            placeholder="Region"
            isClearable
          />
          <SearchableSelect
            options={(zones?.data ?? []).map(toOption)}
            value={zone}
            onChange={(o) => {
              setZone(o as SelectOption | null);
              setWoreda(null);
            }}
            placeholder={zonesLoading ? "Loading…" : "Zone"}
            isDisabled={!region}
            isClearable
          />
          <SearchableSelect
            options={(woredas?.data ?? []).map(toOption)}
            value={woreda}
            onChange={(o) => setWoreda(o as SelectOption | null)}
            placeholder={woredasLoading ? "Loading…" : "Woreda"}
            isDisabled={!zone}
            isClearable
          />
          <Button type="button" variant="outline" onClick={add} disabled={!level} className="gap-1">
            <Plus className="h-4 w-4" />
            {level === "region" ? "Add region" : level === "zone" ? "Add zone" : "Add"}
          </Button>
        </div>
      )}
    </div>
  );
}
