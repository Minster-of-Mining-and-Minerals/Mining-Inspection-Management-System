"use client";

import { Suspense } from "react";
import AllInspections from "@/features/inspections/component/AllInspections";
import Loading01 from "@/features/template/component/Loading/Loading01";

export default function InspectionsPage() {
  return (
    <Suspense fallback={<Loading01 />}>
      <AllInspections />
    </Suspense>
  );
}
