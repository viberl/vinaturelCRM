import { useMemo } from "react";
import { Link } from "wouter";
import { ArrowUpDown, MoreHorizontal, MapPin, Mail, Phone } from "lucide-react";
import type { MapCustomer } from "@shared/types/map-customer";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface CustomerTableProps {
  customers: MapCustomer[];
  isLoading?: boolean;
}

const statusVariants: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  potential: "bg-orange-100 text-orange-800",
  inactive: "bg-red-100 text-red-800"
};

const formatLastContact = (iso?: string | null) => {
  if (!iso) return "–";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

export function CustomerTable({ customers, isLoading }: CustomerTableProps) {
  const rows = useMemo(() => {
    return customers.map((customer) => ({
      ...customer,
      statusLabel:
        customer.status === "active"
          ? "Aktiv"
          : customer.status === "potential"
            ? "Potenziell"
            : "Inaktiv",
      lastContactLabel: formatLastContact(customer.lastContact),
    }));
  }, [customers]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Kunden werden geladen ...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-base font-medium">Keine Kunden gefunden</p>
        <p className="text-sm">Bitte prüfen Sie die Filter oder synchronisieren Sie die Daten erneut.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[320px]">
              <Button variant="ghost" className="-ml-3 h-8"
                onClick={() => { /* TODO: Tabelle sortieren */ }}
              >
                Kunde
                <ArrowUpDown className="ml-2 h-4 w-4" />
              </Button>
            </TableHead>
            <TableHead className="w-[120px]">Kundennr.</TableHead>
            <TableHead className="w-[160px]">Kundengruppe</TableHead>
            <TableHead className="w-[160px]">Letzter Kontakt</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Aktionen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((customer) => (
            <TableRow key={customer.id}>
              <TableCell>
                <Link
                  href={`/customer/${customer.id}`}
                  className="flex flex-col"
                >
                  <span className="font-medium text-foreground hover:underline">
                    {customer.name}
                  </span>
                  {customer.company && (
                    <span className="text-xs text-muted-foreground">{customer.company}</span>
                  )}
                </Link>
                <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Mail className="h-3 w-3" />
                    <span className="truncate">{customer.email}</span>
                  </div>
                  {customer.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3" />
                      <span className="truncate">{customer.phone}</span>
                    </div>
                  )}
                  {customer.address && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate" title={customer.address}>{customer.address}</span>
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell className="align-top pt-6">
                <span className="text-sm text-muted-foreground">
                  {customer.customerNumber ?? '–'}
                </span>
              </TableCell>
              <TableCell className="align-top pt-6">
                {customer.customerGroup ? (
                  <Badge variant="secondary" className="text-xs">
                    {customer.customerGroup}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">–</span>
                )}
              </TableCell>
              <TableCell className="align-top pt-6">
                <span className="text-sm text-muted-foreground">
                  {customer.lastContactLabel}
                </span>
              </TableCell>
              <TableCell>
                <Badge className={statusVariants[customer.status] ?? statusVariants.active}>
                  {customer.statusLabel}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Weitere Aktionen</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <Link href={`/customer/${customer.id}`}>
                        Details anzeigen
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a
                        href={customer.email ? `mailto:${customer.email}` : undefined}
                        onClick={(event) => {
                          if (!customer.email) event.preventDefault();
                        }}
                      >
                        E-Mail senden
                      </a>
                    </DropdownMenuItem>
                    {customer.phone && (
                      <DropdownMenuItem asChild>
                        <a href={`tel:${customer.phone}`}>Anrufen</a>
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default CustomerTable;
