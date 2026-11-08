import { Suspense } from "react";
import CompaniesList from "@/features/companies/component/CompaniesList";
import Loading01 from "@/features/template/component/Loading/Loading01";

// The list reads ?search= from the URL, which needs a Suspense boundary
export default function CompaniesPage() {
  return (
    <Suspense fallback={<Loading01 />}>
      <CompaniesList />
    </Suspense>
  );
}
