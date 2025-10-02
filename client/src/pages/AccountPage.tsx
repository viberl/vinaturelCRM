import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import api from "@/lib/api";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Aktuelles Passwort ist erforderlich"),
  newPassword: z
    .string()
    .min(8, "Neues Passwort muss mindestens 8 Zeichen lang sein"),
  confirmPassword: z.string().min(1, "Bitte bestätigen Sie Ihr neues Passwort"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Die Passwörter stimmen nicht überein",
  path: ["confirmPassword"],
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

export default function AccountPage() {
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [hasUnsavedImage, setHasUnsavedImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(user?.profileImageUrl ?? null);

  useEffect(() => {
    if (!hasUnsavedImage) {
      setPreviewImage(user?.profileImageUrl ?? null);
    }
  }, [user?.profileImageUrl, hasUnsavedImage]);

  const displayName = user?.name || user?.email || "Benutzer";
  const initials = displayName
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2) || "NN";

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const handleSubmit = async (values: PasswordFormValues) => {
    setIsSubmitting(true);
    try {
      const { data } = await api.patch("/admin-api/me/password", {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });

      if (!data?.success) {
        const message = data?.message ?? "Passwort konnte nicht aktualisiert werden";
        throw new Error(message);
      }

      toast({
        title: "Passwort aktualisiert",
        description: "Ihr Passwort wurde erfolgreich geändert.",
      });
      form.reset();
    } catch (error) {
      toast({
        title: "Aktualisierung fehlgeschlagen",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "Datei zu groß",
        description: "Bitte wählen Sie ein Bild mit maximal 5 MB.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (result) {
        setPreviewImage(result);
        setHasUnsavedImage(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setPreviewImage(null);
    setHasUnsavedImage(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSaveImage = async () => {
    if (!hasUnsavedImage) {
      toast({
        title: "Keine Änderungen",
        description: "Es gibt keine Änderungen zu speichern.",
      });
      return;
    }

    setIsUploading(true);
    try {
      const { data } = await api.patch("/admin-api/me/profile-image", {
        image: previewImage ?? null,
      });

      if (!data?.success) {
        const message = data?.message ?? "Profilbild konnte nicht aktualisiert werden";
        throw new Error(message);
      }

      toast({
        title: "Profilbild aktualisiert",
        description: data?.message ?? "Ihr Profilbild wurde gespeichert.",
      });
      setHasUnsavedImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await refreshUser();
    } catch (error) {
      toast({
        title: "Upload fehlgeschlagen",
        description: error instanceof Error ? error.message : "Unbekannter Fehler", 
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="flex h-full justify-center overflow-y-auto bg-background">
      <div className="w-full max-w-xl px-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Mein Konto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold text-muted-foreground">Profilbild</h2>
                  <p className="text-sm text-muted-foreground">
                    Laden Sie ein quadratisches Bild hoch. Unterstützte Formate: PNG, JPG, GIF, WebP (max. 5 MB).
                  </p>
                </div>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <Avatar className="h-20 w-20">
                    {previewImage ? (
                      <AvatarImage src={previewImage} alt={displayName} />
                    ) : (
                      <AvatarFallback>{initials}</AvatarFallback>
                    )}
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Bild auswählen
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleRemoveImage}
                        disabled={!previewImage && !user?.profileImageUrl}
                      >
                        Bild entfernen
                      </Button>
                    </div>
                    {hasUnsavedImage && (
                      <p className="text-xs text-muted-foreground">
                        Änderungen wurden noch nicht gespeichert.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleSaveImage}
                    disabled={isUploading || !hasUnsavedImage}
                  >
                    {isUploading ? "Speichern..." : "Profilbild speichern"}
                  </Button>
                </div>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground">
                  Passwort ändern
                </h2>
                <p className="text-sm text-muted-foreground">
                  Aktualisieren Sie Ihr Passwort, indem Sie Ihr aktuelles Passwort bestätigen und ein neues festlegen.
                </p>
              </div>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="currentPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Aktuelles Passwort</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="current-password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Neues Passwort</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="new-password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Neues Passwort bestätigen</FormLabel>
                        <FormControl>
                          <Input type="password" autoComplete="new-password" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end">
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Speichern..." : "Passwort speichern"}
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
