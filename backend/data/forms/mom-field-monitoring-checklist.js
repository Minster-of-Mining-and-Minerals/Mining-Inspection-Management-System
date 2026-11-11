/**
 * MoM Mining Field Monitoring Checklist (የማዕድን ሥራዎች የመስክ ክትትልና ቁጥጥር ቼክሊስት), version AM-0-1-0,
 * as a form definition (format: utils/formDefinition.js).
 *
 * Amharic is as written in the Ministry's checklist; English labels are translations.
 * Changes from the paper form, so it works as a digital form:
 *   - "Has production started?" was a note on section 8 ("ማእድን ውጣት ለጀመሩት ብቻ"); it is now
 *     a question, and the production questions and section 8 only appear when the answer is yes.
 *   - Section 4.1 (contract work plan) only appears for exploration licenses, as the paper says.
 *   - Section 3, row 3 asks for a description, so it is a long-text question, not a status.
 *   - Company and site details are pre-filled from the license and can be corrected.
 *   - No question is required: the inspector is shown what is not filled in before submitting.
 *   - Section 16 (signatures) is one table: Role type | Full name | Signature | Date, with a row per
 *     team member, the company lead, and the people interviewed (rows can be added).
 */
const { DEFAULT_STATUS_OPTIONS } = require("../../utils/formDefinition");

const status = (key, label, label_am, extra = {}) => ({ key, type: "status", label, label_am, evidence: "optional", ...extra });
const PRODUCING = { show_if: { field: "production_started", in: ["yes"] } };

module.exports = {
  code: "MOM-FMC",
  name: "MoM Mining Field Monitoring Checklist",
  name_am: "የማዕድን ሥራዎች የመስክ ክትትልና ቁጥጥር ቼክሊስት",
  description:
    "Field inspection checklist for companies holding an exploration or mining license from the Ministry of Mines (version AM-0-1-0). " +
    "Purpose: to check the work performance of licensed companies across the country through field inspection, so that support and follow-up in the sector are based on evidence.",
  definition: {
    status_options: DEFAULT_STATUS_OPTIONS.map((o) => ({ ...o })),
    sections: [
      {
        key: "company_site",
        number: "2",
        title: "Company and site information",
        title_am: "የኩባንያና የሥራ ቦታ መረጃ",
        fields: [
          { key: "company_name", type: "text", label: "Company name", label_am: "የኩባንያ ስም", prefill: "company.name" },
          { key: "license_number", type: "text", label: "License number", label_am: "የፈቃድ ቁጥር", prefill: "license.license_number" },
          { key: "region", type: "text", label: "Region", label_am: "ክልል", prefill: "license.region" },
          { key: "zone_woreda", type: "text", label: "Zone / Woreda", label_am: "ዞን / ወረዳ", prefill: "license.zone_woreda" },
          { key: "site_name", type: "text", label: "Mine site / project", label_am: "የማዕድን ቦታ / ፕሮጀክት", prefill: "license.site_name" },
          { key: "main_mineral", type: "text", label: "Main mineral", label_am: "ዋና ማዕድን", prefill: "license.minerals" },
          { key: "mining_method", type: "text", label: "Mining method", label_am: "የማዕድን ዘዴ" },
          { key: "unit_of_measure", type: "text", label: "Unit of measure", label_am: "የመለኪያ አይነት (Unit)" },
          { key: "observation_date", type: "date", label: "Date of the field observation", label_am: "የመስክ ምልካታው ቀን፣ ወር እና ዓ.ም" },
          { key: "mom_representative", type: "text", label: "Ministry of Mines representative(s)", label_am: "የማዕድን ሚኒስቴር ተወካይ", prefill: "inspection.team" },
          { key: "company_focal_person", type: "text", label: "Company representative (focal person)", label_am: "የኩባንያ ተውካይ ሰው (focal person)", prefill: "company.contact_person" },
          { key: "site_manager", type: "text", label: "Site manager", label_am: "የሳይት ኃላፊ" },
          {
            key: "production_started",
            type: "select",
            label: "Has the company started producing minerals?",
            label_am: "ኩባንያው ማዕድን ማምረት ጀምሯል?",
            help: "Production questions in section 3 and section 8 appear only when the answer is yes.",
            help_am: "በክፍል 3 ያሉት የምርት ጥያቄዎችና ክፍል 8 የሚታዩት መልሱ አዎ ሲሆን ብቻ ነው።",
            options: [
              { value: "yes", label: "Yes", label_am: "አዎ" },
              { value: "no", label: "No", label_am: "አይደለም" },
            ],
          },
        ],
      },
      {
        key: "observation",
        number: "3",
        title: "Observation points",
        title_am: "የምልከታ ነጥቦች",
        fields: [
          status("obs_work_at_site", "Work is taking place at the licensed site at the time of the visit", "በምልከታው ወቅት ፈቃድ በወጣበት ስፍራ ሰር ስለመኖሩ"),
          status("obs_work_recent", "Work has taken place at the licensed site in the days or months before the visit", "ከምልከታው ቀን ቀደም ባሉት ተከታታይ ቀናት/ወራት ፈቃድ በወጣበት ቦታ ስራ ስለመኖሩ"),
          { key: "obs_activities", type: "long_text", label: "Activities currently being carried out, in detail", label_am: "እየተሰራ ያለው ተግባር አይነት በዝርዝር" },
          status("obs_within_license_scope", "The company works only in the activity its license was issued for", "ፈቃድ ባወጡበት ዘርፍ ብቻ ላይ ተሰማሩ ስለመሆኑ"),
          status("obs_production_recorded", "Planned and actual production for the day are recorded", "ማዕድን ምርት ላይ የደረሱ ከሆነ የታቀደና ትክክለኛ የማዕድን ምርት መጠን ለዕለቱ ተመዝግቧል?", PRODUCING),
          status("obs_production_evidence", "Production figures are supported by mine records, survey measurements, weighbridge tickets or other evidence", "የምርት መረጃው በማዕድን መዝገብ፣ በSurvey መለኪያ፣ በWeighbridge ደረሰኝ ወይም በሌላ ማስረጃ የተደገፈ ስለመሆኑ", PRODUCING),
          status("obs_materials_recorded", "Mined ore, processed ore, removed waste rock / overburden and finished product / concentrate are recorded separately", "የተቆፈረ ማዕድን፣ የተቀነባበረ ማዕድን፣ የተወገደ ቆሻሻ አፈር/ድንጋይ እና የተዘጋጀ ምርት/Concentrate በተለያዩ የተመዘገበ ሰልመሆኑ", PRODUCING),
          status("obs_stockpile", "Stockpiles are identified, measured, reconciled and secured", "የማዕድን ክምችት (Stockpile) ተለይቶ፣ ተለክቶ፣ ተነጻጽሮና ተጠብቆ ስለመገኘቱ", PRODUCING),
          status("obs_dispatch_records", "Transport, dispatch and sales records are available", "የማጓጓዣ፣ የDispatch እና የሽያጭ መዝገቦች ስለመኖራቸው", PRODUCING),
          status("obs_hours_downtime", "Working hours, shifts, machine availability and downtime are recorded", "የሥራ ሰዓት፣ ፈረቃ፣ የማሽን መገኘትና Downtime ስለመመዝገቡ"),
          status("obs_variance", "Production shortfalls against the plan, work stoppages or unexplained losses are explained, with reasons", "ከዕቅድ እነጻር የተፈጠረ የምርት ልዩነት፣ የሥራ መቋረጥ ወይም ያልተገለጸ ኪሳራ ካለ ከነ ምክንያቱ"),
          status("obs_unauthorized", "Where unauthorized digging, stockpile movement or mineral transport is suspected, further supporting information was collected from the area", "ያልተፈቀደ ቁፋሮ፣ የክምችት እንቅስቃሴ ወይም የማዕድን ማጓጓዝ ወይም ጥርጣሬ ካለ ተጨማሪ አመካላች መረጃዎች ከአካባቢው በመውሰድ"),
        ],
      },
      {
        key: "legal",
        number: "4",
        title: "Mining license and legal compliance",
        title_am: "የማዕድን ፈቃድና የሕግ ተገዢነት",
        fields: [
          status("legal_license_on_site", "A valid mining license or permit document is available at the site", "ተገቢው የማዕድን ፈቃድ ወይም ፈቃድ ሰጪ ሰነድ ትክክለኛ ሆኖ በሳይት ስለመገኘቱ"),
          status("legal_conditions", "License conditions and reporting obligations are being met", "የፈቃድ ቅድመ ሁኔታዎችና የሪፖርት ግዴታዎች እየተፈጸሙ ስለመሆኑ"),
          status("legal_within_boundary", "Work is carried out within the licensed boundary and coordinates", "ሥራዎች በተፈቀደው የፈቃድ ወሰንና መጋጠሚያዎች ውስጥ ስለመካሄዳቸው"),
          status("legal_plans", "Approved mining, environmental and mine-closure plans are available as required", "የተፈቀዱ የማዕድን፣ የአካባቢና የማዕድን ቦታ መዝጊያ ዕቅዶች እንደአስፈላጊነቱ ስለመሀኘታቸው"),
          status("legal_records", "Required technical, production and other legal records are kept", "አስፈላጊ የቴክኒክ፣ የምርትና ሌሎች የሕግ መዝገቦች ስለመያዛቸው"),
          status("legal_previous_findings", "Findings and directives from previous inspections are being implemented (check any feedback kept at the site)", "የቀድሞ ተቆጣጣሪ አካል ግኝቶችና መመሪያዎች እየተፈጸሙ ስለመሆኑ/ ሳይት ያለ ገብረመልስ ካለ ይታይ/"),
          status("legal_violations", "Suspected legal violations, unauthorized changes or unmet obligations are recorded and reported", "ጥርጣሬ ያለባቸው የሕግ ጥሰቶች፣ ያልተፈቀዱ ለውጦች ወይም ያልተፈጸሙ ግዴታዎች ተመዝግበው ስለመተላላፋቸው"),
        ],
      },
      {
        key: "exploration_workplan",
        number: "4.1",
        title: "Exploration contract: annual work plan performance and evidence (exploration licenses only)",
        title_am: "የፍለጋ ውል ዓመታዊ የሥራ ዕቅድ አፈጻጸምና ማስረጃ ማረጋገጫ (የፍለጋ ፈቃድ ላላቸው ኩባንያዎች ብቻ)",
        description:
          "Record each task planned for each year under the signed exploration contract and approved amendments. Check in the field whether each task was done, choose its status, and record the name, number, date or other reference of the evidence. If a task was partly done or not done, explain why and the corrective action. If a contract year has more than one task, record each on its own row. Check that the evidence is attached or can be found by its reference number.",
        description_am:
          "በተፈረመው የፍለጋ ውልና በጸደቁ ማሻሻያዎች መሠረት ለየዓመቱ የተያዙትን ተግባራት በተናጥል ይመዝግቡ። እያንዳንዱ ተግባር ተፈጽሞ እንደሆነ በመስክ ያረጋግጡ፤ የአፈጻጸም ሁኔታውን ይምረጡ፣ እና የተግባሩን መፈጸም የሚያረጋግጥ የማስረጃ ሰነድ ስም፣ ቁጥር፣ ቀን ወይም ሌላ ማጣቀሻ ይመዝግቡ። በከፊል የተፈጸመ ወይም ያልተፈጸመ ተግባር ካለ፣ ምክንያቱንና የማስተካከያ እርምጃውን በማስታወሻ ይግለጹ። በአንድ የውል ዓመት ከአንድ በላይ ተግባር ካለ እያንዳንዱን በተለየ ረድፍ ይመዝግቡ። የቀረበው ማስረጃ ከዋናው ሰነድ ጋር ተያይዞ ወይም በማጣቀሻ ቁጥሩ ሊገኝ የሚችል መሆኑን ያረጋግጡ።",
        applies_to: { license_types: ["exploration"] },
        fields: [
          { key: "contract_signed_on", type: "date", label: "Date the contract was signed", label_am: "ውል የተፈረመበት ቀን" },
          { key: "contract_term_years", type: "number", label: "License / contract term", label_am: "የፈቃድ/ውል ጊዜ ወሰን", unit: "years / ዓመት", min: 0, max: 50 },
          { key: "contract_year_reviewed", type: "number", label: "Contract year under review", label_am: "የሚገመገመው የውል ዓመት", min: 1, max: 50 },
          { key: "contract_reference", type: "text", label: "Contract reference number", label_am: "የውል ማጣቀሻ ቁጥር" },
          {
            key: "workplan_tasks",
            type: "table",
            label: "Tasks in the contract, by contract year",
            label_am: "በውሉ የተያዙ ተግባራት በውል ዓመት",
            rows: [
              { label: "Year 1", label_am: "1ኛ ዓመት" },
              { label: "Year 2", label_am: "2ኛ ዓመት" },
              { label: "Year 3", label_am: "3ኛ ዓመት" },
              { label: "Year 4", label_am: "4ኛ ዓመት" },
              { label: "Year 5", label_am: "5ኛ ዓመት" },
              { label: "Year 6", label_am: "6ኛ ዓመት" },
              { label: "Year 7", label_am: "7ኛ ዓመት" },
              { label: "Year 8", label_am: "8ኛ ዓመት" },
              { label: "Year 9", label_am: "9ኛ ዓመት" },
              { label: "Year 10", label_am: "10ኛ ዓመት" },
            ],
            allow_add_rows: true,
            columns: [
              { key: "task", label: "Task in the contract", label_am: "በውሉ የተያዘው ተግባር", type: "text" },
              {
                key: "status",
                label: "Performance",
                label_am: "የአፈጻጸም ሁኔታ",
                type: "select",
                options: [
                  { value: "done", label: "Completed", label_am: "ተፈጽሟል" },
                  { value: "partial", label: "Partly completed", label_am: "በከፊል ተፈጽሟል" },
                  { value: "not_done", label: "Not completed", label_am: "አልተፈጸመም" },
                  { value: "not_due", label: "Not yet due", label_am: "የጊዜው አልደረሰም" },
                ],
              },
              { key: "evidence", label: "Evidence document, reference and inspector's note", label_am: "የማስረጃ ሰነድ፣ ማጣቀሻና የተቆጣጣሪ ማስታወሻ", type: "text" },
            ],
          },
        ],
      },
      {
        key: "osh",
        number: "5",
        title: "Occupational safety and health (OSH)",
        title_am: "የሥራ ደህንነትና ጤና (OSH)",
        fields: [
          status("osh_officer", "An OSH officer or responsible contact person has been assigned", "የOSH ኃላፊ ወይም ተጠያቂ አገናኝ ሰው ስለመመደቡ"),
          status("osh_risk_assessment", "A risk assessment and safe work procedures exist and are followed up in practice", "የሥራ አደጋ ግምገማ (Risk Assessment) እና የደህንነት የሥራ ሂደቶች ስለመኖራቸው እና በተግባር ክትትል ስለመደረጉ"),
          status("osh_ppe", "Suitable personal protective equipment (PPE) is provided to workers and used", "ተገቢ የግል መከላከያ መሣሪያዎች (PPE) ለሠራተኞች ስለመቅረባቸው እና ጥቅም ላይ ስለመዋላቸው"),
          status("osh_training", "Toolbox talks, induction and safety training take place", "የToolbox Talk፣ የሥራ መግቢያ ግንዛቤና የደህንነት ስልጠና ስለመኖ"),
          status("osh_ground_control", "Open-pit benches, pit walls and slopes, or underground support and access systems, are inspected as required", "የOpen-pit ቤንች፣ የጉድጓድ ግድግዳና ቁልቁለት፣ ወይም የUnderground የድጋፍና የመግቢያ ሥርዓቶች እንደአስፈላጊነቱ ስለመመርመራቸው"),
          status("osh_traffic", "Haul roads, vehicle movement, traffic control and machine inspection are adequate", "የHaul Road፣ የተሽከርካሪ እንቅስቃሴ፣ የትራፊክ ቁጥጥርና የማሽን ምርመራ በበቂ ሁኔታ ስለመኖሩ"),
          status("osh_hazardous_materials", "Explosives, fuel and hazardous chemicals are controlled by authorized, competent people as required", "ፈንጂዎች፣ ነዳጅና አደገኛ ኬሚካሎች እንደአስፈላጊነቱ በተፈቀደ ብቃት ባላቸው ሰዎች ቁጥጥር ስለመደረጉ"),
          status("osh_emergency", "First aid, emergency response, fire protection and evacuation arrangements are in place", "የመጀመሪያ ዕርዳታ፣ የአደጋ ጊዜ ምላሽ፣ የእሳት መከላከያና የማስወጫ ዝግጅት ስለመኖሩ"),
          status("osh_exposure", "Dust, noise, vibration, chemicals and other workplace exposures are under control", "አቧራ፣ ድምፅ፣ ንዝረት፣ ኬሚካልና ሌሎች የሥራ ቦታ ተጋላጭነቶች ቁጥጥር ሥር ስለመሆናቸው"),
          status("osh_incidents", "Accidents, injuries, near misses and corrective actions are recorded and reported", "አደጋዎች፣ ጉዳቶች፣ Near Miss እና የማስተካከያ እርምጃዎች ተመዝግበው ሪፖርት ስለመደረጋቸው"),
          status("osh_welfare", "Drinking water, toilets and worker welfare facilities are adequate", "የመጠጥ ውሃ፣ መጸዳጃና የሠራተኛ ደህንነት መገልገያዎች በቂ ስለመሆናቸው"),
        ],
      },
      {
        key: "environment",
        number: "6",
        title: "Environmental management and protection",
        title_am: "የአካባቢ አስተዳደርና ጥበቃ",
        fields: [
          status("env_permits", "Applicable environmental permits, ESIA/ESMP documents and monitoring commitments are available", "ተፈጻሚ የሆኑ የአካባቢ ፈቃዶች፣ ESIA/ESMP ሰነዶችና የክትትል ቃል ኪዳኖች ስለመገኘታቸው"),
          status("env_dust_noise", "Dust, noise and vibration impacts are monitored and controlled", "የአቧራ፣ ድምፅና ንዝረት ተፅዕኖዎች ክትትል እነ ቁጥጥር ስለመኖሩ"),
          status("env_water", "Surface and groundwater, drainage and wastewater are controlled so they do not cause pollution", "የወለልና የከርሰ ምድር ውሃ፣ ፍሳሽና ቆሻሻ ውሃ ብክለት እንዳያስከትሉ ስለሚደረግ ቁጥጥር"),
          status("env_tailings_waste_rock", "Tailings, waste rock and processing residues are managed properly", "Tailings፣ Waste Rock እና የማቀነባበሪያ ተረፈ ምርቶች በትክክል የሚስተዳዳሩበት አሰራር ስለመኖሩ"),
          status("env_tsf", "The tailings storage facility is inspected and monitored as required", "የTailings Storage Facility እንደአስፈላጊነቱ ምርመራን ክትትል የሚደረግለት ስለመሆኑ"),
          status("env_fuel_chemicals", "Fuel, oil and chemicals are stored in proper containment with spill response in place", "ነዳጅ፣ ዘይትና ኬሚካሎች በተገቢ መያዣና Spill Response ዝግጅት ስለመቀመጣቸው"),
          status("env_waste", "Hazardous and non-hazardous waste is separated, stored and disposed of properly", "አደገኛና አደገኛ ያልሆኑ ቆሻሻዎች ተለይተው፣ ተቀምጠውና በተገቢው ሁኔታ ስለመወገዳቸው"),
          status("env_erosion", "Soil erosion, sedimentation and land disturbance are under control", "የአፈር መሸርሸር፣ ደለል መከማቸትና የመሬት መረበሽ ቁጥጥር ሥር ስለመሆኑ"),
          status("env_rehabilitation", "Progressive rehabilitation is being carried out", "ቀጣይ የመሬት መልሶ ማልማት (Progressive Rehabilitation) እየተከናወነ ስለመሆኑ"),
          status("env_reporting", "Environmental incidents, complaints and monitoring results are recorded and reported to the relevant body", "የአካባቢ አደጋዎች፣ ቅሬታዎችና የክትትል ውጤቶች ተመዝግበው ለሚመለከተው አካል ስለመቅረቡ"),
          status("env_closure", "Mine closure and land rehabilitation obligations are planned and being met", "የማዕድን ቦታ መዝጊያና የመሬት መልሶ ማልማት ግዴታዎች ታቅደው እየተፈጸሙ ስለመሆኑ"),
        ],
      },
      {
        key: "labour_community",
        number: "7",
        title: "Labour, employment and community relations",
        title_am: "የሠራተኛ፣ የቅጥርና የማኅበረሰብ ግንኙነት",
        fields: [
          status("lab_register", "An up-to-date register of workers is kept", "የዘመነ የሠራተኞች መዝገብ ስለመያዙ"),
          status("lab_local_hiring", "Local hiring and skills development commitments are being met", "የአካባቢ ሠራተኛ ቅጥርና የክህሎት ማሳደግ ቃል ኪዳኖች እየተፈጸሙ ስለመሆኑ"),
          status("lab_contracts", "Employment contracts, wages, working hours and benefits are documented", "የቅጥር ውሎች፣ ደመወዝ፣ የሥራ ሰዓትና ተገቢ ጥቅማጥቅሞች በሰነድ ስለመያዛቸው"),
          status("lab_grievances", "Worker complaints and labour disputes are recorded and resolved", "የሠራተኛ ቅሬታዎችና የሥራ ክርክሮች ተመዝግበው መፍትሔ ስለማግኘታቸው"),
          status("com_grievances", "Community complaints, compensation and land-use issues are recorded and followed up", "የማኅበረሰብ ቅሬታዎች፣ ካሳና የመሬት መጠቀም ጉዳዮች ተመዝግበው ክትትል ስለመደረጉ"),
          status("com_commitments", "Local procurement and community development commitments are being met, with evidence", "የአካባቢ ግዢና የማኅበረሰብ ልማት ቃል ኪዳኖች እየተፈጸሙ ሰለመሆኑ በማሳያ"),
        ],
      },
      {
        key: "processing",
        number: "8",
        title: "Processing, mineral handling and marketing (producing mines only)",
        title_am: "ማቀነባበር፣ የማዕድን አያያዝና ገበያ/ ማእድን ውጣት ለጀመሩት ብቻ",
        ...PRODUCING,
        fields: [
          status("proc_capacity", "The processing plant operates within its approved scope and capacity", "የማቀነባበሪያ ፋብሪካው በተፈቀደው ወሰንና አቅም እየሠራ ስለመሆኑ"),
          status("proc_records", "Feed, throughput, recovery, product grade and process residues are recorded as required", "Feed፣ Throughput፣ Recovery፣ የምርት ደረጃና የሂደት ተረፈ ምርት እንደአስፈላጊነቱ ስለመመመዝገቡ"),
          status("proc_qc", "Sampling, assay, laboratory and quality control records are available", "የናሙና፣ Assay፣ ላቦራቶሪና Quality Control መዝገቦች ስለመገኘታቸው"),
          status("proc_reconciliation", "Opening stock, additions, dispatched quantity and closing stock are reconciled", "የመጀመሪያ ክምችት፣ ጭማሪ፣ የተላከ መጠንና የመጨረሻ ክምችት ስለመነጻጸሩ"),
          status("proc_sales", "Mineral sales, buyers, destinations and transport documents are tracked", "የማዕድን ሽያጭ፣ ገዢዎች፣ መዳረሻዎችና የማጓጓዣ ሰነዶች ክትትል ስለመደረጉ"),
          status("proc_discrepancies", "Differences between production, processing, stockpile and transport records are identified and reported", "በማዕድን ምርት፣ ማቀነባበር፣ ክምችትና ማጓጓዣ መዝገቦች መካከል ያለ ልዩነት ካለ ይለይና ይቅረብ"),
        ],
      },
      {
        key: "inputs",
        number: "9",
        title: "Equipment and infrastructure",
        title_am: "የመስሪያ ግብዓት",
        fields: [
          status("inp_equipment", "Machines and equipment are adequate for the planned work and in good working order", "ማሽኖችና መሣሪያዎች ለታቀደው ሥራ በቂና በጥሩ ሁኔታ ስለመስራታቸው"),
          status("inp_utilities", "Electricity, water, fuel, roads, workshop and communication services are adequate", "የኤሌክትሪክ፣ ውሃ፣ ነዳጅ፣ መንገድ፣ ዎርክሾፕና የግንኙነት አገልግሎቶች በቂ ስለመሆናቸው"),
          status("inp_maintenance", "Machine breakdowns, maintenance delays and critical spare parts are followed up", "የማሽን ብልሽት፣ የጥገና መዘግየትና ወሳኝ ተተኪ ዕቃዎች ክትትል ስለመደረጉ"),
          status("inp_instruments", "Weighbridge, laboratory, survey and monitoring equipment is installed as required and working", "Weighbridge፣ ላቦራቶሪ፣ Survey እና የክትትል መሣሪያዎች ይሠራሉ? እንደአስፈላጊነቱ ስለመተከላቸው"),
          status("inp_investment", "Infrastructure and investment commitments are being met on schedule", "የመሠረተ ልማትና የኢንቨስትመንት ቃል ኪዳኖች በታቀደው ጊዜ እየተፈጸሙ ስለመሆናቸው"),
        ],
      },
      {
        key: "findings",
        number: "10",
        title: "Findings, risks and corrective actions",
        title_am: "ግኝቶች፣ አደጋዎችና የማስተካከያ እርምጃዎች",
        fields: [
          status("find_critical_reported", "Critical hazards and serious non-compliance are reported to the Ministry immediately", "ወሳኝ አደጋዎችና ከባድ ግድፈቶች ወዲያውኑ ለሚኒስቴሩ ሪፖርት ስለመደረጋቸው"),
          status("find_documented", "Each finding is recorded with its date, location, evidence and responsible party", "እያንዳንዱ ግኝት ቀን፣ ቦታ፣ ማስረጃና ተጠያቂ አካል ተጠቅሶ ስለመመዝገቡ"),
          status("find_risk_rated", "Each finding has a risk level and a corrective action has been set", "የአደጋ ደረጃ ተመድቦ የማስተካከያ እርምጃ ስለመወደሱ"),
          { key: "overall_summary", type: "long_text", label: "Overall situation of the company, in brief", label_am: "አጠቃላይ ኩባንያው ያለበት ሁኔታ በአጭሩ" },
          { key: "company_actions", type: "long_text", label: "Actions expected from the company to improve performance", label_am: "አፈጻጸም እንዲሻሻል ከኩባንያው የሚጠበቅ እርምጃ" },
          { key: "regional_actions", type: "long_text", label: "Actions needed from the regional and local administration", label_am: "ከክልል እና አካባቢ አስተዳዳር የሚፈለግ እርምጃ" },
          { key: "ministry_issues", type: "long_text", label: "Issues that need the Ministry's intervention", label_am: "የሚኒስቴሩ ጣልቃ ገብነት የሚፈልጉ ጉዳዮች" },
          {
            key: "attached_evidence",
            type: "checkboxes",
            label: "Evidence attached",
            label_am: "የተያያዙ ማስረጃዎች",
            options: [
              { value: "photo", label: "Photos", label_am: "ፎቶ" },
              { value: "production_record", label: "Production record", label_am: "የምርት መዝገብ" },
              { value: "weighbridge_ticket", label: "Weighbridge ticket", label_am: "Weighbridge Ticket" },
              { value: "incident_report", label: "Incident report", label_am: "የአደጋ ሪፖርት" },
              { value: "other", label: "Other", label_am: "ሌላ" },
            ],
          },
          { key: "evidence_files", type: "photo", label: "Photos and documents", label_am: "ፎቶዎችና ሰነዶች", max_files: 20 },
        ],
      },
      {
        key: "signatures",
        number: "16",
        title: "Verification signatures",
        title_am: "የማረጋገጫ ፊርማ",
        description:
          "The team members (their names are filled in from the team), the company lead and each person interviewed sign with their full name and the date. Add a row for every other person interviewed.",
        description_am: "የቲም አባላት (ስማቸው ከቲሙ ይሞላል)፣ የኩባንያው ኃላፊና ቃለ መጠይቅ የተደረገላቸው ሰዎች በሙሉ ስማቸውና በቀኑ ይፈርማሉ። ለሌላ ቃለ መጠይቅ ለተደረገለት ሰው ረድፍ ይጨምሩ።",
        fields: [
          {
            key: "verification_signatures",
            type: "table",
            label: "Signatures of the team, the company lead and the people interviewed",
            label_am: "የቲም አባላት፣ የኩባንያ ኃላፊና ቃለ መጠይቅ የተደረገላቸው ሰዎች ፊርማ",
            row_header: "Role type",
            row_header_am: "የሚና ዓይነት",
            // One row per team member (2 to 4), then the company lead, then the people interviewed
            team_rows: { label: "Team member", label_am: "የቲም አባል", min: 2, max: 4 },
            rows: [
              { label: "Company lead", label_am: "የኩባንያ ኃላፊ" },
              { label: "Interviewed person 1", label_am: "ቃለ መጠይቅ የተደረገለት ሰው 1" },
            ],
            allow_add_rows: true,
            new_row_label: "Interviewed person",
            new_row_label_am: "ቃለ መጠይቅ የተደረገለት ሰው",
            columns: [
              { key: "full_name", label: "Full name", label_am: "ሙሉ ስም", type: "text" },
              { key: "signature", label: "Signature", label_am: "ፊርማ", type: "signature" },
              { key: "signed_on", label: "Date", label_am: "ቀን", type: "date" },
            ],
          },
        ],
      },
    ],
  },
};
