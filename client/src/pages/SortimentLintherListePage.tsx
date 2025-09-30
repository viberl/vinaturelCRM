import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import TopBar from "@/components/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";
import type { LintherListeResponse, LintherListeRow } from "@shared/types/linther-liste";
import { ExternalLink } from "lucide-react";
import { isAxiosError } from "axios";

const LINTHER_LISTE_URL =
  "https://vinaturel.sharepoint.com/:x:/s/LintherLager/EdljoQnZIhhPg0qCwi_bAzEB_rjJ1wgYf6IRGP2HXwbA3Q?e=gwZByo";

const initialFormState = {
  palNr: "",
  weinbezeichnung: "",
  artikelnr: "",
  bemerkung: "",
  lagerort: ""
};

type FormState = typeof initialFormState;

export default function SortimentLintherListePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(initialFormState);

  const lintherListeQuery = useQuery({
    queryKey: ["linther-liste"],
    queryFn: async () => {
      const response = await api.get<LintherListeResponse>("/admin-api/linther-liste");
      return response.data;
    },
    refetchOnWindowFocus: false
  });

  const addRowMutation = useMutation({
    mutationFn: async (payload: FormState) => {
      const response = await api.post<LintherListeRow>("/admin-api/linther-liste", payload);
      return response.data;
    },
    onSuccess: () => {
      toast({
        title: "Eintrag gespeichert",
        description: "Die Linther Liste wurde aktualisiert."
      });
      setForm(initialFormState);
      queryClient.invalidateQueries({ queryKey: ["linther-liste"] });
    },
    onError: () => {
      toast({
        title: "Speichern fehlgeschlagen",
        description: "Der Eintrag konnte nicht hinzugefügt werden.",
        variant: "destructive"
      });
    }
  });

  const handleChange = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addRowMutation.mutate(form);
  };

  const isLoading = lintherListeQuery.isLoading || lintherListeQuery.isFetching;
  const data = lintherListeQuery.data;
  const errorText = (() => {
    if (!lintherListeQuery.isError) {
      return "";
    }

    const error = lintherListeQuery.error;
    if (isAxiosError(error)) {
      const serverMessage = error.response?.data as { error?: string } | undefined;
      if (serverMessage?.error) {
        return serverMessage.error;
      }
    }

    return "Linther Liste konnte nicht geladen werden.";
  })();

  return (
    <div className="flex h-full flex-col">
      <TopBar
        title="Linther Liste"
        showSearch={false}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => window.open(LINTHER_LISTE_URL, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink className="h-4 w-4" />
            SharePoint öffnen
          </Button>
        }
      />
      <main className="flex-1 overflow-hidden">
        <div className="flex h-full flex-col gap-6 p-6">
          <Card>
            <CardContent className="p-6">
              <form className="grid grid-cols-1 gap-4 md:grid-cols-5" onSubmit={handleSubmit}>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pal-nr">Pal Nr</Label>
                  <Input
                    id="pal-nr"
                    placeholder="z. B. 1001"
                    value={form.palNr}
                    onChange={handleChange("palNr")}
                  />
                </div>
                <div className="flex flex-col gap-2 md:col-span-2">
                  <Label htmlFor="weinbezeichnung">Weinbezeichnung mit Jahrgang</Label>
                  <Input
                    id="weinbezeichnung"
                    placeholder="z. B. Riesling 2022"
                    value={form.weinbezeichnung}
                    onChange={handleChange("weinbezeichnung")}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="artikelnr">Artikelnr</Label>
                  <Input
                    id="artikelnr"
                    placeholder="Artikelnummer"
                    value={form.artikelnr}
                    onChange={handleChange("artikelnr")}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="lagerort">Lagerort</Label>
                  <Input
                    id="lagerort"
                    placeholder="Ort"
                    value={form.lagerort}
                    onChange={handleChange("lagerort")}
                  />
                </div>
                <div className="flex flex-col gap-2 md:col-span-5">
                  <Label htmlFor="bemerkung">Bemerkung</Label>
                  <Input
                    id="bemerkung"
                    placeholder="Bemerkung"
                    value={form.bemerkung}
                    onChange={handleChange("bemerkung")}
                  />
                </div>
                <div className="md:col-span-5 flex justify-end">
                  <Button type="submit" disabled={addRowMutation.isPending}>
                    {addRowMutation.isPending ? "Speichern…" : "Eintrag hinzufügen"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="flex-1 overflow-hidden">
            <CardContent className="h-full overflow-hidden p-0">
              {isLoading && (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  Liste wird geladen …
                </div>
              )}
              {lintherListeQuery.isError && (
                <div className="flex h-full items-center justify-center px-6 text-center text-destructive">
                  {errorText}
                </div>
              )}
              {!isLoading && !lintherListeQuery.isError && data && (
                <div className="h-full overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pal Nr</TableHead>
                        <TableHead>Weinbezeichnung mit Jahrgang</TableHead>
                        <TableHead>Artikelnr</TableHead>
                        <TableHead>Bemerkung</TableHead>
                        <TableHead>Lagerort</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.palNr}</TableCell>
                          <TableCell>{row.weinbezeichnung}</TableCell>
                          <TableCell>{row.artikelnr}</TableCell>
                          <TableCell>{row.bemerkung}</TableCell>
                          <TableCell>{row.lagerort}</TableCell>
                        </TableRow>
                      ))}
                      {data.rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            Keine Einträge vorhanden.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
