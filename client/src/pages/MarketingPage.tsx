import type { LucideIcon } from "lucide-react";

import TopBar from "@/components/TopBar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SegmentBuilder from "@/components/marketing/SegmentBuilder";
import {
  BarChart3,
  CopyCheck,
  Filter,
  ListPlus,
  Megaphone,
  Palette,
  Send,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users2,
  Workflow,
} from "lucide-react";

interface FeatureCategory {
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  points: string[];
}

interface RoleDefinition {
  title: string;
  summary: string;
  permissions: string[];
}

interface SegmentListType {
  id: "smart" | "static";
  title: string;
  description: string;
  icon: LucideIcon;
  highlights: string[];
}

const segmentListTypes: SegmentListType[] = [
  {
    id: "smart",
    title: "Smart Lists",
    description: "Dynamische Zielgruppen, die sich anhand definierter Regeln bei Datenänderungen selbst aktualisieren.",
    icon: Sparkles,
    highlights: [
      "Regelwerk mit UND/ODER-Logik, Gewichtungen und Ausschlüssen",
      "Live-Preview der Treffer inklusive KPI-Überblick",
      "Automation-ready: Trigger für Kampagnen, Aufgaben oder Workflows",
    ],
  },
  {
    id: "static",
    title: "Static Lists",
    description: "Manuell gepflegte Verteiler für punktuelle Aktionen oder Exportzwecke.",
    icon: ListPlus,
    highlights: [
      "Listenaufbau per Drag & Drop aus Trefferlisten oder CSV-Import",
      "Zeitstempel & Herkunft, damit Snapshots nachvollziehbar bleiben",
      "Schneller Export für Mailinghouse, Events oder Vertriebsteams",
    ],
  },
];

const segmentFilters = [
  "PLZ / Regionen",
  "Zuständiger Außendienst",
  "Kundentyp (Gastro / FH / Endkunde)",
  "Hersteller / Weingut",
  "Rebsorte",
  "Fokuswein-Tag",
  "Umsatz- & Deckungsbeitragszeiträume",
  "Kauf- & Verkostungshistorie",
  "Zahlungsstatus",
  "Opt-in-Status",
  "Preisgruppe",
  "Lagerbestand & Back-in-Stock",
];

const dedupeHighlights = [
  "Primäre Versandadresse wird priorisiert, Duplikate werden markiert",
  "Kundenrollen (z. B. Inhaber, Sommelier) werden zusammengeführt",
  "Whitelist/Blacklist-Regeln verhindern versehentliche Mehrfachsendungen",
];

const featureCategories: FeatureCategory[] = [
  {
    title: "Kampagnen & Versand",
    description: "Vom Entwurf bis zur Freigabe klar geführt.",
    icon: Send,
    accent: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
    points: [
      "Kampagnenplanung mit Kanalwahl Outlook (Graph) oder Newsletter-Tool",
      "Sofortversand oder Terminierung inkl. Versandfenster und Zeitzone",
      "Genehmigungsworkflow: Entwurf → Review → Freigabe",
      "Tests mit begrenzter Empfängerzahl und Ablage als Outlook-Entwurf"
    ]
  },
  {
    title: "Trigger & Automationen",
    description: "Relevanz zur passenden Zeit.",
    icon: Workflow,
    accent: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
    points: [
      "Ereignisbasierte Trigger: Wareneingang, Preisänderung, neuer Jahrgang, Back-in-Stock",
      "Fokuswein-Markierung, Inaktivität, Tasting-Einladungen & Follow-ups",
      "Regeln für Bestandsschwellen, Marge und Segmentkriterien",
      "Frequenz-Capping wie maximal eine Marketing-Mail pro Woche und Empfänger"
    ]
  },
  {
    title: "Vorlagen & Varianten",
    description: "Corporate Design und Personalisierung konsistent umgesetzt.",
    icon: Palette,
    accent: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    points: [
      "MJML/HTML-Vorlagen mit CI-Elementen wie Header, Footer, Impressum und Abmeldelink",
      "Personalisierungs-Tokens (z. B. {{firstName}}, {{company}}, {{rep.name}}, {{product.*}})",
      "Preisgruppe, Staffelpreise und UTM-Parameter dynamisch einsetzbar",
      "Vorlagen-Varianten: Back-in-Stock, Neuer Jahrgang, Regionen-Special, Verkostungs-Nachfassung"
    ]
  },
  {
    title: "Provider & Postfächer",
    description: "Technische Base für skalierbare Kampagnen.",
    icon: Server,
    accent: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
    points: [
      "Outlook/Graph-Verknüpfung inkl. sendAs/sendOnBehalfOf, Signaturen und Drafts",
      "Newsletter-Tool-Anbindung (z. B. Brevo, Mailjet) per API- und Tracking-Domain",
      "Konfigurierbare Versand- und Rate-Limits je Kanal"
    ]
  },
  {
    title: "Reporting & Attribution",
    description: "Transparenz über Reichweite und Umsatzwirkung.",
    icon: BarChart3,
    accent: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300",
    points: [
      "Öffnungen, Klicks, Zustellungen, Bounces und Abmeldungen",
      "Umsatz- und Deckungsbeitragszuordnung nach Kampagne, Segment und Außendienst",
      "Vergleich Outlook versus Newsletter-Tool nach Reichweite und Reply-Rate"
    ]
  },
  {
    title: "Compliance & Governance",
    description: "Sichere und rechtskonforme Kommunikation.",
    icon: ShieldCheck,
    accent: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    points: [
      "Opt-in/Opt-out-Verwaltung mit zentraler Suppression-List (Bounce, Complaint, Unsubscribe)",
      "Double-Opt-in-Nachweise mit Quelle und Zeitstempel",
      "Pflichtangaben wie Impressum und Abmeldelink werden bei Marketing-Mails erzwungen"
    ]
  }
];

const roleDefinitions: RoleDefinition[] = [
  {
    title: "Außendienst (AD)",
    summary: "Individuelle Kampagnen mit persönlicher Handschrift.",
    permissions: [
      "Eigene Segmente und Kampagnen erstellen",
      "Versand über das persönliche Outlook-Postfach",
      "Freigegebene Vorlagen übernehmen, aber kein Massenversand über Newsletter-Tool ohne Freigabe"
    ]
  },
  {
    title: "Innendienst",
    summary: "Zentrale Steuerung und Unterstützung für alle Teams.",
    permissions: [
      "Globale Segmente und Verteiler anlegen und pflegen",
      "Versand über Outlook (Shared Mailbox) und Newsletter-Tool",
      "AD-Entwürfe generieren – pro Außendienst eine personalisierte Kampagnenversion"
    ]
  },
  {
    title: "Management",
    summary: "Governance, Freigaben und Reporting im Blick.",
    permissions: [
      "Alle Segmente, Kampagnen und Automationen einsehen",
      "Kampagnen freigeben und Versand auf beiden Kanälen anstoßen",
      "Reporting und Performance-Auswertung im Detail abrufen"
    ]
  }
];

export default function MarketingPage() {
  return (
    <div className="flex h-full flex-1 flex-col bg-muted/20">
      <TopBar title="Marketing" showSearch={false} actions={<div />} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-8">
          <section className="space-y-3">
            <div className="flex items-center gap-3 text-primary">
              <Megaphone className="h-6 w-6" />
              <span className="text-sm font-medium uppercase tracking-wide">Marketing Suite</span>
            </div>
            <h1 className="text-3xl font-semibold text-foreground">Segmentieren, automatisieren, begeistern</h1>
            <p className="max-w-3xl text-base text-muted-foreground">
              Die Marketing-Sektion bündelt alles, was du für personalisierte Kampagnen brauchst: von intelligenten
              Zielgruppenlisten über regelbasierte Automationen bis zu Compliance-sicherem Versand. Plane, teste und
              analysiere deine Kommunikation an einem Ort – passgenau für Fokusweine, Tasting-Serien oder regionale
              Aktionen.
            </p>
          </section>

          <section className="space-y-6">
            <SegmentBuilder />
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            {featureCategories.map((category) => (
              <Card key={category.title} className="h-full">
                <CardHeader className="pb-4">
                  <div className="flex items-start gap-4">
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${category.accent}`}
                    >
                      <category.icon className="h-6 w-6" />
                    </span>
                    <div className="space-y-1">
                      <CardTitle className="text-xl">{category.title}</CardTitle>
                      <CardDescription>{category.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  {category.points.map((point) => (
                    <div key={point} className="flex gap-2">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                      <p className="leading-relaxed text-foreground/90">{point}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">Rollen & Berechtigungen</h2>
              <p className="max-w-2xl text-base text-muted-foreground">
                Klar definierte Zuständigkeiten sichern eine saubere Governance – jede Rolle hat genau die Werkzeuge,
                die sie für ihren Teil der Kundenkommunikation braucht.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {roleDefinitions.map((role) => (
                <Card key={role.title} className="h-full">
                  <CardHeader className="space-y-2">
                    <CardTitle>{role.title}</CardTitle>
                    <CardDescription>{role.summary}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-muted-foreground">
                    {role.permissions.map((permission) => (
                      <div key={permission} className="flex gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
                        <p className="leading-relaxed text-foreground/90">{permission}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
