import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Loader2, PackageSearch, Trash2, Plus } from "lucide-react";
import { Link } from "wouter";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import api from "@/lib/api";
import type { CustomerWishlistResponse, CustomerWishlistEntry } from "@shared/types/customer-wishlist";

interface CustomerWishlistSheetProps {
  customerId: string;
  customerName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "–";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "–";
  }

  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function CustomerWishlistSheet({ customerId, customerName, open, onOpenChange }: CustomerWishlistSheetProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [articleNumber, setArticleNumber] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  const { data, isLoading, isFetching, error } = useQuery<CustomerWishlistResponse>({
    queryKey: ["/admin-api/customer", customerId, "wishlist"],
    queryFn: async () => {
      const response = await api.get(`/admin-api/customer/${customerId}/wishlist`);
      return response.data as CustomerWishlistResponse;
    },
    enabled: open && Boolean(customerId),
    staleTime: 60_000,
  });

  const items = useMemo<CustomerWishlistEntry[]>(() => data?.items ?? [], [data?.items]);

  const addMutation = useMutation({
    mutationFn: async (payload: { articleNumber: string }) => {
      const response = await api.post(`/admin-api/customer/${customerId}/wishlist`, payload);
      return response.data as { item: CustomerWishlistEntry | null; code?: string; message?: string };
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["/admin-api/customer", customerId, "wishlist"] });
      setArticleNumber("");
      if (data?.code === 'ALREADY_EXISTS') {
        toast({
          title: 'Bereits vorhanden',
          description: data?.message ?? 'Der Wein befindet sich bereits im Sortiment des Kunden.',
        });
      } else {
        toast({ title: 'Wein hinzugefügt', description: 'Der Wein wurde dem Sortiment des Kunden hinzugefügt.' });
      }
    },
    onError: (mutationError) => {
      const message =
        mutationError && typeof mutationError === "object" && "response" in mutationError
          ? ((mutationError as { response?: { data?: { message?: string } } }).response?.data?.message ?? null)
          : null;
      toast({
        title: "Hinzufügen fehlgeschlagen",
        description: message ?? "Der Wein konnte nicht hinzugefügt werden.",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (entryId: string) => {
      await api.delete(`/admin-api/customer/${customerId}/wishlist/${entryId}`);
    },
    onMutate: (entryId) => {
      setRemovingId(entryId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/admin-api/customer", customerId, "wishlist"] });
      toast({ title: "Wein entfernt", description: "Der Wein wurde aus dem Sortiment des Kunden entfernt." });
    },
    onError: (mutationError) => {
      const message =
        mutationError && typeof mutationError === "object" && "response" in mutationError
          ? ((mutationError as { response?: { data?: { message?: string } } }).response?.data?.message ?? null)
          : null;
      toast({
        title: "Entfernen fehlgeschlagen",
        description: message ?? "Der Wein konnte nicht entfernt werden.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setRemovingId(null);
    },
  });

  const handleAddWine = () => {
    const trimmed = articleNumber.trim();
    if (!trimmed) {
      toast({
        title: "Artikelnummer fehlt",
        description: "Bitte eine gültige Artikelnummer eingeben.",
        variant: "destructive",
      });
      return;
    }

    addMutation.mutate({ articleNumber: trimmed });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="text-left">
          <SheetTitle>Mein Sortiment</SheetTitle>
          <SheetDescription>
            Merkliste von {customerName}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4" />
              <span>
                {items.length} Wein{items.length === 1 ? "" : "e"}
              </span>
            </div>
            {isFetching && !isLoading && <Badge variant="secondary">Aktualisiere…</Badge>}
          </div>

          <div className="grid gap-3 rounded-lg border border-border bg-card/50 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <Input
                value={articleNumber}
                onChange={(event) => setArticleNumber(event.target.value)}
                placeholder="Artikelnummer aus dem Sortiment"
                disabled={addMutation.isPending}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAddWine();
                  }
                }}
              />
              <Button
                className="sm:w-auto"
                onClick={handleAddWine}
                disabled={addMutation.isPending || !articleNumber.trim()}
              >
                {addMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Hinzufügen
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tipp: Artikelnummern findest du in der Sortimentsliste oder im Produktdetail.
            </p>
          </div>

          {isLoading ? (
            <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Merkliste wird geladen…
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
              Merkliste konnte nicht geladen werden.
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <PackageSearch className="h-6 w-6" />
              <span>Keine Weine in der Merkliste vorhanden.</span>
            </div>
          ) : (
            <ScrollArea className="h-[60vh]">
              <div className="rounded-lg border border-border">
                <div className="w-full overflow-x-auto">
                  <Table className="min-w-[900px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">Artikelnummer</TableHead>
                        <TableHead>Wein</TableHead>
                        <TableHead className="w-[160px]">Hersteller</TableHead>
                        <TableHead className="w-[100px]">Jahrgang</TableHead>
                        <TableHead className="w-[100px]">Volumen</TableHead>
                        <TableHead className="w-[140px]">Hinzugefügt am</TableHead>
                        <TableHead className="w-[80px] text-right">Aktion</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                    {items.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-sm text-primary hover:underline">
                          {entry.product.articleNumber ? (
                            <Link href={`/sortiment/${entry.product.id}`} target="_blank" rel="noreferrer">
                              {entry.product.articleNumber}
                            </Link>
                          ) : (
                            '–'
                          )}
                        </TableCell>
                        <TableCell className="text-sm font-medium text-foreground">
                          {entry.product.wineName ?? entry.product.articleNumber ?? "Unbekannter Wein"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {entry.product.winery ?? "–"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {entry.product.vintage ?? "–"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {entry.product.volume ?? "–"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(entry.addedAt)}
                        </TableCell>
                        <TableCell className="w-[80px] text-right pr-6">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeMutation.mutate(entry.id)}
                            disabled={removeMutation.isPending && removingId === entry.id}
                            aria-label="Aus Sortiment entfernen"
                          >
                            {removeMutation.isPending && removingId === entry.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  </Table>
                </div>
              </div>
              <ScrollBar orientation="vertical" />
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
