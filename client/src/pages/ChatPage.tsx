import React, { useEffect, useMemo, useState } from "react";
import * as microsoftTeams from "@microsoft/teams-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TeamsContext = microsoftTeams.app.Context;

function isRunningInsideMicrosoftTeams(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const ua = window.navigator?.userAgent?.toLowerCase?.() ?? "";
  const teamsIndicators = ["teams/", "electron/", "msteams" /* desktop */];
  const inIframe = window.self !== window.top;

  return inIframe || teamsIndicators.some((indicator) => ua.includes(indicator));
}

const ChatPage: React.FC = () => {
  const defaultRecipientFromEnv = useMemo(
    () => import.meta.env.VITE_TEAMS_DEFAULT_CHAT_UPN ?? "",
    []
  );
  const [context, setContext] = useState<TeamsContext | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isTeamsHost, setIsTeamsHost] = useState<boolean>(false);
  const [recipient, setRecipient] = useState<string>(defaultRecipientFromEnv);
  const [message, setMessage] = useState<string>("");
  const chatSupported = useMemo(() => {
    try {
      return microsoftTeams.chat.isSupported();
    } catch {
      return false;
    }
  }, [initializing]);

  useEffect(() => {
    let isMounted = true;

    const initTeamsSdk = async () => {
      try {
        const isTeams = isRunningInsideMicrosoftTeams();

        if (!isTeams) {
          setIsTeamsHost(false);
          setInfo(
            "Die Teams-Integration steht nur innerhalb von Microsoft Teams zur Verfügung. Du kannst die Seite hier trotzdem ansehen; funktionale Teams-Aktionen werden aber deaktiviert."
          );
          return;
        }

        setIsTeamsHost(true);
        setInfo(null);
        await microsoftTeams.app.initialize();

        if (typeof microsoftTeams.initialize === "function") {
          try {
            microsoftTeams.initialize();
          } catch (legacyError) {
            console.warn("Teams legacy initialize failed", legacyError);
          }
        }

        const appContext = await microsoftTeams.app.getContext();

        if (!isMounted) {
          return;
        }

        setContext(appContext);

        if (typeof microsoftTeams.getContext === "function") {
          microsoftTeams.getContext((legacyContext) => {
            if (!isMounted) {
              return;
            }

            setContext((current) => current ?? (legacyContext as unknown as TeamsContext));
          });
        }

        if (!defaultRecipientFromEnv && appContext.user?.userPrincipalName) {
          setRecipient(appContext.user.userPrincipalName);
        }
      } catch (sdkError) {
        if (!isMounted) {
          return;
        }
        const message =
          sdkError instanceof Error ? sdkError.message : String(sdkError);
        if (
          typeof message === "string" &&
          message.toLowerCase().includes("no parent window")
        ) {
          setError(
            "Die Teams-Integration konnte nicht initialisiert werden, weil kein Teams-Host gefunden wurde. Stelle sicher, dass diese Seite als App/Tab in Microsoft Teams läuft."
          );
        } else {
          setError(
            message ||
              "Teams SDK konnte nicht initialisiert werden. Bitte überprüfe, ob die Seite in Microsoft Teams gehostet wird."
          );
        }
      } finally {
        if (isMounted) {
          setInitializing(false);
        }
      }
    };

    initTeamsSdk();

    return () => {
      isMounted = false;
    };
  }, [defaultRecipientFromEnv]);

  const handleOpenChat = async () => {
    setError(null);

    if (!recipient) {
      setError("Bitte gib die Microsoft 365 E-Mail-Adresse eines Empfängers an.");
      return;
    }

    try {
      await microsoftTeams.chat.openChat({
        user: recipient,
        message: message.trim() ? message.trim() : undefined,
      });
    } catch (openChatError) {
      const message =
        openChatError instanceof Error
          ? openChatError.message
          : String(openChatError);
      setError(
        message ||
          "Der Teams-Chat konnte nicht geöffnet werden. Bitte versuche es erneut."
      );
    }
  };

  const userDisplayName = context?.user?.displayName ?? "Unbekannter Benutzer";
  const hostClientType = context?.app?.host?.clientType ?? "Unbekannter Host";

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto p-6">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Team-Chat</h1>
        <p className="text-sm text-muted-foreground">
          Diese Seite initialisiert das Microsoft Teams JavaScript SDK, ruft den
          aktuellen Kontext ab und öffnet Chats über die Teams-API statt über
          feste URLs.
        </p>
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-medium text-foreground">Status</h2>
        <div className="grid gap-2 text-sm text-muted-foreground">
          <div>
            <span className="font-semibold text-foreground">Initialisierung:&nbsp;</span>
            {initializing ? "läuft…" : error ? "fehlgeschlagen" : "erfolgreich"}
          </div>
          <div>
            <span className="font-semibold text-foreground">Angemeldet als:&nbsp;</span>
            {userDisplayName}
          </div>
          <div>
            <span className="font-semibold text-foreground">Host-Client:&nbsp;</span>
            {hostClientType}
          </div>
        </div>
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {!error && info && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            {info}
          </div>
        )}
      </section>

      <section className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="space-y-2">
          <Label htmlFor="teams-chat-recipient">Empfänger (UPN/E-Mail)</Label>
          <Input
            id="teams-chat-recipient"
            value={recipient}
            placeholder="person@example.com"
            onChange={(event) => setRecipient(event.target.value)}
            disabled={initializing}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="teams-chat-message">Nachricht (optional)</Label>
          <Textarea
            id="teams-chat-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Kurze Nachricht, die im Teams-Chat vorbefüllt wird"
            disabled={initializing}
          />
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={handleOpenChat} disabled={initializing || !chatSupported}>
            Teams-Chat öffnen
          </Button>
          {!chatSupported && isTeamsHost && (
            <span className="text-sm text-muted-foreground">
              Chat-Funktion vom aktuellen Host nicht unterstützt.
            </span>
          )}
          {!isTeamsHost && (
            <span className="text-sm text-muted-foreground">
              Teams-Chat ist außerhalb von Microsoft Teams deaktiviert.
            </span>
          )}
        </div>
      </section>

      <section className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 p-10 text-center text-muted-foreground">
        Teams Chat hier
      </section>
    </div>
  );
};

export default ChatPage;
