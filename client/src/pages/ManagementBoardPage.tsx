import type { ReactNode } from "react";

import TopBar from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ClipboardSignature,
  FileSpreadsheet,
  Flag,
  LucideIcon,
  ShieldCheck,
  Users2,
  Workflow,
} from "lucide-react";

const KPI_TILES = [
  {
    label: "Gesamtumsatz",
    value: "€ 1,28 Mio.",
    rolling: "28/90",
    mom: "+4,2%",
    yoy: "+12,6%",
  },
  {
    label: "Deckungsbeitrag",
    value: "€ 420 Tsd.",
    rolling: "28/90",
    mom: "+1,9%",
    yoy: "+6,4%",
  },
  {
    label: "Ø Warenkorb",
    value: "€ 312",
    rolling: "28/90",
    mom: "+2,3%",
    yoy: "+3,8%",
  },
  {
    label: "Auftragsanzahl",
    value: "3.290",
    rolling: "28/90",
    mom: "-1,2%",
    yoy: "+4,1%",
  },
  {
    label: "Retourenquote",
    value: "3,6%",
    rolling: "28/90",
    mom: "+0,4 PP",
    yoy: "-0,8 PP",
  },
  {
    label: "DSO",
    value: "38 Tage",
    rolling: "28/90",
    mom: "-2,0",
    yoy: "-4,5",
  },
  {
    label: "OOS-Quote",
    value: "7,4%",
    rolling: "28/90",
    mom: "-0,6 PP",
    yoy: "-1,1 PP",
  },
  {
    label: "Lieferfähigkeit",
    value: "92,5%",
    rolling: "28/90",
    mom: "+0,8 PP",
    yoy: "+2,4 PP",
  },
];

const REGION_HEATMAP = [
  { region: "PLZ 10-14", value: 82 },
  { region: "PLZ 60-69", value: 71 },
  { region: "PLZ 80-89", value: 66 },
  { region: "PLZ 20-29", value: 58 },
  { region: "PLZ 70-79", value: 54 },
  { region: "PLZ 30-39", value: 49 },
];

const SEGMENT_TOP10 = [
  { segment: "HORECA", share: 34, yoy: "+9%" },
  { segment: "Fachhandel", share: 28, yoy: "+6%" },
  { segment: "Online B2C", share: 22, yoy: "+18%" },
  { segment: "Export", share: 9, yoy: "+4%" },
  { segment: "Direktvertrieb", share: 7, yoy: "-2%" },
];

const ALERTS = [
  { label: "Kreditlimit überschritten", count: 3, variant: "destructive" as const },
  { label: "Allokationsbestand niedrig", count: 5, variant: "secondary" as const },
  { label: "Zahlungsziel überfällig", count: 4, variant: "default" as const },
  { label: "Key SKU unter Mindestbestand", count: 6, variant: "outline" as const },
];

const PIPELINE_STAGES = [
  { stage: "Prospecting", value: 420000, reps: 7, confidence: 35 },
  { stage: "Qualifiziert", value: 310000, reps: 6, confidence: 48 },
  { stage: "Angebot", value: 265000, reps: 5, confidence: 58 },
  { stage: "Verhandlung", value: 210000, reps: 4, confidence: 68 },
  { stage: "Commit", value: 185000, reps: 4, confidence: 82 },
];

const PRODUCT_IMPULSE = {
  runners: [
    { sku: "VN-1024", name: "Pinot Noir Edition", index: "A / X" },
    { sku: "VN-1001", name: "Riesling Reserve 2022", index: "A / Y" },
    { sku: "VN-1047", name: "Chardonnay Grande", index: "B / X" },
  ],
  sleepers: [
    { sku: "VN-2011", name: "Grauburgunder Classic", index: "C / Z" },
    { sku: "VN-2004", name: "Merlot Prestige 2018", index: "C / Y" },
  ],
  sensitivity: [
    { segment: "HORECA", discount: "-10,4%", conversion: "+6,2 PP" },
    { segment: "Fachhandel", discount: "-7,2%", conversion: "+3,1 PP" },
    { segment: "Online B2C", discount: "-5,6%", conversion: "+8,8 PP" },
  ],
};

const FUNNEL_LEVELS = [
  { label: "Weighted Pipeline", week: "€ 780 Tsd.", month: "€ 2,4 Mio.", quarter: "€ 6,8 Mio." },
  { label: "Commit", week: "€ 420 Tsd.", month: "€ 1,6 Mio.", quarter: "€ 4,2 Mio." },
  { label: "Best Case", week: "€ 980 Tsd.", month: "€ 2,9 Mio.", quarter: "€ 8,1 Mio." },
  { label: "Worst Case", week: "€ 520 Tsd.", month: "€ 1,9 Mio.", quarter: "€ 5,3 Mio." },
];

const REP_PERFORMANCE = [
  { rep: "M. Krause", calls: 48, meetings: 12, quotes: 9, hitRate: 38, cycle: 32, stalled: 3 },
  { rep: "S. Lehmann", calls: 36, meetings: 10, quotes: 7, hitRate: 44, cycle: 29, stalled: 1 },
  { rep: "P. Schneider", calls: 52, meetings: 15, quotes: 11, hitRate: 33, cycle: 41, stalled: 5 },
];

const CUSTOMER_RADAR = [
  { label: "Neukunden", value30: 18, value90: 46, indicator: "+12%" },
  { label: "Reaktivierungen", value30: 7, value90: 16, indicator: "+5%" },
  { label: "Churn Risiko", value30: 9, value90: 23, indicator: "-4%" },
];

const DISCOUNT_INSIGHTS = [
  { segment: "HORECA", avg: "-8,4%", approvals: 6, leakage: "€ 14,8 Tsd." },
  { segment: "Fachhandel", avg: "-6,1%", approvals: 4, leakage: "€ 9,3 Tsd." },
  { segment: "Online B2C", avg: "-5,0%", approvals: 8, leakage: "€ 7,1 Tsd." },
];

const KEY_ACCOUNTS = [
  { name: "GastroGroup Süd", revenue: "€ 186 Tsd.", margin: "24,8%", topics: 3, tickets: 2, quotes: 2 },
  { name: "Weinhandel Nord GmbH", revenue: "€ 142 Tsd.", margin: "22,1%", topics: 1, tickets: 1, quotes: 1 },
  { name: "Boutique La Vin", revenue: "€ 96 Tsd.", margin: "28,4%", topics: 2, tickets: 0, quotes: 1 },
];

const ALLOCATION_RULES = [
  { label: "Historie", value: 45 },
  { label: "Potenzial", value: 35 },
  { label: "Fairness-Score", value: 20 },
];

const SKU_TRAFFIC_LIGHT = [
  { sku: "VN-1088", status: "green", min: "120", max: "380", eta: "05.07.", backorders: 4, velocity: "+12%" },
  { sku: "VN-1021", status: "yellow", min: "90", max: "280", eta: "21.07.", backorders: 18, velocity: "-6%" },
  { sku: "VN-1057", status: "red", min: "110", max: "320", eta: "--", backorders: 36, velocity: "-14%" },
];

const CONTRIBUTION_MATRIX = [
  { label: "Region Süd", value: "€ 112 Tsd.", warning: false },
  { label: "Region Nord", value: "€ 96 Tsd.", warning: true },
  { label: "HORECA", value: "€ 88 Tsd.", warning: false },
  { label: "Online B2C", value: "€ 72 Tsd.", warning: false },
];

const PRICE_STRATEGY = [
  { sku: "VN-1024", purchase: "€ 14,20", retail: "€ 29,90", rounding: "0,10", minMargin: "42%" },
  { sku: "VN-1001", purchase: "€ 11,80", retail: "€ 24,50", rounding: "0,20", minMargin: "38%" },
  { sku: "VN-1099", purchase: "€ 17,50", retail: "€ 36,00", rounding: "0,00", minMargin: "41%" },
];

const FINANCE_BUCKETS = [
  { label: "0-30 Tage", value: "€ 218 Tsd.", share: 48 },
  { label: "31-60 Tage", value: "€ 96 Tsd.", share: 21 },
  { label: "61-90 Tage", value: "€ 58 Tsd.", share: 13 },
  { label: "> 90 Tage", value: "€ 83 Tsd.", share: 18 },
];

const CREDIT_LIMITS = [
  { customer: "Vinum Select", status: "Antrag", notes: "Erhöhung auf 75 Tsd.", due: "14.06." },
  { customer: "Gastro Nord", status: "Temporär", notes: "Limit bis 30.06.", due: "30.06." },
  { customer: "Handelshaus Merlot", status: "Review", notes: "Sicherheiten prüfen", due: "21.06." },
];

const PAYMENT_POLICIES = [
  { policy: "SEPA Lastschrift", allowed: "Premium Kunden", exceptions: "Export" },
  { policy: "Rechnung 30 Tage", allowed: "HORECA / Fachhandel", exceptions: "Online B2C" },
  { policy: "Vorkasse", allowed: "Neukunden < 3 Monate", exceptions: "Genehmigung CFO" },
];

const PROFITABILITY = [
  { dimension: "Kunde", detail: "Top 10 Kunden", value: "DB2: € 364 Tsd." },
  { dimension: "Segment", detail: "HORECA", value: "DB2: 26,4%" },
  { dimension: "SKU", detail: "VN-1047", value: "DB2: € 18,6 Tsd." },
];

const PEOPLE_ABSENCE = [
  { team: "Vertrieb DACH", vacation: 6, sick: 1, capacity: "82%" },
  { team: "Key Accounts", vacation: 2, sick: 0, capacity: "91%" },
  { team: "Inside Sales", vacation: 4, sick: 2, capacity: "74%" },
];

const APPROVAL_CATEGORIES = [
  { label: "Urlaub", pending: 2, icon: CalendarClock },
  { label: "Sonderpreise", pending: 3, icon: Banknote },
  { label: "Kreditlimit", pending: 1, icon: ShieldCheck },
  { label: "Allokationen", pending: 2, icon: Workflow },
  { label: "Budget", pending: 1, icon: ClipboardSignature },
  { label: "Bestellungen", pending: 4, icon: CheckCircle2 },
];

const REPORTING_ITEMS = [
  { label: "Monatsbericht", format: "PDF", next: "01.07." },
  { label: "Quartalsreview", format: "PowerPoint", next: "15.07." },
  { label: "Ad-hoc Pivot", format: "CSV", next: "Live" },
];

const AUDIT_ITEMS = [
  { label: "Genehmigungen", detail: "Letzte 24h", sla: "1,4h", owner: "CFO" },
  { label: "Rollen & Policies", detail: "Review fällig", sla: "5 Tage", owner: "HR" },
  { label: "SLAs", detail: "Antwortzeit", sla: "3,2h", owner: "Sales Ops" },
];

const TAB_ITEMS = [
  { value: "dashboard", label: "Management Dashboard" },
  { value: "sales", label: "Vertrieb & Pipeline" },
  { value: "procurement", label: "Einkauf & Bestand" },
  { value: "finance", label: "Finance & Risiko" },
  { value: "people", label: "People & Abwesenheiten" },
  { value: "approvals", label: "Genehmigungs-Center" },
  { value: "reports", label: "Reports & Exports" },
  { value: "audit", label: "Audit & Governance" },
];

type SectionProps = {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
};

function Section({ id, title, description, children }: SectionProps) {
  return (
    <section id={id} className="space-y-3">
      <div>
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {children}
      </div>
    </section>
  );
}

function StatChip({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="font-medium text-foreground">{label}:</span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  );
}

export default function ManagementBoardPage() {
  return (
    <div className="flex h-full flex-col">
      <TopBar
        title="Management Board"
        showSearch={false}
        actions={<div className="hidden text-sm text-muted-foreground md:block">Strategisches Cockpit für Führungskräfte</div>}
      />
      <div className="flex-1 overflow-y-auto bg-muted/10 p-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <Tabs defaultValue="dashboard" className="space-y-6">
            <TabsList className="flex h-auto w-full flex-wrap gap-2 rounded-xl bg-card p-2 shadow-sm">
              {TAB_ITEMS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="min-w-[160px] flex-1 whitespace-normal rounded-lg border border-transparent px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground focus-visible:ring-0 data-[state=active]:border-accent data-[state=active]:bg-accent/15 data-[state=active]:text-accent-600"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="dashboard" className="space-y-8">
              <Section
                id="executive-overview"
                title="Executive Overview"
                description="KPIs, Alerts und Impulse für die nächsten Entscheidungen."
              >
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>KPI-Kacheln (Rolling 28/90 Tage)</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {KPI_TILES.map((tile) => (
                      <div key={tile.label} className="rounded-lg border border-border bg-background p-4 shadow-sm">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{tile.rolling} Tage</span>
                          <Badge variant="outline">MoM {tile.mom}</Badge>
                        </div>
                        <div className="mt-2 text-2xl font-semibold text-foreground">{tile.value}</div>
                        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{tile.label}</span>
                          <Badge variant="secondary">YoY {tile.yoy}</Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Heatmap Umsatz & Top Segmente</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">Heatmap Umsatz nach Regionen</div>
                      <div className="grid gap-2">
                        {REGION_HEATMAP.map((row) => (
                          <div key={row.region} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                            <span className="truncate text-muted-foreground">{row.region}</span>
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                                <div
                                  className="h-full bg-emerald-500"
                                  style={{ width: `${Math.min(100, row.value)}%`, opacity: 0.4 + row.value / 120 }}
                                />
                              </div>
                              <span className="w-10 text-right text-xs font-semibold text-foreground">{row.value}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-3">
                      <div className="text-sm font-medium text-muted-foreground">Top-10 Kundensegmente</div>
                      <div className="space-y-2">
                        {SEGMENT_TOP10.map((segment) => (
                          <div key={segment.segment} className="flex items-center justify-between text-sm">
                            <span className="text-foreground">{segment.segment}</span>
                            <div className="flex items-center gap-3">
                              <Badge variant="outline">{segment.share}% Anteil</Badge>
                              <span className="text-xs text-muted-foreground">YoY {segment.yoy}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Alert-Leiste</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {ALERTS.map((alert) => (
                      <div key={alert.label} className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          {alert.label}
                        </div>
                        <Badge variant={alert.variant}> {alert.count} offene </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Pipeline Snapshot & Forecast Confidence</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {PIPELINE_STAGES.map((stage) => (
                      <div key={stage.stage} className="space-y-1 rounded-lg border border-border bg-card p-3">
                        <div className="flex items-center justify-between text-sm font-medium text-foreground">
                          <span>{stage.stage}</span>
                          <span>{Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(stage.value)}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{stage.reps} Reps</span>
                          <span>Forecast Confidence {stage.confidence}%</span>
                        </div>
                        <Progress value={stage.confidence} className="h-1.5" />
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Produkt-Impulse</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Schnellläufer (ABC/XYZ)</h4>
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {PRODUCT_IMPULSE.runners.map((item) => (
                          <li key={item.sku} className="flex items-center justify-between">
                            <span>{item.sku} · {item.name}</span>
                            <Badge variant="secondary">{item.index}</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Schläfer</h4>
                      <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                        {PRODUCT_IMPULSE.sleepers.map((item) => (
                          <li key={item.sku} className="flex items-center justify-between">
                            <span>{item.sku} · {item.name}</span>
                            <Badge variant="outline">{item.index}</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">Preissensibilität</h4>
                      <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                        {PRODUCT_IMPULSE.sensitivity.map((entry) => (
                          <div key={entry.segment} className="flex items-center justify-between">
                            <span>{entry.segment}</span>
                            <div className="flex items-center gap-3 text-xs">
                              <Badge variant="outline">Rabatt {entry.discount}</Badge>
                              <Badge variant="secondary">Conversion {entry.conversion}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Section>
            </TabsContent>

            <TabsContent value="sales" className="space-y-8">
              <Section
                id="sales-pipeline"
                title="Vertrieb & Pipeline"
                description="Leiter-Ansicht mit Funnel, Teamleistung und Kundenradar."
              >
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Funnel & Forecast</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border text-left text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-4 py-2 font-medium text-foreground">Szenario</th>
                          <th className="px-4 py-2 font-medium text-foreground">Woche</th>
                          <th className="px-4 py-2 font-medium text-foreground">Monat</th>
                          <th className="px-4 py-2 font-medium text-foreground">Quartal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {FUNNEL_LEVELS.map((level) => (
                          <tr key={level.label} className="bg-background">
                            <td className="px-4 py-2 text-foreground">{level.label}</td>
                            <td className="px-4 py-2 text-muted-foreground">{level.week}</td>
                            <td className="px-4 py-2 text-muted-foreground">{level.month}</td>
                            <td className="px-4 py-2 text-muted-foreground">{level.quarter}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Rep-Leistung</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {REP_PERFORMANCE.map((rep) => (
                      <div key={rep.rep} className="rounded-lg border border-border bg-card p-3">
                        <div className="flex justify-between text-sm font-semibold text-foreground">
                          <span>{rep.rep}</span>
                          <span>Hit Rate {rep.hitRate}%</span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <StatChip icon={Users2} label="Calls" value={String(rep.calls)} />
                          <StatChip icon={CalendarClock} label="Meetings" value={String(rep.meetings)} />
                          <StatChip icon={FileSpreadsheet} label="Angebote" value={String(rep.quotes)} />
                          <StatChip icon={Flag} label="Cycle Time" value={`${rep.cycle} Tage`} />
                        </div>
                        <div className="mt-2 text-xs text-destructive">Stalled Deals: {rep.stalled}</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Kundenradar</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {CUSTOMER_RADAR.map((item) => (
                      <div key={item.label} className="grid grid-cols-[1.5fr_repeat(2,_1fr)_auto] items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                        <span className="font-medium text-foreground">{item.label}</span>
                        <span>30 Tage: {item.value30}</span>
                        <span>90 Tage: {item.value90}</span>
                        <Badge variant="outline">Trend {item.indicator}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Preis- & Rabatt-Insights</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {DISCOUNT_INSIGHTS.map((entry) => (
                      <div key={entry.segment} className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                        <span className="font-medium text-foreground">{entry.segment}</span>
                        <div className="flex items-center gap-3 text-xs">
                          <Badge variant="outline">Ø Rabatt {entry.avg}</Badge>
                          <Badge variant="secondary">Genehmigt {entry.approvals}</Badge>
                          <Badge variant="destructive">Leakage {entry.leakage}</Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Key-Account-Boards</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {KEY_ACCOUNTS.map((account) => (
                      <div key={account.name} className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-foreground">{account.name}</p>
                            <p className="text-xs text-muted-foreground">Offene Themen: {account.topics}</p>
                          </div>
                          <Badge variant="secondary">Tickets {account.tickets}</Badge>
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-xs">
                          <span>Umsatz {account.revenue}</span>
                          <span>Marge {account.margin}</span>
                          <span>Angebote {account.quotes}</span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </Section>
            </TabsContent>

            <TabsContent value="procurement" className="space-y-8">
              <Section
                id="procurement"
                title="Einkauf & Bestand"
                description="Transparenz für alloziierte Sortimente und knappe Bestände."
              >
                <Card>
                  <CardHeader>
                    <CardTitle>Allokations-Cockpit</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Allokationsmenge</span>
                      <Badge variant="outline">12.800 Flaschen</Badge>
                    </div>
                    <div className="space-y-2">
                      {ALLOCATION_RULES.map((rule) => (
                        <div key={rule.label} className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-foreground">
                            <span>{rule.label}</span>
                            <span>{rule.value}%</span>
                          </div>
                          <Progress value={rule.value} className="h-1.5" />
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="secondary">Genehmigen</Badge>
                      <Badge variant="outline">Anpassen</Badge>
                      <Badge variant="outline">Kommunizieren</Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>SKU-Ampel</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {SKU_TRAFFIC_LIGHT.map((sku) => (
                      <div key={sku.sku} className="grid grid-cols-[1.5fr_repeat(4,_1fr)] items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                        <span className="font-medium text-foreground">{sku.sku}</span>
                        <Badge variant={sku.status === "green" ? "secondary" : sku.status === "yellow" ? "outline" : "destructive"}>{sku.status.toUpperCase()}</Badge>
                        <span>Min/Max: {sku.min}/{sku.max}</span>
                        <span>ETA: {sku.eta}</span>
                        <span>Backorders: {sku.backorders}</span>
                        <span>Tempo {sku.velocity}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Deckungsbeitrags-Matrix</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    {CONTRIBUTION_MATRIX.map((entry) => (
                      <div key={entry.label} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                        <span className="text-foreground">{entry.label}</span>
                        <div className="flex items-center gap-3 text-xs">
                          <Badge variant="outline">{entry.value}</Badge>
                          {entry.warning ? (
                            <Badge variant="destructive">Negativmarge Gefahr</Badge>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Preisstrategie-Panel</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {PRICE_STRATEGY.map((item) => (
                      <div key={item.sku} className="grid grid-cols-[1.2fr_repeat(4,_1fr)] items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                        <span className="font-medium text-foreground">{item.sku}</span>
                        <span>EK {item.purchase}</span>
                        <span>VK {item.retail}</span>
                        <span>Rundung {item.rounding}</span>
                        <Badge variant="outline">Mindestmarge {item.minMargin}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </Section>
            </TabsContent>

            <TabsContent value="finance" className="space-y-8">
              <Section
                id="finance-risk"
                title="Finance & Risiko"
                description="Cashflow, Kreditlinien und Profitabilität im Blick."
              >
                <Card>
                  <CardHeader>
                    <CardTitle>Forderungen / DSO</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {FINANCE_BUCKETS.map((bucket) => (
                      <div key={bucket.label} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                        <span className="font-medium text-foreground">{bucket.label}</span>
                        <div className="flex items-center gap-3">
                          <span>{bucket.value}</span>
                          <Badge variant="outline">{bucket.share}%</Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Kreditlimits & Bonität</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {CREDIT_LIMITS.map((limit) => (
                      <div key={limit.customer} className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">{limit.customer}</span>
                          <Badge variant="secondary">{limit.status}</Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{limit.notes}</div>
                        <div className="mt-2 text-xs text-muted-foreground">Fälligkeit: {limit.due}</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Zahlart-Policies & Ausnahmen</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {PAYMENT_POLICIES.map((policy) => (
                      <div key={policy.policy} className="rounded-lg border border-border bg-card p-3">
                        <div className="text-sm font-semibold text-foreground">{policy.policy}</div>
                        <div className="mt-1 text-xs text-muted-foreground">Erlaubt: {policy.allowed}</div>
                        <div className="text-xs text-muted-foreground">Ausnahmen: {policy.exceptions}</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Profitabilität</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {PROFITABILITY.map((item) => (
                      <div key={item.detail} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{item.dimension}</div>
                          <div className="text-xs text-muted-foreground">{item.detail}</div>
                        </div>
                        <Badge variant="outline">{item.value}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </Section>
            </TabsContent>

            <TabsContent value="people" className="space-y-8">
              <Section
                id="people"
                title="People & Abwesenheiten"
                description="Genehmigungen, Abwesenheiten und Kapazitäten."
              >
                <Card>
                  <CardHeader>
                    <CardTitle>Urlaubsanträge & Kalender</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <div className="rounded-lg border border-dashed border-border bg-card/50 p-4 text-center text-xs">
                      Kalenderansicht hier integrieren (Team-/Standort-Overlay, Konflikt-Hinweise, Resturlaub, Vertretung).
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="secondary">Konflikte</Badge>
                      <Badge variant="outline">Resturlaub anzeigen</Badge>
                      <Badge variant="outline">Vertretung vorschlagen</Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Krankmeldungen / Abwesenheiten</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <div className="rounded-lg border border-border bg-card/80 p-3 text-xs text-muted-foreground">
                      Upload Attest, Meldeprozess, Statistik (Verhältnis Kurz-/Langfrist).
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline">Neuer Fall</Badge>
                      <Badge variant="secondary">Statistik öffnen</Badge>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Ressourcenplanung Vertrieb</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {PEOPLE_ABSENCE.map((team) => (
                      <div key={team.team} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{team.team}</div>
                          <div className="text-xs text-muted-foreground">Urlaub: {team.vacation} · Krank: {team.sick}</div>
                        </div>
                        <Badge variant="outline">Kapazität {team.capacity}</Badge>
                      </div>
                    ))}
                    <div className="rounded-md border border-dashed border-border bg-card/50 p-3 text-xs">
                      Geplante Routen/Besuche vs. Kapazitäten – Engpass-Hinweise folgen.
                    </div>
                  </CardContent>
                </Card>
              </Section>
            </TabsContent>

            <TabsContent value="approvals" className="space-y-8">
              <Section
                id="approvals"
                title="Genehmigungs-Center"
                description="Ein Ort für alle Freigaben mit Status und Maßnahmen."
              >
                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Offene Genehmigungen</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {APPROVAL_CATEGORIES.map((item) => (
                      <div key={item.label} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                        <item.icon className="h-5 w-5 text-primary" />
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-foreground">{item.label}</div>
                          <div className="text-xs text-muted-foreground">{item.pending} Vorgänge offen</div>
                        </div>
                        <Badge variant="secondary">Jetzt prüfen</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </Section>
            </TabsContent>

            <TabsContent value="reports" className="space-y-8">
              <Section
                id="reports"
                title="Reports & Exports"
                description="Standardberichte, Ad-hoc Pivots und Exportformate."
              >
                <Card>
                  <CardHeader>
                    <CardTitle>Standardberichte</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {REPORTING_ITEMS.map((report) => (
                      <div key={report.label} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
                        <div>
                          <div className="text-sm font-semibold text-foreground">{report.label}</div>
                          <div className="text-xs text-muted-foreground">Nächste Aktualisierung: {report.next}</div>
                        </div>
                        <Badge variant="outline">{report.format}</Badge>
                      </div>
                    ))}
                    <div className="rounded-md border border-dashed border-border bg-card/50 p-3 text-xs">
                      „Management Pack“: Dashboard Screens + Kommentarzeilen als PDF generieren.
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Ad-hoc Pivot & Exports</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant="outline">Kunde × SKU × Zeitraum</Badge>
                      <Badge variant="secondary">Pivot speichern</Badge>
                      <Badge variant="outline">CSV Export</Badge>
                      <Badge variant="outline">Excel Export</Badge>
                    </div>
                    <div className="rounded-lg border border-dashed border-border bg-card/40 p-4 text-center text-xs">
                      Visual Builder für Custom Reports – Drag & Drop Felder.
                    </div>
                  </CardContent>
                </Card>
              </Section>
            </TabsContent>

            <TabsContent value="audit" className="space-y-8">
              <Section
                id="audit-governance"
                title="Audit & Governance"
                description="Transparenz über Freigaben, Rollen und SLAs."
              >
                <Card>
                  <CardHeader>
                    <CardTitle>Audit-Log</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    {AUDIT_ITEMS.map((item) => (
                      <div key={item.label} className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-foreground">{item.label}</div>
                            <div className="text-xs text-muted-foreground">{item.detail}</div>
                          </div>
                          <Badge variant="secondary">SLA {item.sla}</Badge>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">Verantwortlich: {item.owner}</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Rollen & Policies</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <div className="rounded-lg border border-border bg-card p-3">
                      <div className="text-sm font-semibold text-foreground">Schwellenwerte / Eskalationen</div>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                        <li>Genehmigungen &gt; € 25 Tsd. benötigen CFO Freigabe</li>
                        <li>Vertretungsregeln sind für alle Teams hinterlegt</li>
                        <li>Eskalationsketten je Segment konfigurierbar</li>
                      </ul>
                    </div>
                    <div className="rounded-lg border border-dashed border-border bg-card/60 p-3 text-xs">
                      Governance Cockpit: Änderungen versionieren, Freigabehistorie einsehen.
                    </div>
                  </CardContent>
                </Card>
              </Section>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
