/**
 * A short sample form for trying the system: 2 sections, 10 questions, one of every
 * question type (text, date, number, one choice, several choices, status, long text,
 * table, file upload, signature), plus a question that only shows for some answers.
 * Amharic is the main text; English is optional.
 */
const { DEFAULT_STATUS_OPTIONS } = require("../../utils/formDefinition");

module.exports = {
  code: "SAMPLE-SITE",
  name: "Sample site check",
  name_am: "የናሙና የሳይት ፍተሻ",
  description: "A short sample form (2 sections, 10 questions, every question type) for testing schedules and the inspector app.",
  definition: {
    status_options: DEFAULT_STATUS_OPTIONS.map((o) => ({ ...o })),
    sections: [
      {
        key: "site_info",
        number: "1",
        title: "Site information",
        title_am: "የሳይት መረጃ",
        fields: [
          // 1. Text, filled in from the license (can be corrected)
          { key: "company_name", type: "text", label_am: "የኩባንያው ስም", label: "Company name", required: true, prefill: "company.name" },
          // 2. Date
          { key: "visit_date", type: "date", label_am: "የጉብኝት ቀን", label: "Date of the visit", required: true },
          // 3. Number with a unit and limits
          {
            key: "workers_on_site",
            type: "number",
            label_am: "በሳይቱ ላይ ያሉ ሠራተኞች ብዛት",
            label: "Number of workers on site",
            help_am: "በጉብኝቱ ጊዜ የተቆጠሩ",
            help: "Counted during the visit",
            required: true,
            min: 0,
            max: 5000,
            unit: "workers",
          },
          // 4. One choice
          {
            key: "site_activity",
            type: "select",
            label_am: "በሳይቱ ላይ ያለው የሥራ እንቅስቃሴ",
            label: "Activity on site",
            required: true,
            options: [
              { value: "active", label: "Work going on", label_am: "ሥራ እየተካሄደ ነው" },
              { value: "partly", label: "Partly working", label_am: "በከፊል እየተሠራ ነው" },
              { value: "stopped", label: "Work stopped", label_am: "ሥራ ቆሟል" },
            ],
          },
          // 5. Several choices
          {
            key: "minerals_seen",
            type: "checkboxes",
            label_am: "በሳይቱ ላይ የታዩ ማዕድናት",
            label: "Minerals seen on site",
            options: [
              { value: "gold", label: "Gold", label_am: "ወርቅ" },
              { value: "marble", label: "Marble", label_am: "እብነበረድ" },
              { value: "gemstone", label: "Gemstones", label_am: "የከበሩ ድንጋዮች" },
              { value: "other", label: "Other", label_am: "ሌላ" },
            ],
          },
        ],
      },
      {
        key: "safety",
        number: "2",
        title: "Safety and environment",
        title_am: "ደህንነትና አካባቢ",
        fields: [
          // 6. Status (Met / Partly met / Not met / N/A) with required photo evidence
          {
            key: "ppe_used",
            type: "status",
            label_am: "ሠራተኞች ተገቢ የግል መከላከያ መሣሪያዎችን (PPE) ይጠቀማሉ",
            label: "Workers use the right PPE",
            required: true,
            evidence: "required",
            accept: ["image"],
            max_files: 5,
            max_size_mb: 10,
            status_options: DEFAULT_STATUS_OPTIONS.map((o) => ({ ...o })),
          },
          // 7. Long text, shown only when PPE is not (fully) met
          {
            key: "ppe_problem",
            type: "long_text",
            label_am: "የPPE ችግሩን በዝርዝር ይግለጹ",
            label: "Describe the PPE problem in detail",
            required: true,
            show_if: { field: "ppe_used", in: ["partial", "not_met"] },
          },
          // 8. Table with fixed rows
          {
            key: "equipment",
            type: "table",
            label_am: "በሳይቱ ላይ ያሉ ማሽኖች",
            label: "Machines on site",
            columns: [
              { key: "machine", label: "Machine", label_am: "ማሽን", type: "text" },
              { key: "count", label: "Number", label_am: "ብዛት", type: "number" },
              {
                key: "condition",
                label: "Condition",
                label_am: "ሁኔታ",
                type: "select",
                options: [
                  { value: "good", label: "Good", label_am: "ጥሩ" },
                  { value: "needs_repair", label: "Needs repair", label_am: "ጥገና ያስፈልገዋል" },
                  { value: "unsafe", label: "Unsafe", label_am: "አደገኛ" },
                ],
              },
            ],
            rows: [
              { label: "Excavator", label_am: "ኤክስካቫተር" },
              { label: "Truck", label_am: "የጭነት መኪና" },
            ],
            allow_add_rows: true,
          },
          // 9. File upload: photos and videos
          { key: "site_photos", type: "photo", label_am: "የሳይቱ ፎቶዎችና ቪዲዮዎች", label: "Photos and videos of the site", accept: ["image", "video"], max_files: 6, max_size_mb: 20 },
          // 10. Signature with the signer's name
          { key: "company_signature", type: "signature", label_am: "የኩባንያው ተወካይ ፊርማ", label: "Company representative's signature", required: true, multiple: false, with_name: true },
        ],
      },
    ],
  },
};
