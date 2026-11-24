"use client";

/** The page moved under Inspections; saved links to the old address still work. */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Loading01 from "@/features/template/component/Loading/Loading01";

export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/inspections/opened-for-update");
  }, [router]);
  return <Loading01 />;
}
