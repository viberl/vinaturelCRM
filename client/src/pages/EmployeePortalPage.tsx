import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  FileText,
  MessageSquare,
  Sun,
  UserCog
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import TopBar from "@/components/TopBar";

type PortalFeature = {
  title: string;
  description: string;
};

type PortalSection = {
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  features: PortalFeature[];
};

const sections: PortalSection[] = [
  {
    title: "Urlaub & Abwesenheiten",
    description: "Planung, Freigaben und Dokumentation aller Abwesenheiten auf einen Blick.",
    icon: Sun,
    accent: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
    features: [
      {
        title: "Urlaubsanträge stellen",
        description: "Anträge inkl. Resturlaubskonto und automatischer Kontingent-Abzüge erfassen."
      },
      {
        title: "Genehmigungsworkflow",
        description: "Geführter Prozess vom Antrag über Vorgesetzte zur Geschäftsführung mit Feedback."
      },
      {
        title: "Übersicht für Mitarbeiter",
        description: "Eigene Anträge, Genehmigungen, Ablehnungen und verbleibende Urlaubstage."
      },
      {
        title: "Übersicht für Geschäftsführung",
        description: "Teamweiter Urlaubskalender mit Engpasswarnungen und Abwesenheits-Heatmap."
      },
      {
        title: "Krankmeldungen hochladen",
        description: "Arbeitsunfähigkeitsbescheinigungen als Foto oder PDF digital einreichen."
      }
    ]
  },
  {
    title: "Kalender & Termine",
    description: "Persönliche Planung und Teamabstimmung mit nahtloser CRM-Verknüpfung.",
    icon: CalendarDays,
    accent: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
    features: [
      {
        title: "Eigener Kalender",
        description: "Persönliche Termine, Kundenbesuche und Urlaubszeiten konsolidiert verwalten."
      },
      {
        title: "Teamkalender",
        description: "Verfügbarkeiten des Teams, Kundenbesuche und Außendiensttouren transparent darstellen."
      },
      {
        title: "Outlook/Google Sync",
        description: "Beidseitige Synchronisation mit bestehenden Exchange- oder Google-Konten."
      },
      {
        title: "Besuchsberichte verknüpfen",
        description: "Berichte direkt am Termin erstellen, hochladen oder nachträglich abrufen."
      }
    ]
  },
  {
    title: "Dokumente & Richtlinien",
    description: "Alle wichtigen Unterlagen zentral strukturiert und jederzeit auffindbar.",
    icon: FileText,
    accent: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
    features: [
      {
        title: "Wissensdatenbank",
        description: "FAQ, Prozessbeschreibungen und Best Practices für den Vertriebsalltag."
      },
      {
        title: "Formulare & Vorlagen",
        description: "Reisekosten, Spesenabrechnungen und Vertragsvorlagen zum sofortigen Download."
      },
      {
        title: "Handbücher & Schulungen",
        description: "Onboarding-Guides, Trainingsressourcen und strukturierte Lernpfade."
      },
      {
        title: "Firmendokumente",
        description: "Arbeitszeitmodelle, Datenschutzrichtlinien und aktuelle Weinlisten als PDF."
      }
    ]
  },
  {
    title: "HR & Personalverwaltung",
    description: "Selbstservice und HR-Prozesse für Mitarbeitende und Führungskräfte.",
    icon: UserCog,
    accent: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
    features: [
      {
        title: "Mitarbeiterprofil",
        description: "Kontaktdaten, Position, Eintrittsdatum und Kompetenzen aktuell halten."
      },
      {
        title: "Dokumentenablage",
        description: "Gehaltsabrechnungen, Verträge und Zertifikate sicher über DMS-Anbindung abrufen."
      },
      {
        title: "Feedback & Zielvereinbarungen",
        description: "Mitarbeitergespräche dokumentieren sowie Ziele planen und nachverfolgen."
      },
      {
        title: "Weiterbildungs-Tracking",
        description: "Schulungen, Teilnahmebestätigungen und Zertifikate chronologisch erfassen."
      }
    ]
  },
  {
    title: "Interne Kommunikation",
    description: "Aktuelle Informationen und direkter Austausch ohne Tool-Bruch.",
    icon: MessageSquare,
    accent: "bg-rose-500/15 text-rose-600 dark:text-rose-300",
    features: [
      {
        title: "Schwarzes Brett / Newsfeed",
        description: "Wichtige interne Updates, neue Weingüter und Vertriebskampagnen teilen."
      },
      {
        title: "Team-Chat oder Forum",
        description: "Kurze Abstimmungen, Wissensaustausch und thematische Diskussionsräume."
      },
      {
        title: "Ideenbox",
        description: "Vorschläge für CRM-Funktionen, Prozesse oder Sortiment strukturieren."
      }
    ]
  },
  {
    title: "Statistiken & Self-Service",
    description: "Transparente KPIs und Self-Service-Funktionen für Mitarbeitende.",
    icon: BarChart3,
    accent: "bg-sky-500/15 text-sky-600 dark:text-sky-300",
    features: [
      {
        title: "Eigene Aktivitäten",
        description: "Kontakte, Besuche und Aufträge pro Mitarbeiter im Wochen- oder Monatsblick."
      },
      {
        title: "Verkaufsstatistiken",
        description: "Ziele versus Ist-Werte für Außendienst und Innendienst analysieren."
      },
      {
        title: "Reisekosten & Kilometerstände",
        description: "Abrechnungen erfassen, Belege hochladen und Status der Prüfung verfolgen."
      },
      {
        title: "Self-Service Stammdaten",
        description: "Bankdaten, Notfallkontakte und persönliche Präferenzen eigenständig pflegen."
      }
    ]
  }
];

export default function EmployeePortalPage() {
  return (
    <div className="flex h-full flex-1 flex-col bg-muted/20">
      <TopBar title="Mitarbeiter-Portal" showSearch={false} actions={<div />} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
          <section className="space-y-3">
            <h1 className="text-3xl font-semibold text-foreground">Alles für dein Team auf einer Seite</h1>
            <p className="max-w-3xl text-base text-muted-foreground">
              Das Mitarbeiter-Portal bündelt alle internen Prozesse – von der Urlaubsplanung über Schulungsunterlagen
              bis hin zur Kommunikation und zu persönlichen Kennzahlen. Jede Kachel zeigt, welche Funktionen geplant
              sind und wie sie sich in bestehende Workflows einfügen.
            </p>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            {sections.map((section) => (
              <Card key={section.title} className="h-full">
                <CardHeader className="pb-4">
                  <div className="flex items-start gap-4">
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-semibold ${section.accent}`}
                    >
                      <section.icon className="h-6 w-6" />
                    </span>
                    <div className="space-y-1">
                      <CardTitle className="text-xl">{section.title}</CardTitle>
                      <CardDescription>{section.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-2">
                  <ul className="space-y-3">
                    {section.features.map((feature) => (
                      <li key={feature.title} className="flex gap-3">
                        <CheckCircle2 className="mt-1 h-4 w-4 text-primary" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">{feature.title}</p>
                          <p className="text-sm text-muted-foreground">{feature.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}

