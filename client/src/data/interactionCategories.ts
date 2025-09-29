import type { LucideIcon } from "lucide-react";
import {
  Phone,
  Mail,
  CalendarPlus,
  MessageCircle,
  PhoneCall,
  NotebookPen,
  ClipboardList,
  MailPlus,
  Archive,
  Sparkles,
  Users,
  Wine,
  Paperclip,
} from "lucide-react";

export type InteractionAction = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export type InteractionCategory = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accentClass: string;
  actions: InteractionAction[];
};

export const INTERACTION_CATEGORIES: InteractionCategory[] = [
  {
    id: "phone",
    title: "Telefonat",
    description: "Telefonische Kontakte dokumentieren oder direkt starten.",
    icon: Phone,
    accentClass: "bg-primary/10 text-primary",
    actions: [
      {
        id: "phone-call",
        label: "Anruf direkt starten",
        description: "Startet den VoIP-Anruf, sofern die Telefonanlage angebunden ist.",
        icon: PhoneCall,
      },
      {
        id: "phone-note",
        label: "Gesprächsnotiz anlegen",
        description: "Dauer, Thema und Ergebnis direkt dokumentieren.",
        icon: NotebookPen,
      },
      {
        id: "phone-follow-up",
        label: "Follow-up Aufgabe automatisch erstellen",
        description: "Legt eine Nachfassaufgabe nach dem Gespräch an.",
        icon: ClipboardList,
      },
    ],
  },
  {
    id: "email",
    title: "E-Mail",
    description: "E-Mails verfassen, archivieren und mit Vorlagen arbeiten.",
    icon: Mail,
    accentClass: "bg-accent/10 text-accent",
    actions: [
      {
        id: "email-compose",
        label: "Direkt aus dem CRM schreiben",
        description: "Vorlagen wählen, Anhänge hinzufügen und sofort versenden.",
        icon: MailPlus,
      },
      {
        id: "email-archive",
        label: "E-Mail automatisch archivieren",
        description: "Die Nachricht wird der Kundenakte automatisch hinzugefügt.",
        icon: Archive,
      },
      {
        id: "email-template",
        label: "Personalisierte Vorlagen",
        description: "Z. B. Angebotsmail oder Einladung zur Verkostung vorbereiten.",
        icon: Sparkles,
      },
    ],
  },
  {
    id: "meeting",
    title: "Termin / Verkostung",
    description: "Besprechungen und Verkostungen planen und dokumentieren.",
    icon: CalendarPlus,
    accentClass: "bg-secondary/10 text-secondary",
    actions: [
      {
        id: "meeting-create",
        label: "Termin erstellen",
        description: "Mit Outlook oder Google synchronisieren und direkt planen.",
        icon: CalendarPlus,
      },
      {
        id: "meeting-attendees",
        label: "Teilnehmer einladen",
        description: "Kunden und Teammitglieder in einem Schritt einladen.",
        icon: Users,
      },
      {
        id: "meeting-notes",
        label: "Agenda/Notizen verknüpfen",
        description: "Agenda vorbereiten und Besprechungsnotizen anhängen.",
        icon: NotebookPen,
      },
      {
        id: "tasting-wines",
        label: "Verkostete Weine erfassen",
        description: "Bei Verkostungen die probierten Weine dokumentieren.",
        icon: Wine,
      },
    ],
  },
  {
    id: "chat",
    title: "Chat / WhatsApp",
    description: "Schnelle Nachrichten oder Chats erfassen und ergänzen.",
    icon: MessageCircle,
    accentClass: "bg-muted text-muted-foreground",
    actions: [
      {
        id: "chat-start",
        label: "Konversation dokumentieren oder starten",
        description: "Chats erfassen oder direkt im angebundenen Kanal beginnen.",
        icon: MessageCircle,
      },
      {
        id: "chat-attachments",
        label: "Screenshots/Dateien hinzufügen",
        description: "Unterstützende Dateien und Medien an die Interaktion anhängen.",
        icon: Paperclip,
      },
    ],
  },
];

export const getInteractionCategory = (categoryId: string) =>
  INTERACTION_CATEGORIES.find((category) => category.id === categoryId);
