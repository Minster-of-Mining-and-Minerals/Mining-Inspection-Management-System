import { Suspense } from "react";
import LocationsBrowser from "@/features/locations/component/LocationsBrowser";
import Loading01 from "@/features/template/component/Loading/Loading01";

// The browser reads ?area= and ?search= from the URL, which needs a Suspense boundary
export default function LocationsPage() {
  return (
    <Suspense fallback={<Loading01 />}>
      <LocationsBrowser />
    </Suspense>
  );
}
