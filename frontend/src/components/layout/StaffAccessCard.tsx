import { CheckCircle2, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// Hero card on the home page: who the system is for, and the way in.
const StaffAccessCard = () => {
  const t = useTranslations("HomePage.staffAccess");
  const points = ["assigned", "checklist", "location"] as const;

  return (
    <div className="w-full rounded-2xl bg-white p-6 sm:p-8 text-slate-900 shadow-2xl shadow-black/30">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-golden-dark/10 text-golden-deep">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-lg font-bold">{t("title")}</h2>
          <p className="text-sm text-slate-600">{t("subtitle")}</p>
        </div>
      </div>

      <ul className="mt-6 space-y-3">
        {points.map((key) => (
          <li key={key} className="flex items-start gap-3 text-sm text-slate-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-golden-deep" />
            {t(`points.${key}`)}
          </li>
        ))}
      </ul>

      <Link
        href="/login"
        className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-white transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        {t("button")}
      </Link>
      <p className="mt-3 text-xs text-slate-600">{t("hint")}</p>
    </div>
  );
};

export default StaffAccessCard;
